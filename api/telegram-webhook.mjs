/*
 * يستقبل نقرات الأزرار (تأكيد بالتيليفون / قبول / رفض / توصّل / رجعت /
 * استلمت الرجعة / تأكيد ولا إلغاء /clear)، جواب سبب الرفض، وأوامر
 * المخزون/التكاليف/حالة الطلبات (/state, /stock, /restock, /setstock,
 * /cost, /clear) من تيليغرام.
 *
 * ── تأكيد بالتيليفون (قبل القبول) ───────────────────────────────────
 *   البحث كامل يقول نفس الحاجة: الطلبات اللي تتبعث بلا مكالمة تأكيد
 *   ترجع أكثر بـ 15-25 نقطة. علاش زدنا زر "📞 تأكدت بالتيليفون" يبان
 *   فوق أزرار القرار.
 *
 *   ما نمنعوش القبول بلا تأكيد قصداً — نسجّلو `confirmedBeforeAccept`
 *   على كل طلب مقبول، باش من بعد تقارن نسبة الرجعات بين المؤكّد وماشي
 *   المؤكّد، وتشوف بأرقامك انت واش المكالمة تستاهل الوقت ولا لا.
 *
 * ── قبول ─────────────────────────────────────────────────────────────
 *   نقرة → الرسالة تتبدّل وتزيد "✅ مقبول — شكون · الوقت"، أزرار القرار
 *   تتبدّل بزوج أزرار "📦 توصّل" / "↩️ رجعت" (زر واتساب يبقى)، والمخزون
 *   ينقص بكمية الطلب. إذا هبط للحد ولا تحتو، يتبعث تنبيه مخزون وحدة برك.
 *   وإذا المخزون ما يكفيش قبل القبول، القبول يتردّ والطلب يبقى بلا قرار.
 *
 * ── رفض ──────────────────────────────────────────────────────────────
 *   نقرة → البوت يردّ على الرسالة ويطلب السبب (ForceReply، يحلّ الكيبورد
 *   مباشرة). كي تكتب السبب، رسالة الطلب تتبدّل وتزيد "❌ مرفوض" + السبب،
 *   ورسالة السؤال تتمسح.
 *
 * ── توصّل / رجعت (بعد القبول) ──────────────────────────────────────
 *   الطلب يبقى "مقبول" لأيام قبل ما نعرفو واش وصل فعلاً ولا رجع مع
 *   المُوصّل — علاش الأزرار تبقى بايّنة في نفس الرسالة، وتبان في /state
 *   وتقرير آخر النهار حتى لو ماشي من نفس اليوم.
 *
 *   "رجعت" ما تزيدش المخزون فوراً — غير تعلّم إنو المُوصّل رجّعها. الطلبية
 *   فيزيائياً تاخذ يوم ولا يومين باش توصل لعندك، فتبان زر جديد "📥 استلمت
 *   الرجعة" — هو اللي يزيد الكمية للمخزون فعلياً، كي تتأكّد إنها بين يديك.
 *
 * الحالة كاملة تتخزّن في Netlify Blobs باش /state وتقرير آخر النهار يقراوها.
 *
 * ── environment variables ────────────────────────────────────────────
 *   TELEGRAM_BOT_TOKEN       — نفس التوكن تاع order.mjs
 *   TELEGRAM_WEBHOOK_SECRET  — كلمة سرّ تخترعها انت (أي نص عشوائي)
 *   TELEGRAM_CHAT_ID         — نفس id تاع order.mjs، يخدم هنا باش يحصر
 *                              الأوامر (/state, /stock...) في الگروب/الشات تاعك برك
 *
 * ── تشبيك الـ webhook (مرّة وحدة بعد الـ deploy) ─────────────────────
 *   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *     -d "url=https://<موقعك>.netlify.app/api/telegram-webhook" \
 *     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
 */
