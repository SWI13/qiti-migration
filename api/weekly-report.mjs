/*
 * تقرير أسبوعي — يتبعث أوتوماتيكياً كل يوم الإثنين على 00:00 بتوقيت الجزائر.
 *
 * نفس حيلة daily-report.mjs: الـ cron تاع Netlify يخدم بـ UTC، والجزائر
 * UTC+1 بلا توقيت صيفي. 00:00 عندنا يوم الإثنين = 23:00 UTC يوم **الأحد**
 * (اليوم اللي قبل — UTC لم تصل بعد ما دخلش الإثنين). فـ day-of-week في الجدول
 * لازم يكون "الأحد" وماشي "الإثنين"، وإلا التقرير يتبعث بيوم كامل متأخّر.
 * الأحد = `0` في جدول cron الكلاسيكي (0=الأحد … 6=السبت)، علاش `0 23 * * 0`.
 *
 * التقرير يغطّي **آخر 7 أيام كاملة** (الإثنين للأحد اللي فات). store.mjs
 * ما فيهاش استعلام مدى تواريخ، فنستعملو listOrdersForDay() مرّة لكل يوم
 * من السبعة ونجمعو النتائج — نفس منطق المفتاح (YYMMDD-xxxxx) اللي تعتمد
 * عليه الفنكشنز الأخرى، بلا ما نعاودو نخترعوه.
 *
 * تقدر تشغّلو باليد للتجريب:
 *   curl "https://<موقعك>/api/weekly-report?key=<SECRET>"
 */
import { listOrdersForDay, algiersDate } from '../lib/store.mjs';
import { dz, esc, goodsTotal } from '../lib/message.mjs';
import { authorized } from '../lib/cron-auth.mjs';
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
 * نفس منطق daily-report.mjs: "مقبول" ماشي فلوس حقيقية (تقدر ترجع مع
 * المُوصّل)، فالإيرادات تتحسب من `delivered` وماشي من `accepted`.
 */
export function buildWeeklyReport(weekStart, weekEnd, orders) {
  const lines = [`<b>📈 تقرير الأسبوع (${weekStart} → ${weekEnd})</b>`, ''];

  if (!orders.length) {
    lines.push('لم يكن حتى طلب هاد الأسبوع.');
    return lines.join('\n');
  }

  const accepted = orders.filter((o) => o.status === 'accepted');
  const denied = orders.filter((o) => o.status === 'denied');
  const pending = orders.filter((o) => o.status === 'pending');
  const delivered = accepted.filter((o) => o.deliveryStatus === 'delivered');
  const returnedOrders = accepted.filter((o) => o.deliveryStatus === 'returned');

  const revenue = delivered.reduce((sum, o) => sum + goodsTotal(o), 0);
  const units = delivered.reduce((sum, o) => sum + (o.qty ?? 0), 0);

  lines.push(
    `📥 مجموع الطلبات: <b>${orders.length}</b>`,
    `✅ مقبولة: <b>${accepted.length}</b>`,
    `❌ مرفوضة: <b>${denied.length}</b>`,
  );
  if (pending.length) lines.push(`⏳ ما زال بانتظار قرار (أقدم من أسبوع): <b>${pending.length}</b>`);

  lines.push(
    '',
    `📦 وصلت: <b>${delivered.length}</b>${units ? ` (${units} طوق)` : ''}`,
    `↩️ أُرجعت: <b>${returnedOrders.length}</b>`,
    '',
    `💰 إيرادات فعلية (طلبات وصلت): <b>${dz(revenue)}</b>`,
  );

  if (delivered.length) {
    lines.push(`💵 متوسّط قيمة الطلبية الموصّلة: <b>${dz(Math.round(revenue / delivered.length))}</b>`);
  }

  const byWilaya = new Map();
  for (const order of orders) {
    const key = order.wilaya || 'غير معروفة';
    byWilaya.set(key, (byWilaya.get(key) ?? 0) + 1);
  }
  const topWilaya = [...byWilaya.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topWilaya) lines.push(`🏆 أكثر ولاية طلبات: <b>${esc(topWilaya[0])}</b> (${topWilaya[1]})`);

  if (pending.length) {
    lines.push('', '<b>طلبات تستنّى قرار من زمان:</b>');
    for (const order of pending) {
      lines.push(`• ${esc(order.name)} — ${esc(order.wilaya)} — ${dz(order.total ?? 0)}`);
    }
  }

  return lines.join('\n');
}

async function handler(request) {
  if (!authorized(request)) return new Response('Forbidden', { status: 403 });

  /* ساعة لور = نفس حيلة daily-report.mjs، باش نبقاو في الأسبوع اللي كمل حتى لو تشغّل على 00:00 بالضبط */
  const anchor = new Date(Date.now() - 60 * 60 * 1000);
  const days = Array.from({ length: 7 }, (_, i) => algiersDate(new Date(anchor.getTime() - i * 24 * 60 * 60 * 1000)));
  const weekEnd = days[0];
  const weekStart = days[days.length - 1];

  try {
    const ordersByDay = await Promise.all(days.map((day) => listOrdersForDay(day)));
    const orders = ordersByDay.flat();
    const report = buildWeeklyReport(weekStart, weekEnd, orders);
    await sendTelegram(report);
    console.log(`Weekly report sent for ${weekStart} → ${weekEnd}: ${orders.length} orders`);
    return new Response(JSON.stringify({ ok: true, weekStart, weekEnd, orders: orders.length }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    console.error('Weekly report failed:', error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

/* توقيع Vercel هو (req,res) — الجسر في lib/http.mjs */
export default toVercel(handler);
