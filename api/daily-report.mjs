/*
 * تقرير آخر النهار — يتبعث أوتوماتيكياً كل يوم على 00:00 بتوقيت الجزائر.
 *
 * الـ cron تاع Netlify يخدم بـ UTC، والجزائر UTC+1 بلا توقيت صيفي، يعني
 * 23:00 UTC = 00:00 عندنا. علاش `0 23 * * *`.
 *
 * التقرير يغطّي **النهار اللي كمل**: كي يجي 00:00، النهار تبدّل من ثواني،
 * فنحسبو التاريخ من ساعة لور (23:00 تاع البارح) باش نجيبو النهار الصح.
 *
 * تقدر تشغّلو باليد للتجريب:
 *   curl "https://<موقعك>.netlify.app/api/daily-report?key=<SECRET>"
 */
import {
  listOrdersForDay, algiersDate, listAwaitingDelivery, listAwaitingReturnReceipt, getCosts,
  rebuildOpenIndex,
} from '../lib/store.mjs';
import { stockLines } from '../lib/stock-view.mjs';
import { dz, esc, profitFor, goodsTotal } from '../lib/message.mjs';
import { listOpenLeads, sweepLeads } from '../lib/leads.mjs';
import { authorized } from '../lib/cron-auth.mjs';
import { runShipmentJobs } from '../lib/ecotrack/sync.mjs';
import { toVercel } from '../lib/http.mjs';

/* الجدولة ولّات في vercel.json ("crons") — Vercel ما يقراش config هنا */

const TELEGRAM_TIMEOUT_MS = 10_000;

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not configured');

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(`Telegram ${response.status}: ${result.description ?? 'unknown error'}`);
  }
}

/*
 * "مقبول" ماشي فلوس حقيقية — الطلبية تقدر ترجع مع المُوصّل. الفلوس
 * الحقيقية هي غير الطلبات اللي "توصّلت" فعلاً (deliveryStatus === 'delivered').
 * علاش المداخيل تتحسب من `delivered` وماشي من `accepted`.
 */
export function buildReport(day, orders, awaiting = [], awaitingReturn = [], stock = null, costs = null, openLeads = []) {
  const lines = [`<b>📊 تقرير ${day}</b>`, ''];

  if (!orders.length) {
    lines.push('لم يصل أي طلب اليوم.');
  } else {
    const accepted = orders.filter((o) => o.status === 'accepted');
    const denied = orders.filter((o) => o.status === 'denied');
    const pending = orders.filter((o) => o.status === 'pending');
    const delivered = accepted.filter((o) => o.deliveryStatus === 'delivered');
    const returnedOrders = accepted.filter((o) => o.deliveryStatus === 'returned');
    const returnedNotReceived = returnedOrders.filter((o) => !o.returnReceivedAt);
    const stillShipping = accepted.filter((o) => !o.deliveryStatus);

    const revenue = delivered.reduce((sum, o) => sum + goodsTotal(o), 0);
    const units = delivered.reduce((sum, o) => sum + (o.qty ?? 0), 0);
    /*
     * الربح الصافي التقديري: ربح الطلبات اللي توصّلت، ناقص خسارة الرجعة
     * تاع الطلبات اللي رجعت. مبني على costs (من getCosts في store.mjs —
     * تتبدّل بـ /cost في تيليغرام) + COURIER_COST الثابتة في message.mjs.
     */
    const profit = costs
      ? delivered.reduce((sum, o) => sum + profitFor(o, costs), 0)
        + returnedOrders.reduce((sum, o) => sum + profitFor(o, costs), 0)
      : null;

    lines.push(
      `📥 الطلبات: <b>${orders.length}</b>`,
      `✅ مقبولة: <b>${accepted.length}</b>`,
      `❌ مرفوضة: <b>${denied.length}</b>`,
    );
    if (pending.length) lines.push(`⏳ بانتظار قرار: <b>${pending.length}</b>`);

    lines.push(
      '',
      `📦 وصلت: <b>${delivered.length}</b>${units ? ` (${units} طوق)` : ''}`,
      `↩️ أُرجعت: <b>${returnedOrders.length}</b>${returnedNotReceived.length ? ` (${returnedNotReceived.length} لم تصل بعد إلى المحل)` : ''}`,
    );
    if (stillShipping.length) lines.push(`🚚 في الطريق (بدون نتيجة بعد): <b>${stillShipping.length}</b>`);

    lines.push('', `💰 إيرادات فعلية (طلبات وصلت): <b>${dz(revenue)}</b>`);
    if (profit !== null) lines.push(`💵 الربح الصافي التقديري: <b>${dz(profit)}</b>`);

    if (denied.length) {
      lines.push('', '<b>أسباب الرفض:</b>');
      for (const order of denied) {
        lines.push(`• ${esc(order.name)} — ${esc(order.reason || 'بدون سبب')}`);
      }
    }

    if (pending.length) {
      lines.push('', '<b>طلبات بانتظار قرار:</b>');
      for (const order of pending) {
        lines.push(`• ${esc(order.name)} — ${esc(order.wilaya)} — ${dz(order.total ?? 0)}`);
      }
    }
  }

  /* عبر كل الأيام — طلبات مقبولة ما وصلاتش لنتيجة توصيل بعد، حتى لو قديمة */
  if (awaiting.length) {
    lines.push('', `<b>⏳ كل الطلبات المعلّقة عند التوصيل (${awaiting.length}):</b>`);
    for (const order of awaiting) {
      lines.push(`• ${esc(order.name)} — ${esc(order.wilaya)} — ${dz(order.total ?? 0)} — ${esc(order.day ?? '')}`);
    }
  }

  /* رجعت مع المُوصّل بصح لسّا ما وصلاتش فيزيائياً للمحل — المخزون ما تزادش بعد */
  const returnQty = awaitingReturn.reduce((sum, o) => sum + (o.qty ?? 0), 0);
  if (awaitingReturn.length) {
    lines.push('', `<b>📥 مُرجَعات بانتظار الوصول إلى المحل (${awaitingReturn.length}${returnQty ? ` — ${returnQty} طوق` : ''}):</b>`);
    for (const order of awaitingReturn) {
      lines.push(`• ${esc(order.name)} — ${esc(order.wilaya)} — ${dz(order.total ?? 0)} — ${esc(order.day ?? '')}`);
    }
  }

  /*
   * ناس عمّرو رقمهم وما كمّلوش. يبانو هنا على خاطر هذا هو الوقت اللي
   * تقعد فيه تشوف نهارك — واللائحة هذي هي أرخص فلوس تقدر تجيبها غدوة:
   * الزبون كان راه يشري، وما يحتاج غير مكالمة.
   */
  if (openLeads.length) {
    const worth = openLeads.reduce((sum, lead) => sum + (lead.cartTotal ?? 0), 0);
    lines.push('', `<b>🔔 طلبات غير مكتملة (${openLeads.length}${worth ? ` — ${dz(worth)}` : ''}):</b>`);
    /* نوقفو على 10: التقرير لازم يتقرا في تيليغرام، و/leads توريهم كامل */
    for (const lead of openLeads.slice(0, 10)) {
      const name = lead.name ? esc(lead.name) : 'بدون اسم';
      const place = lead.wilaya ? ` — ${esc(lead.wilaya)}` : '';
      lines.push(`• ${name}${place} — ${esc(lead.phone)}${lead.contactedAt ? ' 📞' : ''}`);
    }
    if (openLeads.length > 10) lines.push(`… و${openLeads.length - 10} آخرين — /leads`);
  }

  /*
   * نفس الأسطر اللي يعطيها /stock بالضبط (lib/stock-view.mjs).
   *
   * ⚠️ قبل، هنا كان يتعرض العدّاد العام وحدو مكتوب "المخزون الحالي:
   * <n> طوق". كي ولّاو المنتجات عندهم عدّادات وحدهم، التقرير بقا يعدّ
   * العدّاد القديم برك — يقول 1 و/stock يقول 4، والزوج صحاح. رقمين
   * بنفس الاسم أخطر من رقم غالط: تصدّق واحد فيهم وتشري ولا تبيع عليه.
   */
  if (stock?.lines?.length) {
    lines.push('', '📦 <b>المخزون</b>', ...stock.lines);
    if (returnQty) {
      lines.push('', `🔁 مُرجَعات معلّقة (لم تُضف بعد): <b>${returnQty}</b> — تتزاد للمخزون كي توصل`);
    }
  }

  return lines.join('\n');
}