import {
  getOrder, updateOrder, rememberReplyPrompt, resolveReplyPrompt, forgetReplyPrompt,
  getStock, adjustStock, setStock, markLowStockAlerted, resetStock,
  getStockForOrder, adjustStockForOrder, markLowStockAlertedForOrder,
  listPendingOrders, listAwaitingDelivery, listAwaitingReturnReceipt,
  getCosts, setCost, clearAllOrders, clearAllReplyPrompts,
  blockPhone, unblockPhone, listBlocked, normalizeDzPhone,
} from '../lib/store.mjs';
import { ownerMessage, buttonsFor, esc, dz, elapsedLabel, costSnapshotOf } from '../lib/message.mjs';
import { sendMetaEvent } from '../lib/meta.mjs';
import { getProduct, listProducts, listStockFor } from '../lib/catalog.mjs';
import { siteUrl } from '../lib/site.mjs';

const TELEGRAM_TIMEOUT_MS = 10_000;
const MAX_REASON_LENGTH = 200;

async function telegram(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(`Telegram ${method} ${response.status}: ${result.description ?? 'unknown error'}`);
  }
  return result.result;
}

const displayName = (from) =>
  [from?.first_name, from?.last_name].filter(Boolean).join(' ') || 'مجهول';

/**
 * يعاود يرسم رسالة الطلب من الطلب المخزّن (ماشي من نص تيليغرام) — هكذا
 * التنسيق يبقى مضبوط وما نعتمدوش على واش يرجّعلنا تيليغرام.
 */
async function repaintOrder(chatId, record) {
  if (!record?.messageId) return;
  await telegram('editMessageText', {
    chat_id: chatId,
    message_id: record.messageId,
    text: ownerMessage(record),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: buttonsFor(record),
  });
}

/** كي المخزون يهبط للحد أو تحتو، يتبعث تنبيه وحدة برك (ماشي في كل طلب) */
async function checkLowStock(chatId, stock, order = null) {
  if (!stock || stock.qty > stock.threshold || stock.lowStockAlerted) return;
  /* نسمّيو الفاريانت باش تعرف أشمن مقاس خلص، ماشي "المخزون" برك */
  const what = order?.variant?.options && Object.keys(order.variant.options).length
    ? Object.values(order.variant.options).join(' / ')
    : 'المنتج';
  await telegram('sendMessage', {
    chat_id: chatId,
    text: `⚠️ <b>تنبيه مخزون</b>\n${esc(what)}: باقي <b>${stock.qty}</b> فقط — وقت التزويد!`,
    parse_mode: 'HTML',
  }).catch((error) => console.error('Low stock alert failed:', error.message));
  await markLowStockAlertedForOrder(order, true)
    .catch((error) => console.error('markLowStockAlerted failed:', error.message));
}

/** تأكيد/إلغاء /clear — فعل عام ماشي مربوط بطلب وحدو، علاش معزول برّا منطق الطلبات */
async function handleClearConfirmation(query, confirmed) {
  const message = query.message;
  const answer = (text) =>
    telegram('answerCallbackQuery', { callback_query_id: query.id, ...(text ? { text } : {}) })
      .catch((error) => console.error('answerCallbackQuery failed:', error.message));

  if (!confirmed) {
    await telegram('editMessageText', {
      chat_id: message.chat.id, message_id: message.message_id,
      text: '❌ تراجعت — ما تبدّل حتى حاجة.',
    }).catch(() => {});
    return answer('تراجعت ✅');
  }

  try {
    const deletedCount = await clearAllOrders();
    await clearAllReplyPrompts().catch((error) => console.error('clearAllReplyPrompts failed:', error.message));
    await resetStock();
    await telegram('editMessageText', {
      chat_id: message.chat.id, message_id: message.message_id,
      text: `🗑️ <b>تمسح كلش</b> — ${deletedCount} طلب اتمسحو، والمخزون رجع لصفر.`,
      parse_mode: 'HTML',
    }).catch(() => {});
    return answer('تمسح كلش 🗑️');
  } catch (error) {
    console.error('/clear failed:', error.message);
    return answer('صار خطأ، عاود حاول.');
  }
}