async function handler(request) {
  if (!authorized(request)) return new Response('Forbidden', { status: 403 });

  /*
   * نزامنو الطرود قبل ما نكتبو التقرير — بلا هذا، التقرير يحكي على
   * حالة البارح والطردة اللي وصلات اليوم تبان "في الطريق". الفشل ما
   * يوقّفش التقرير: الأرقام تتبعث على أي حال.
   */
  await runShipmentJobs().catch((error) =>
    console.error('Shipment sync failed:', error.message));

  /* ساعة لور = ما زلنا في النهار اللي كمل، حتى لو تشغّل على 00:00 بالضبط */
  const dayJustEnded = algiersDate(new Date(Date.now() - 60 * 60 * 1000));

  try {
    /*
     * الكنس قبل التقرير: أي lead حبس ولا وصلو إشعار (نهار بلا حركة =
     * ما نادى حتى واحد الكنس) يوصل دروك، وياخذ notifiedAt — باش ما
     * يبانش في التقرير كأنّو ما تعالجش وهو راه تبعث توّ.
     */
    await sweepLeads().catch(() => {});

    /*
     * إعادة بناء فهرس الطلبات المفتوحة، مرّة في النهار.
     *
     * الفهرس يتحدّث مع كل كتابة، فنظرياً يبقى مضبوط. عملياً، كتابة
     * تقدر تطيح بين تسجيل الطلب وتسجيلو في الفهرس (الشبكة، الفنكشن
     * توقّفت). هنا المسح الكامل يصير مرّة وحدة في 24 ساعة ويصلّح أي
     * انحراف — بدل ما نخلّيو صفّ المكالمات يمسح الأرشيف في كل نقرة.
     */
    await rebuildOpenIndex().catch((error) =>
      console.error('Open-order index rebuild failed:', error.message));

    const orders = await listOrdersForDay(dayJustEnded);
    const [awaiting, awaitingReturn, stock, costs, openLeads] = await Promise.all([
      listAwaitingDelivery(), listAwaitingReturnReceipt(),
      /* أرقام /restock ما تنفعش في تقرير — والتقص باش التقرير يبقى
         تقرير، ماشي جرد كامل كل ليلة */
      stockLines({ withIndexes: false, limit: 12 }).catch(() => null), getCosts(),
      listOpenLeads().catch(() => []),
    ]);
    const report = buildReport(dayJustEnded, orders, awaiting, awaitingReturn, stock, costs, openLeads);
    await sendTelegram(report);
    console.log(`Daily report sent for ${dayJustEnded}: ${orders.length} orders`);
    return new Response(JSON.stringify({ ok: true, day: dayJustEnded, orders: orders.length }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    console.error('Daily report failed:', error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

/* توقيع Vercel هو (req,res) — الجسر في lib/http.mjs */
export default toVercel(handler);