/* ── نقرة زر ─────────────────────────────────────────────────────── */
async function handleCallback(query) {
  const message = query.message;
  const data = String(query.data ?? '');

  if (data === 'clear-yes' || data === 'clear-no') {
    if (!message) return;
    return handleClearConfirmation(query, data === 'clear-yes');
  }

  const [action, orderId] = data.split(':');
  const who = displayName(query.from);

  const answer = (text) =>
    telegram('answerCallbackQuery', { callback_query_id: query.id, ...(text ? { text } : {}) })
      .catch((error) => console.error('answerCallbackQuery failed:', error.message));

  const isDecision = action === 'ok' || action === 'no';
  const isDeliveryOutcome = action === 'del' || action === 'ret';
  const isReturnReceipt = action === 'rcv';
  const isConfirm = action === 'cnf';
  if (!message || (!isDecision && !isDeliveryOutcome && !isReturnReceipt && !isConfirm)) return answer();

  const order = orderId ? await getOrder(orderId).catch(() => null) : null;

  /* قبول/رفض تقرّر من قبل — ما نعاودوش، ونقولو لللي نقر */
  if (isDecision && order && order.status !== 'pending') {
    const label = order.status === 'accepted' ? 'مقبول' : 'مرفوض';
    return answer(`الطلب راهو ${label} من قبل — ${order.actor ?? ''}`);
  }

  /* زر التوصيل/الرجوع يحتاج طلب مقبول وبلا نتيجة توصيل مسبقة */
  if (isDeliveryOutcome && order) {
    if (order.status !== 'accepted') return answer('الطلب لازال ماشي مقبول.');
    if (order.deliveryStatus) {
      const label = order.deliveryStatus === 'delivered' ? 'توصّل' : 'رجعت';
      return answer(`الطلب راهو ${label} من قبل — ${order.deliveryActor ?? ''}`);
    }
  }

  /* زر "استلمت الرجعة" يحتاج طلب "رجعت" وبلا استلام مسجّل من قبل */
  if (isReturnReceipt && order) {
    if (order.deliveryStatus !== 'returned') return answer('الطلب ماشي مسجّل "رجعت".');
    if (order.returnReceivedAt) return answer(`استلمتها من قبل — ${order.returnReceivedActor ?? ''}`);
  }

  /*
   * تأكيد بالتيليفون — يتسجّل برك، ما يقرّرش الطلب. الطلب يبقى pending
   * وأزرار القبول/الرفض تبقى، غير زر التأكيد يختفي.
   */
  if (action === 'cnf') {
    if (order && order.confirmedAt) return answer(`تأكد من قبل — ${order.confirmedBy ?? ''}`);
    try {
      const updated = await updateOrder(orderId, {
        confirmedAt: new Date().toISOString(), confirmedBy: who,
      });
      if (!updated) return answer('الطلب ماشي موجود.');
      await repaintOrder(message.chat.id, updated);
    } catch (error) {
      console.error('Confirm failed:', error.message, '| order:', orderId);
      return answer('صار خطأ، عاود حاول.');
    }
    return answer('تسجّل التأكيد 📞');
  }

  if (action === 'ok') {
    /* ما نقبلوش طلب المخزون ما يكفيهش — الطلب يبقى بلا قرار حتى تزوّدو */
    if (order) {
      const needed = order.qty ?? 1;
      const stockBefore = await getStockForOrder(order).catch(() => null);
      if (stockBefore && stockBefore.qty < needed) {
        return answer(`🚫 المخزون ما يكفيش — باقي ${stockBefore.qty}، الطلب يحتاج ${needed}. زوّدو بـ /restock.`);
      }
    }

    try {
      const updated = await updateOrder(orderId, {
        status: 'accepted', actor: who, decidedAt: new Date().toISOString(), reason: null,
        /* لقطة: واش هذا الطلب تأكّد بالتيليفون قبل ما يتقبّل؟ هذا اللي
           يخلّينا من بعد نقارنو نسبة الرجعات مؤكّد ضدّ ماشي مؤكّد. */
        confirmedBeforeAccept: Boolean(order?.confirmedAt),
      });
      const record = updated ?? { ...order, messageId: message.message_id };
      await repaintOrder(message.chat.id, record);

      const stock = await adjustStockForOrder(record, -(record.qty ?? 0)).catch((error) => {
        console.error('Stock decrement failed:', error.message, '| order:', orderId);
        return null;
      });
      await checkLowStock(message.chat.id, stock, record);
    } catch (error) {
      console.error('Accept failed:', error.message, '| order:', orderId);
    }
    return answer('تقبّل الطلب ✅');
  }

  if (action === 'del' || action === 'ret') {
    const deliveryStatus = action === 'del' ? 'delivered' : 'returned';
    try {
      /*
       * لقطة التكاليف — هنا بالضبط، وقت ما الفلوس تتقرّر.
       *
       * بلاها، الربح يتحسب ديما بتكاليف اليوم: تبدّل سومة السلعة بـ
       * /cost وتقارير الشهور اللي فاتو تتبدّل معاها. باللقطة، اللي
       * تسجّل يبقى كيما هو.
       */
      const costs = await getCosts().catch(() => null);
      const product = order?.productId ? await getProduct(order.productId).catch(() => null) : null;

      const updated = await updateOrder(orderId, {
        deliveryStatus, deliveryActor: who, deliveryDecidedAt: new Date().toISOString(),
        ...(costs ? { costSnapshot: costSnapshotOf(costs, product) } : {}),
      });
      if (!updated) return answer('الطلب ماشي موجود.');

      /*
       * "رجعت" ما تزيدش المخزون هنا — هذا غير يعني المُوصّل قالها رجعت،
       * الطلبية فيزيائياً لسّا في الطريق لعندك. المخزون يتزاد غير كي
       * تنقر "📥 استلمت الرجعة" (زر يبان بعد هذي النقرة).
       */
      await repaintOrder(message.chat.id, updated);

      /*
       * 💰 هنا برك نبعثو Purchase لميتا — كي الفلوس تدخل فعلاً، ماشي كي
       * الطلب يتقبّل. هكذا الخوارزمية تتعلّم تجيب ناس **يخلّصو** ماشي
       * ناس يعمّرو الفورم ويرفضو عند الباب.
       */
      if (deliveryStatus === 'delivered') {
        const meta = await sendMetaEvent('Purchase', updated, { value: updated.total });
        if (meta?.error) console.error('Meta CAPI Purchase failed:', meta.error, '| order:', orderId);
      }
    } catch (error) {
      console.error('Delivery outcome update failed:', error.message, '| order:', orderId);
      return answer('صار خطأ، عاود حاول.');
    }
    return answer(deliveryStatus === 'delivered' ? 'تسجّل: توصّل 📦' : 'تسجّل: رجعت مع المُوصّل ↩️');
  }

  if (action === 'rcv') {
    try {
      const updated = await updateOrder(orderId, {
        returnReceivedAt: new Date().toISOString(), returnReceivedActor: who,
      });
      if (!updated) return answer('الطلب ماشي موجود.');

      await repaintOrder(message.chat.id, updated);

      /* دروك فعلاً بين يديك — تزيد للمخزون */
      await adjustStockForOrder(updated, updated.qty ?? 0).catch((error) =>
        console.error('Restock after receiving return failed:', error.message, '| order:', orderId));
    } catch (error) {
      console.error('Return-receipt update failed:', error.message, '| order:', orderId);
      return answer('صار خطأ، عاود حاول.');
    }
    return answer('تزادت للمخزون 📥');
  }

  /*
   * الرفض يحتاج سبب. نطلبوه بـ ForceReply — تيليغرام يحلّ الكيبورد ويربط
   * الجواب بهذي الرسالة، فنعرفو بالضبط أشمن طلب يخصّو كي يجي الجواب.
   */
  try {
    const prompt = await telegram('sendMessage', {
      chat_id: message.chat.id,
      reply_to_message_id: message.message_id,
      text: '❌ علاش رفضتي الطلب؟ اكتب السبب في ردّ على هذي الرسالة.',
      reply_markup: { force_reply: true, input_field_placeholder: 'مثال: الزبون ما جاوبش' },
    });
    if (orderId) await rememberReplyPrompt(message.chat.id, prompt.message_id, orderId);
  } catch (error) {
    console.error('Failed to ask for deny reason:', error.message, '| order:', orderId);
  }

  return answer('اكتب سبب الرفض ✍️');
}

/* ── جواب فيه سبب الرفض ──────────────────────────────────────────── */
async function handleReply(message) {
  const promptId = message.reply_to_message?.message_id;
  if (!promptId) return;

  const orderId = await resolveReplyPrompt(message.chat.id, promptId).catch(() => null);
  if (!orderId) return;   /* ردّ على حاجة أخرى — ماشي سبب رفض */

  const reason = String(message.text ?? '').trim().slice(0, MAX_REASON_LENGTH);
  if (!reason) return;

  try {
    const updated = await updateOrder(orderId, {
      status: 'denied',
      actor: displayName(message.from),
      reason,
      decidedAt: new Date().toISOString(),
    });
    await repaintOrder(message.chat.id, updated);

    /* ننظّفو: رسالة السؤال وجواب السبب ما بقاوش يلزمو، الحالة بانت في الطلب */
    await telegram('deleteMessage', { chat_id: message.chat.id, message_id: promptId }).catch(() => {});
    await telegram('deleteMessage', { chat_id: message.chat.id, message_id: message.message_id }).catch(() => {});
    await forgetReplyPrompt(message.chat.id, promptId).catch(() => {});
  } catch (error) {
    console.error('Failed to record deny reason:', error.message, '| order:', orderId);
    await telegram('sendMessage', {
      chat_id: message.chat.id,
      text: `⚠️ ما قدرناش نسجّلو سبب الرفض: ${esc(error.message)}`,
    }).catch(() => {});
  }
}

/**
 * حالة كل الطلبات المعلّقة دروك — بديل حيّ لتقرير آخر النهار، ما يحتاجش
 * تستنّى 00:00. ثلاث قوائم برك: بلا قرار، في الطريق، ورجعات لسّا ما
 * وصلاتش للمحل فيزيائياً (المخزون ما يتزادش فيهم حتى تتأكّد بـ "استلمت
 * الرجعة"). كل سطر خالي = خير، مكتوب واضح باش ما يبقاش شكّ.
 *
 * ⚠️ فوق كل طلب قديم من 24 سا: علامة تفكّرك بيه قبل ما يفوت وقتو.
 */
async function buildStateMessage() {
  const [pending, awaitingDelivery, awaitingReturn, stock] = await Promise.all([
    listPendingOrders(), listAwaitingDelivery(), listAwaitingReturnReceipt(), getStock(),
  ]);

  const isOld = (order) => Date.now() - new Date(order.createdAt).getTime() > 24 * 60 * 60 * 1000;
  const line = (order) =>
    `• ${esc(order.name)} — ${esc(order.wilaya)} — ${dz(order.total ?? 0)} (${elapsedLabel(order.createdAt)})${isOld(order) ? ' ⚠️' : ''}`;
  const section = (emoji, title, list) => {
    const lines = [`${emoji} <b>${title} — ${list.length} طلب</b>`];
    lines.push(...(list.length ? list.map(line) : ['لا شيء هنا، صافي ✅']));
    return lines;
  };

  const lines = ['<b>📋 حالة الطلبات</b>', ''];

  lines.push(...section('⏳', 'بلا قرار (قبول/رفض)', pending));
  lines.push('', ...section('🚚', 'مقبولة، في الطريق', awaitingDelivery));
  lines.push('', ...section('↩️', 'رجعات لسّا ما وصلاتش للمحل', awaitingReturn));

  const pendingCash = [...pending, ...awaitingDelivery].reduce((sum, o) => sum + (o.total ?? 0), 0);
  const returnQty = awaitingReturn.reduce((sum, o) => sum + (o.qty ?? 0), 0);
  const stockWarn = stock.qty <= stock.threshold ? ' ⚠️ قليل' : '';

  lines.push(
    '',
    '➖➖➖➖➖➖➖➖',
    `💵 فلوس تستنّى قرار نهائي (بلا قرار + في الطريق): <b>${dz(pendingCash)}</b>`,
    `📦 المخزون الحالي: <b>${stock.qty}</b> طوق${stockWarn}`,
  );
  if (returnQty) {
    lines.push(`🔁 رجعات ما تزادتش للمخزون بعد: <b>${returnQty}</b> طوق (يولّي ${stock.qty + returnQty} كي توصل كاملة)`);
  }

  return lines.join('\n');
}

/* ── أوامر المخزون، التكاليف، وحالة الطلبات ───────────────────────
 * /state, /status   — كل الطلبات المعلّقة دروك (بلا قرار / بلا نتيجة
 *                      توصيل / رجعت بصح ما وصلاتش للمحل) + المخزون
 * /stock            — يعرض الكمية الحالية وحد التنبيه
 * /restock <عدد>    — يزيد كمية للمخزون (بعد تزويد)
 * /setstock <عدد>   — يحطّ الكمية بالضبط (تصحيح، ولا الإعداد الأول)
 * /cost             — يعرض تكاليف الربح الحالية (سوما البضاعة، الإعلانات، خسارة الرجعة)
 * /cost product|ads|returns <عدد> — يبدّل واحدة منهم
 * /block <رقم> [سبب] — يزيد رقم لقائمة الحظر اليدوية
 * /unblock <رقم>    — يحيّد الحظر
 * /blocked          — يعرض كل الأرقام المحظورة
 * /clear            — ⚠️ يمسح كل الطلبات ويرجّع المخزون لصفر (يطلب تأكيد بزوج أزرار أوّلاً)
 *
 * محصورة في الشات المسجّل في TELEGRAM_CHAT_ID: أي واحد آخر يحلّ محادثة
 * مباشرة مع البوت (خارج الگروب) ما يقدرش يشوف الطلبات ولا يبدّل المخزون/التكاليف.
 */
async function handleCommand(message) {
  const ownerChatId = process.env.TELEGRAM_CHAT_ID;
  if (!ownerChatId || String(message.chat.id) !== String(ownerChatId)) return;

  const parts = String(message.text ?? '').trim().split(/\s+/);
  const [command, arg] = parts;
  const reply = (text) =>
    telegram('sendMessage', { chat_id: message.chat.id, text, parse_mode: 'HTML' })
      .catch((error) => console.error('Command reply failed:', error.message));

  if (command === '/state' || command === '/status') {
    try {
      return reply(await buildStateMessage());
    } catch (error) {
      console.error('/state failed:', error.message);
      return reply('⚠️ ما قدرتش نجيب الحالة، عاود حاول.');
    }
  }

  /*
   * فعل خطير وبلا تراجع — نطلبو تأكيد بزوج أزرار (نفس منطق قبول/رفض)
   * قبل ما نمسحو والو، باش نقرة وحدة غالطة ما تخسّرش التاريخ كامل.
   */
  if (command === '/clear') {
    return telegram('sendMessage', {
      chat_id: message.chat.id,
      text: '⚠️ <b>متأكد؟</b>\nهذا يمسح <b>كل الطلبات</b> (التاريخ كامل) ويرجّع <b>المخزون لصفر</b>.\nما يترجعش لور!',
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ ايه، امسح كلش', callback_data: 'clear-yes' },
          { text: '❌ لا، تراجعت', callback_data: 'clear-no' },
        ]],
      },
    }).catch((error) => console.error('/clear prompt failed:', error.message));
  }

  if (command === '/stock') {
    const [legacy, awaitingReturn, products] = await Promise.all([
      getStock(), listAwaitingReturnReceipt(), listProducts().catch(() => []),
    ]);
    const returnQty = awaitingReturn.reduce((sum, o) => sum + (o.qty ?? 0), 0);
    const lines = [];

    /*
     * العدّاد القديم يبان غير إذا فيه شي حاجة — الطلبات القديمة (والصفحة
     * الحالية) مازال يخدمو عليه، فما نخبّيوهش، بصح ما نعرضوهش فارغ
     * كي يولّي كلش على المنتجات.
     */
    if (legacy.qty > 0 || !products.length) {
      const warn = legacy.qty <= legacy.threshold ? ' ⚠️' : '';
      lines.push(`📦 <b>${legacy.qty}</b>${warn}  (المخزون العام · حد التنبيه ${legacy.threshold})`);
    }

    for (const product of products) {
      const rows = await listStockFor(product).catch(() => []);
      if (!rows.length) continue;
      lines.push('', `<b>${esc(product.name)}</b>`);
      for (const { variant, stock } of rows) {
        const label = Object.keys(variant.options).length
          ? Object.values(variant.options).join(' / ')
          : 'وحيد';
        const warn = stock.qty <= stock.threshold ? ' ⚠️' : '';
        lines.push(`  ${esc(label)} — <b>${stock.qty}</b>${warn}`);
      }
    }

    if (returnQty) {
      lines.push('', `🔁 رجعات معلّقة (لسّا ما تزادوش): <b>${returnQty}</b> — /state يوريك أشمن طلبات`);
    }
    return reply(lines.join('\n') || 'ما كاين حتى مخزون مسجّل.');
  }

  if (command === '/restock') {
    const n = parseInt(arg, 10);
    if (!Number.isFinite(n) || n <= 0) return reply('استعمل: /restock 20');
    const stock = await adjustStock(n);
    return reply(`✅ تزوّد المخزون. الكمية الحالية: <b>${stock.qty}</b> طوق`);
  }

  if (command === '/setstock') {
    const n = parseInt(arg, 10);
    if (!Number.isFinite(n) || n < 0) return reply('استعمل: /setstock 50');
    const stock = await setStock(n);
    return reply(`✅ تسجّل المخزون. الكمية الحالية: <b>${stock.qty}</b> طوق`);
  }

  /*
   * قائمة الحظر اليدوية — تكملة لفحص الثقة، ماشي بديل.
   * الحظر هنا ما يمنعش الطلب من الوصول (الزبون يقدر يعمّر الفورم عادي)،
   * غير يبان في الرسالة بعلامة واضحة وانت تقرّر. نفس المبدأ: تنبيه ماشي
   * منع تلقائي — المنع الصامت يخسّرك زبائن وما تعرف حتى.
   */
  if (command === '/block') {
    const phone = normalizeDzPhone(arg);
    if (!phone) return reply('استعمل: /block 0661445566 [السبب]');
    const reason = parts.slice(2).join(' ') || null;
    const entry = await blockPhone(phone, { reason, addedBy: displayName(message.from) });
    return reply(`🚫 تحظر <b>${entry.phone}</b>${entry.reason ? `\nالسبب: ${esc(entry.reason)}` : ''}`);
  }

  if (command === '/unblock') {
    const phone = normalizeDzPhone(arg);
    if (!phone) return reply('استعمل: /unblock 0661445566');
    const removed = await unblockPhone(phone);
    return reply(removed ? `✅ تحيّد الحظر على <b>${phone}</b>` : `الرقم <b>${phone}</b> ماشي محظور أصلاً.`);
  }

  if (command === '/blocked') {
    const entries = await listBlocked();
    if (!entries.length) return reply('ما كان حتى رقم محظور.');
    const lines = [`🚫 <b>الأرقام المحظورة (${entries.length})</b>`, ''];
    for (const entry of entries) {
      lines.push(`• <b>${entry.phone}</b>${entry.reason ? ` — ${esc(entry.reason)}` : ''}`);
    }
    lines.push('', 'حيّد واحد بـ: /unblock 0661445566');
    return reply(lines.join('\n'));
  }

  if (command === '/cost') {
    const FIELDS = { product: { key: 'productCost', label: 'سوما البضاعة' }, ads: { key: 'adsCost', label: 'تكلفة الإعلانات' }, returns: { key: 'returnLoss', label: 'خسارة الرجعة' } };

    /* بلا فرعي: نعرضو التكاليف الثلاثة كاملة */
    if (!arg) {
      const costs = await getCosts();
      return reply([
        '💰 <b>تكاليف الربح</b>',
        `سوما البضاعة (لكل طوق): <b>${dz(costs.productCost)}</b>`,
        `تكلفة الإعلانات (لكل طلب): <b>${dz(costs.adsCost)}</b>`,
        `خسارة الرجعة (لكل طلب رجع): <b>${dz(costs.returnLoss)}</b>`,
        '',
        'بدّل بـ: /cost product 1600 — /cost ads 250 — /cost returns 800',
      ].join('\n'));
    }

    const field = FIELDS[arg];
    const n = parseInt(parts[2], 10);
    if (!field || !Number.isFinite(n) || n < 0) {
      return reply('استعمل: /cost product 1600  ولا  /cost ads 250  ولا  /cost returns 800');
    }
    const costs = await setCost(field.key, n);
    return reply(`✅ تسجّل. ${field.label}: <b>${dz(costs[field.key])}</b>`);
  }
}

/*
 * تسجيل الويبهوك بروحو: الفنكشن تعرف الـ secret (من الـ env) وتعرف رابط
 * الموقع، فتقدر تسجّل روحها عند تيليغرام. هكذا ما نحتاجوش حتى واحد يكتب
 * الـ secret بيدو في curl.
 *
 * 🔒 الرابط يتاخذ من `process.env.URL` (Netlify يحطّو، وهو رابط الموقع
 * الرسمي) وماشي من الـ request. لو اعتمدنا على الـ request، أي واحد يبعث
 * `Host: evil.com` يقدر يحوّل الويبهوك لعندو — وتيليغرام يبعثلو الـ secret
 * في الـ header. هذي ثغرة حقيقية، علاش الرابط ثابت.
 *
 * الاستدعاء آمن حتى لو عمومي: ديما يسجّل نفس الرابط بنفس الـ secret.
 */
async function setupWebhook() {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return { ok: false, error: 'TELEGRAM_WEBHOOK_SECRET is not configured' };

  const site = siteUrl();
  if (!site) return { ok: false, error: 'Site URL is not available in the environment' };

  const webhookUrl = `${site}/api/telegram-webhook`;

  await telegram('setWebhook', {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['callback_query', 'message'],
    /* التحديثات القديمة تتمسح — نقرات تجريب قديمة ما تخدمش على طلبات راحت */
    drop_pending_updates: true,
  });

  const info = await telegram('getWebhookInfo', {});
  return { ok: true, url: info.url, pending: info.pending_update_count };
}

export default async function handler(request) {
  if (request.method === 'GET' && new URL(request.url).searchParams.has('setup')) {
    try {
      const result = await setupWebhook();
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 500,
        headers: { 'content-type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
  }

  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  /*
   * تيليغرام يزيد هذا الـ header إذا عطيتيه `secret_token` في setWebhook.
   * بلاه، أي واحد يعرف رابط الفنكشن يقدر يبعث نقرات مزوّرة.
   */
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    console.error('Rejected webhook call: bad or missing secret token');
    return new Response('Forbidden', { status: 403 });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  try {
    if (update.callback_query) await handleCallback(update.callback_query);
    else if (update.message?.reply_to_message) await handleReply(update.message);
    else if (update.message?.text?.startsWith('/')) await handleCommand(update.message);
  } catch (error) {
    console.error('Webhook handler error:', error.message);
  }

  /* ديما 200: إذا رجعنا خطأ، تيليغرام يعاود يبعث نفس التحديث بلا فايدة */
  return new Response('ok');
}
