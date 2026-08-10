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
  listOrders, listPendingOrders, listAwaitingDelivery, listAwaitingReturnReceipt,
  getCosts, setCost, clearAllOrders, clearAllReplyPrompts,
  blockPhone, unblockPhone, listBlocked, normalizeDzPhone,
  saveProductDraft, getProductDraft, forgetProductDraft,
} from '../lib/store.mjs';
import { parseProductIntent } from '../lib/product-intent.mjs';
import { ownerMessage, buttonsFor, esc, dz, elapsedLabel, costSnapshotOf } from '../lib/message.mjs';
import { sendMetaEvent } from '../lib/meta.mjs';
import {
  getProduct, listProducts, listStockFor, adjustVariantStock, setVariantStock,
  saveProduct, saveCategory, listCategories, availableSlug, deleteProduct,
} from '../lib/catalog.mjs';
import { guessPreset, findPreset } from '../lib/category-presets.mjs';
import { siteUrl } from '../lib/site.mjs';
import { toVercel } from '../lib/http.mjs';

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

/*
 * "🚀 انشر" تحت منتج تصنع بـ /newproduct — يقلب status لـ active.
 *
 * ⚠️ محصور في شات المالك: نقرات الطلبات ما تحتاجش هاذ الفحص (الرسالة
 * روحها ما تتبعث غير للمالك)، بصح النشر يبدّل حاجة يشوفها الزبون، فما
 * نعتمدوش على "شكون يوصلو الزر" وحدها.
 */
async function handlePublishProduct(query, productId, answer) {
  const ownerChatId = process.env.TELEGRAM_CHAT_ID;
  if (!ownerChatId || String(query.message.chat.id) !== String(ownerChatId)) {
    return answer('ما عندكش الصلاحية.');
  }

  try {
    const product = await getProduct(productId);
    if (!product) return answer('المنتج ماشي موجود.');
    if (product.status === 'active') return answer('راهو منشور من قبل.');

    const published = await saveProduct({ ...product, status: 'active' });
    const site = siteUrl();

    /* الزر يتحيّد بعد النشر — زر يعاود يدير حاجة مدارة يخلّي التاجر
       يشكّ واش خدمت ولا لا */
    await telegram('editMessageText', {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      /* query.message.text راهو النص **بعد** ما تيليغرام حلّ الـ HTML —
         نص خام. نعاودو نهربوه قبل ما نبعثوه بـ parse_mode HTML، وإلا
         اسم منتج فيه & ولا < يرجّع الطلب بخطأ من تيليغرام. */
      text: `${esc(query.message.text ?? '')}\n\n🚀 <b>تنشر</b> — ${esc(displayName(query.from))}`
        + (site ? `\n${site}/p/${esc(published.slug)}` : ''),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }).catch((error) => console.error('Publish repaint failed:', error.message));

    return answer('تنشر في المتجر 🚀');
  } catch (error) {
    console.error('Publish failed:', error.message, '| product:', productId);
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

  /* أفعال الكاتالوغ — ماشي طلبات، فيخرجو قبل منطق الطلبات */
  if (action === 'pub') {
    if (!message) return;
    return handlePublishProduct(query, orderId, answer);
  }
  if (action === 'mk' || action === 'mkx') {
    if (!message) return;
    return handleDraftDecision(query, orderId, action === 'mk', answer);
  }
  if (action === 'rm') {
    if (!message) return;
    return handleDeleteProduct(query, orderId, answer);
  }

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
 * ⚠️ ماشي لازم أمر: أي رسالة عادية فيها نيّة صريحة ("عندي 9 طوق تتبّع،
 *    زيد المنتج والفئة") تتقرا وحدها، والبوت يوري واش فهم ويستنّى نقرة
 *    تأكيد قبل ما يكتب. شوف handleFreeText و lib/product-intent.mjs.
 *
 * /help, /start     — لائحة الأوامر كاملة
 * /state, /status   — كل الطلبات المعلّقة دروك (بلا قرار / بلا نتيجة
 *                      توصيل / رجعت بصح ما وصلاتش للمحل) + المخزون
 * /newproduct الاسم | السومة | الكمية | الفئة | سومة الشراء
 *                   — يصنع منتج (مسودّة) + فئتو إذا ما كانتش + مخزونو،
 *                      ويعطي زر "🚀 انشر"
 * /newcategory الاسم | الوصف | الإيموجي — فئة جديدة (الجاهزين يعمّرو روحهم)
 * /categories       — كل الفئات وعدد منتجات كل وحدة
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
/*
 * كل فاريانت عندو مخزون في لائحة وحدة مرقّمة.
 *
 * ⚠️ علاش: /restock كان ينادي adjustStock() — العدّاد العام القديم في
 * store.mjs. بصح الطلبات واللوحة يقراو مخزون الفاريانت في catalog.mjs.
 * يعني "زدت 10 في تيليغرام" ما كان يبان لا في اللوحة لا وقت القبول:
 * جوج أرقام منفصلين ما يتلاقاو عمرهم. دروك الأوامر تكتب في نفس البلاصة
 * اللي تقرا منها اللوحة.
 *
 * الترتيب لازم يكون ثابت — الرقم اللي يبان في /stock هو اللي يتكتب في
 * /restock، فلو تبدّل بين الأمرين المستخدم يزوّد الفاريانت الغالط.
 */
async function stockTargets() {
  const products = await listProducts().catch(() => []);
  const sorted = products.slice().sort((a, b) =>
    String(a.name ?? '').localeCompare(String(b.name ?? '')) || String(a.id).localeCompare(String(b.id)));

  const targets = [];
  for (const product of sorted) {
    const rows = await listStockFor(product).catch(() => []);
    for (const { variant, stock } of rows) {
      targets.push({
        index: targets.length + 1,
        productId: product.id,
        productName: product.name || '—',
        sku: variant.sku,
        label: Object.keys(variant.options || {}).length
          ? Object.values(variant.options).join(' / ')
          : 'وحيد',
        stock,
      });
    }
  }
  return targets;
}

/* ── إنشاء منتج/فئة من تيليغرام ────────────────────────────────────
 *
 * السيناريو اللي هذا مبني عليه: توصلك سلعة جديدة وانت في المحل ولا في
 * الطريق. تفتح تيليغرام (راهو محلول أصلاً، الطلبات تجي فيه) وتكتب سطر
 * واحد — المنتج، الفئة، والمخزون يتسجّلو مرّة وحدة. بلا هذا، لازم تحلّ
 * اللابتوب، تدخل للوحة، تعمّر فورم، وترجع تزيد المخزون. أغلب الوقت
 * ما يتعملش، والسلعة تبقى برّا النظام.
 *
 * الحقول مفصولة بـ | على خاطر أسماء المنتجات فيها فراغات ("Qiti
 * Tracking Collar") — فراغ كفاصل يخلّي التحليل يخمّن، والتخمين الغالط
 * هنا يخزّن منتج بسومة غالطة.
 */
const splitPipes = (text) => String(text ?? '').split('|').map((part) => part.trim());

/* رقم من نص التاجر: "3900", "3900 دج", "3 900" كلهم يعطيو 3900.
   نص بلا أرقام يرجّع null (ماشي 0) — الفرق مهم: "ما كتبش سومة" ماشي
   "السومة صفر". */
function parseAmount(text) {
  if (text == null || text === '') return null;
  const digits = String(text).replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * يلقى الفئة ولا يصنعها. يرجّع { category, created } ولا
 * { category: null } كي ما كانش لا نص ولا تخمين.
 *
 * الترتيب: اللي كتبو التاجر يغلب التخمين ديما، والموجود يغلب الجديد
 * (ما نصنعوش "سيارة" ثانية كي وحدة كاينة).
 */
async function resolveCategory(wanted, productName) {
  const existing = await listCategories().catch(() => []);
  const matches = (category, needle) =>
    String(category.slug).toLowerCase() === needle
    || String(category.name ?? '').trim().toLowerCase() === needle;

  if (wanted) {
    const needle = wanted.trim().toLowerCase();
    const found = existing.find((category) => matches(category, needle));
    if (found) return { category: found, created: false };
  }

  /* ما لقيناش وحدة موجودة — نشوفو الجاهزة (بالاسم اللي كتبو، وإلا
     نخمّنو من اسم المنتج) */
  const preset = wanted ? findPreset(wanted) : guessPreset(productName);

  /* الجاهزة تقدر تكون موجودة بسلاق مختلف على اللي كتبو التاجر */
  if (preset) {
    const already = existing.find((category) => matches(category, preset.slug.toLowerCase()));
    if (already) return { category: already, created: false };
  }

  if (!preset && !wanted) return { category: null, created: false };

  const name = preset?.name ?? wanted;
  const slug = await availableSlug('category', preset?.slug ?? wanted);
  const maxSort = existing.reduce((max, category) => Math.max(max, Number(category.sort) || 0), 0);

  const category = await saveCategory({
    name,
    slug,
    tagline: preset?.tagline ?? null,
    emoji: preset?.emoji ?? null,
    color: preset?.color ?? null,
    sort: maxSort + 10,
  });
  return { category, created: true, preset };
}

/*
 * المنتج يتصنع **مسودّة** ديماً، وزر "🚀 انشر" يبان تحت الجواب.
 *
 * علاش ماشي منشور طول: المنتج اللي يتصنع من سطر تيليغرام ما عندو لا
 * صورة لا وصف. لو طلع للمتجر مباشرة، الزبون يشوف بطاقة خاوية بسومة —
 * وهذا يضرّ أكثر ما ينفع. المخزون يتسجّل من دروك (هو سبب الأمر أصلاً)،
 * والنشر يبقى نقرة وحدة كي تكون الصور جاهزة.
 */
async function handleNewProduct(message, argText, reply) {
  const [rawName, rawPrice, rawQty, rawCategory, rawCost] = splitPipes(argText);

  if (!rawName) {
    return reply([
      '🆕 <b>منتج جديد</b>',
      '',
      '<code>/newproduct الاسم | السومة | الكمية | الفئة | سومة الشراء</code>',
      '',
      'مثال:',
      '<code>/newproduct Qiti Tracking Collar | 3900 | 9 | tracking | 1800</code>',
      '',
      'الاسم برك إجباري. الباقي تقدر تخلّيه فارغ ولا تحيّدو:',
      '<code>/newproduct طوق تتبّع | 3900 | 9</code>',
      '',
      'الفئة: اكتب اسمها ولا سلاقها. ما كتبتهاش؟ نخمّنوها من اسم المنتج،',
      'وإذا ما كانتش موجودة نصنعوها. شوف الجاهزين بـ /categories.',
    ].join('\n'));
  }

  return createAndAnnounce(message.chat.id, {
    name: rawName,
    price: parseAmount(rawPrice) ?? 0,
    qty: parseAmount(rawQty) ?? 0,
    cost: parseAmount(rawCost) ?? 0,
    category: rawCategory || null,
  }, reply);
}

/*
 * الإنشاء الفعلي + جواب الحصيلة. مشترك بين الطريقين (الأمر /newproduct
 * وقراءة الرسالة العادية) — بلا هذا، أي تبديل في شكل المنتج المصنوع
 * لازم يتكتب زوج مرّات، والنسختين يفرقو مع الوقت.
 */
async function createAndAnnounce(chatId, fields, reply) {
  const { name } = fields;
  const price = fields.price ?? 0;
  const qty = fields.qty ?? 0;
  const unitCost = fields.cost ?? 0;

  let category = null;
  let categoryCreated = false;
  try {
    const resolved = await resolveCategory(fields.category, name);
    category = resolved.category;
    categoryCreated = resolved.created;
  } catch (error) {
    /* فشل الفئة ما يوقّفش المنتج — المخزون هو الغرض، والفئة تتزاد
       من اللوحة في ثانية. نقولوها في الجواب بلا ما نضيّعو الباقي. */
    console.error('Category resolve failed:', error.message);
  }

  let product;
  try {
    const slug = await availableSlug('product', name);
    product = await saveProduct({
      name,
      slug,
      price,
      unitCost,
      type: category ? (findPreset(category.slug)?.type ?? 'life') : 'life',
      categoryId: category?.id ?? null,
      status: 'draft',
      initialStock: qty,
    });
  } catch (error) {
    console.error('Product creation failed:', error.message);
    return reply(`⚠️ ما تصنعش المنتج: ${esc(error.message)}`);
  }

  const site = siteUrl();
  const lines = [
    '✅ <b>تصنع المنتج</b> (مسودّة)',
    '',
    `📦 <b>${esc(product.name)}</b>`,
    `السومة: <b>${price ? dz(price) : '— ما تكتبتش'}</b>`,
    `المخزون: <b>${qty}</b>`,
  ];
  if (unitCost) lines.push(`سومة الشراء: <b>${dz(unitCost)}</b> (الربح للوحدة: ${dz(price - unitCost)})`);
  lines.push(category
    ? `الفئة: <b>${esc(category.name)}</b>${categoryCreated ? ' — تصنعت دروك 🆕' : ''}`
    : 'الفئة: — بلا فئة');

  lines.push('', 'ما زال مسودّة: ما يبانش في المتجر حتى تنشرو.');
  if (!price) lines.push('⚠️ بلا سومة — زيدها قبل النشر.');
  if (site) lines.push('', `✏️ كمّلو (صور، وصف): ${site}/admin#/products/${product.id}`);

  return telegram('sendMessage', {
    chat_id: chatId,
    text: lines.join('\n'),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    /* التراجع لازم يكون في نفس البلاصة اللي صرات فيها الغلطة — منتج
       تصنع بالغلط من رسالة ما يستاهلش رحلة للوحة باش يتحيّد */
    reply_markup: {
      inline_keyboard: [[
        { text: '🚀 انشر في المتجر', callback_data: `pub:${product.id}` },
        { text: '🗑️ امسحو', callback_data: `rm:${product.id}` },
      ]],
    },
  }).catch((error) => console.error('Product reply failed:', error.message));
}

/*
 * حذف منتج من تيليغرام — للتراجع على منتج تصنع دروك بالغلط.
 *
 * نفس حاجز اللوحة: منتج عندو طلبات ما يتمسحش، على خاطر التقارير
 * تقرا اسمو من الكاتالوغ. الفحص مكتوب هنا وفي admin-api.mjs — الزوج
 * يقراو نفس القاعدة، وهي في سطر واحد، فتكرارها أرخص من موديول
 * مشترك يجرّ store.mjs لحلقة استيراد مع catalog.mjs.
 */
async function handleDeleteProduct(query, productId, answer) {
  const ownerChatId = process.env.TELEGRAM_CHAT_ID;
  if (!ownerChatId || String(query.message.chat.id) !== String(ownerChatId)) {
    return answer('ما عندكش الصلاحية.');
  }

  try {
    const product = await getProduct(productId);
    if (!product) return answer('المنتج ماشي موجود — يمكن تمسح من قبل.');

    const orders = await listOrders();
    const used = orders.filter((order) => order.productId === product.id).length;
    if (used) {
      return answer(`عندو ${used} طلب في التاريخ — ما يتمسحش. أرشفو من اللوحة.`);
    }

    await deleteProduct(product.id);
    await telegram('editMessageText', {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      text: `🗑️ <b>تمسح</b> — ${esc(product.name)}\nما بقا حتى أثر: لا رابط، لا مخزون.`,
      parse_mode: 'HTML',
    }).catch((error) => console.error('Delete repaint failed:', error.message));

    return answer('تمسح 🗑️');
  } catch (error) {
    console.error('Delete failed:', error.message, '| product:', productId);
    return answer('صار خطأ، عاود حاول.');
  }
}

/* ── قراءة رسالة عادية (بلا أمر) ───────────────────────────────────
 *
 * "عندي 9 طوق تتبّع، زيد المنتج والفئة" لازم تخدم كيما /newproduct.
 * التاجر ما يحفظش صيغ — يكتب كيما يهدر.
 *
 * ⚠️ ما نكتبوش المنتج على طول. البوت يوري واش فهم ويستنّى نقرة:
 * التحليل تخمين (شوف lib/product-intent.mjs)، وكتابة صامتة على تخمين
 * تعمّر الكاتالوغ بمنتجات ما طلبهم حتى واحد — والتاجر ما يعرفش منين
 * جاو. نقرة وحدة تخلّي الغلطة تتشاف قبل ما تصرا.
 */
async function handleFreeText(message) {
  const ownerChatId = process.env.TELEGRAM_CHAT_ID;
  if (!ownerChatId || String(message.chat.id) !== String(ownerChatId)) return;

  const parsed = parseProductIntent(message.text);
  if (!parsed) return;   /* هدرة عادية — البوت يسكت، ما يجاوبش على كلشي */

  let draftId;
  try {
    draftId = await saveProductDraft(parsed);
  } catch (error) {
    console.error('Draft save failed:', error.message);
    return;
  }

  const lines = [
    '🤔 <b>فهمت هكذا:</b>',
    '',
    `📦 الاسم: <b>${esc(parsed.name)}</b>`,
    `💵 السومة: <b>${parsed.price ? dz(parsed.price) : '— ما فهمتهاش'}</b>${parsed.guessedPrice ? ' <i>(خمّنتها)</i>' : ''}`,
    `📥 الكمية: <b>${parsed.qty ?? 0}</b>`,
  ];
  if (parsed.cost) lines.push(`🧾 سومة الشراء: <b>${dz(parsed.cost)}</b>`);
  lines.push(`🗂️ الفئة: <b>${parsed.category ? esc(parsed.category) : 'نخمّنوها من الاسم'}</b>`);
  lines.push('', 'صحّ؟ نقر وندير المنتج + الفئة + المخزون.');
  lines.push('غالط؟ نقر "لا" وعاود اكتبها، ولا استعمل <code>/newproduct</code>.');

  return telegram('sendMessage', {
    chat_id: message.chat.id,
    reply_to_message_id: message.message_id,
    text: lines.join('\n'),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ ايه، زيدو', callback_data: `mk:${draftId}` },
        { text: '❌ لا', callback_data: `mkx:${draftId}` },
      ]],
    },
  }).catch((error) => console.error('Intent prompt failed:', error.message));
}

/** نقرة "ايه، زيدو" / "لا" تحت رسالة الفهم */
async function handleDraftDecision(query, draftId, confirmed, answer) {
  const ownerChatId = process.env.TELEGRAM_CHAT_ID;
  if (!ownerChatId || String(query.message.chat.id) !== String(ownerChatId)) {
    return answer('ما عندكش الصلاحية.');
  }

  const draft = await getProductDraft(draftId).catch(() => null);
  if (!draft) return answer('المسودّة ما بقاتش — عاود اكتبها.');

  /* المسودّة تتمسح في الزوج حالات: نقرة ثانية على نفس الرسالة ما
     تصنعش منتج ثاني */
  await forgetProductDraft(draftId).catch(() => {});

  /* الأزرار يتحيّدو مهما كان القرار — زر يبقى بعد ما يتنقر يخلّي
     التاجر يشكّ واش خدم */
  await telegram('editMessageReplyMarkup', {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    reply_markup: { inline_keyboard: [] },
  }).catch(() => {});

  if (!confirmed) return answer('تراجعت ✅');

  const reply = (text) =>
    telegram('sendMessage', {
      chat_id: query.message.chat.id, text, parse_mode: 'HTML', disable_web_page_preview: true,
    }).catch((error) => console.error('Draft reply failed:', error.message));

  await createAndAnnounce(query.message.chat.id, draft, reply);
  return answer('تصنع المنتج ✅');
}

async function handleNewCategory(argText, reply) {
  const [rawName, rawTagline, rawEmoji] = splitPipes(argText);

  if (!rawName) {
    return reply([
      '🗂️ <b>فئة جديدة</b>',
      '',
      '<code>/newcategory الاسم | الوصف القصير | 🐾</code>',
      '',
      'اسم من الجاهزين يعمّر الوصف والإيموجي واللون وحدو:',
      '<code>/newcategory tracking</code>',
      '',
      'شوف الكل بـ /categories.',
    ].join('\n'));
  }

  try {
    const { category, created } = await resolveCategory(rawName, '');
    if (!created) return reply(`الفئة <b>${esc(category.name)}</b> راهي موجودة من قبل (/${esc(category.slug)}).`);

    /* الوصف/الإيموجي اللي كتبهم التاجر يغلبو اللي جاو من الجاهزة */
    const patched = (rawTagline || rawEmoji)
      ? await saveCategory({
        ...category,
        tagline: rawTagline || category.tagline,
        emoji: rawEmoji || category.emoji,
      })
      : category;

    return reply(`✅ تصنعت الفئة <b>${esc(patched.name)}</b> — /c/${esc(patched.slug)}`);
  } catch (error) {
    console.error('/newcategory failed:', error.message);
    return reply(`⚠️ ما تصنعتش الفئة: ${esc(error.message)}`);
  }
}

async function handleListCategories(reply) {
  const categories = await listCategories().catch(() => []);
  if (!categories.length) {
    return reply('ما كان حتى فئة.\nصنع وحدة: <code>/newcategory tracking</code>');
  }

  const products = await listProducts().catch(() => []);
  const countFor = (id) => products.filter((product) => product.categoryId === id).length;

  const lines = [`🗂️ <b>الفئات (${categories.length})</b>`, ''];
  for (const category of categories) {
    const badge = category.emoji ? `${category.emoji} ` : '';
    lines.push(`${badge}<b>${esc(category.name)}</b> — /c/${esc(category.slug)} · ${countFor(category.id)} منتج`);
  }
  lines.push('', 'زيد وحدة: <code>/newcategory الاسم</code>');
  return reply(lines.join('\n'));
}

async function handleCommand(message) {
  const ownerChatId = process.env.TELEGRAM_CHAT_ID;
  if (!ownerChatId || String(message.chat.id) !== String(ownerChatId)) return;

  const text = String(message.text ?? '').trim();
  const parts = text.split(/\s+/);
  /* في گروب، تيليغرام يكتب الأمر كامل: /stock@QitiBot — بلا هذا
     التنظيف، ولا أمر ما يتعرف كي البوت يكون مع بوتات أخرى */
  const command = parts[0].split('@')[0];
  const arg = parts[1];
  const reply = (line) =>
    telegram('sendMessage', {
      chat_id: message.chat.id, text: line, parse_mode: 'HTML', disable_web_page_preview: true,
    }).catch((error) => console.error('Command reply failed:', error.message));

  if (command === '/help' || command === '/start') {
    return reply([
      '🤖 <b>أوامر البوت</b>',
      '',
      '<b>الطلبات</b>',
      '/state — كل الطلبات اللي مازال ما كملوش',
      '',
      '<b>الكاتالوغ</b>',
      'اكتب عادي: <i>«عندي 9 طوق تتبّع، زيد المنتج والفئة»</i>',
      'ونوريك واش فهمت قبل ما نزيد والو.',
      '/newproduct — نفس الحاجة بصيغة مضبوطة',
      '/newcategory — فئة جديدة',
      '/categories — كل الفئات',
      '',
      '<b>المخزون</b>',
      '/stock — الكميات الحالية',
      '/restock — زيد كمية بعد تزويد',
      '/setstock — صحّح الكمية بالضبط',
      '',
      '<b>الفلوس</b>',
      '/cost — سومة الشراء، الإعلانات، الرجعة، التوصيل',
      '',
      '<b>الزبائن</b>',
      '/block · /unblock · /blocked',
      '',
      '/clear — ⚠️ يمسح كل الطلبات',
      '',
      'اكتب الأمر بلا حاجة أخرى وهو يوريك كيفاش يتكتب.',
    ].join('\n'));
  }

  /* argText = كل ما جا بعد الأمر خام (بالفراغات والـ |) — parts ما
     تنفعش هنا، هي مقسّمة على الفراغ والاسم فيه فراغات */
  const argText = text.slice(parts[0].length).trim();

  if (command === '/newproduct' || command === '/newprod') {
    return handleNewProduct(message, argText, reply);
  }
  if (command === '/newcategory' || command === '/newcat') {
    return handleNewCategory(argText, reply);
  }
  if (command === '/categories') return handleListCategories(reply);

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
    const [legacy, awaitingReturn, targets] = await Promise.all([
      getStock(), listAwaitingReturnReceipt(), stockTargets(),
    ]);
    const returnQty = awaitingReturn.reduce((sum, o) => sum + (o.qty ?? 0), 0);
    const lines = [];

    /*
     * العدّاد القديم يبان غير إذا فيه شي حاجة — الطلبات القديمة (والصفحة
     * الحالية) مازال يخدمو عليه، فما نخبّيوهش، بصح ما نعرضوهش فارغ
     * كي يولّي كلش على المنتجات.
     */
    if (legacy.qty > 0 || !targets.length) {
      const warn = legacy.qty <= legacy.threshold ? ' ⚠️' : '';
      lines.push(`📦 <b>${legacy.qty}</b>${warn}  (المخزون العام · حد التنبيه ${legacy.threshold})`);
    }

    /* الرقم قدّام كل سطر هو اللي تستعملو في /restock و/setstock —
       بلاه، ما كانش كيفاش تسمّي فاريانت معيّن في رسالة تيليغرام */
    let lastProduct = null;
    for (const target of targets) {
      if (target.productName !== lastProduct) {
        lines.push('', `<b>${esc(target.productName)}</b>`);
        lastProduct = target.productName;
      }
      const warn = target.stock.qty <= target.stock.threshold ? ' ⚠️' : '';
      lines.push(`  <b>${target.index}</b>) ${esc(target.label)} — <b>${target.stock.qty}</b>${warn}`);
    }

    if (targets.length) {
      lines.push('', `زوّد: <code>/restock ${targets.length > 1 ? '&lt;رقم&gt; ' : ''}10</code>`);
    }
    if (returnQty) {
      lines.push('', `🔁 رجعات معلّقة (لسّا ما تزادوش): <b>${returnQty}</b> — /state يوريك أشمن طلبات`);
    }
    return reply(lines.join('\n') || 'ما كاين حتى مخزون مسجّل.');
  }

  if (command === '/restock' || command === '/setstock') {
    const isSet = command === '/setstock';
    const targets = await stockTargets();

    /* بلا منتجات مسجّلة، نبقاو على العدّاد القديم — الصفحة القديمة
       تاع الطوق مازالت تخدم عليه */
    if (!targets.length) {
      const n = parseInt(arg, 10);
      if (!Number.isFinite(n) || (isSet ? n < 0 : n <= 0)) return reply(`استعمل: ${command} ${isSet ? 50 : 20}`);
      const stock = isSet ? await setStock(n) : await adjustStock(n);
      return reply(`✅ ${isSet ? 'تسجّل' : 'تزوّد'} المخزون. الكمية الحالية: <b>${stock.qty}</b>`);
    }

    /* منتج وحيد بفاريانت وحيد = ما نطلبوش رقم، الأمر يبقى /restock 10 */
    const [a, b] = parts.slice(1);
    let target = null;
    let amountRaw = a;
    if (b !== undefined) {
      const index = parseInt(a, 10);
      target = targets.find((t) => t.index === index) ?? null;
      amountRaw = b;
      if (!target) return reply(`ما لقيتش رقم <b>${esc(String(a))}</b>. شوف /stock للأرقام.`);
    } else if (targets.length === 1) {
      target = targets[0];
    } else {
      return reply('عندك أكثر من فاريانت — لازم رقم.\n'
        + `استعمل: <code>${command} &lt;رقم&gt; ${isSet ? 50 : 10}</code>\nشوف /stock للأرقام.`);
    }

    const n = parseInt(amountRaw, 10);
    if (!Number.isFinite(n) || (isSet ? n < 0 : n <= 0)) {
      return reply(`استعمل: <code>${command} ${targets.length > 1 ? '&lt;رقم&gt; ' : ''}${isSet ? 50 : 10}</code>`);
    }

    const updated = isSet
      ? await setVariantStock(target.productId, target.sku, n)
      : await adjustVariantStock(target.productId, target.sku, n);

    return reply(`✅ ${esc(target.productName)} — ${esc(target.label)}\n`
      + `الكمية الحالية: <b>${updated.qty}</b>`);
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
    const FIELDS = {
      product: { key: 'productCost', label: 'سوما البضاعة' },
      ads: { key: 'adsCost', label: 'تكلفة الإعلانات' },
      returns: { key: 'returnLoss', label: 'خسارة الرجعة' },
      /* التوصيل: صفر بالتلقائي — الزبون يخلّصو في الدفع عند الاستلام.
         اللي يخلّصو بروحو يحطّ رقمو هنا ويدخل في حساب الربح. */
      courier: { key: 'courierCost', label: 'تكلفة التوصيل (تخلّصها انت)' },
    };

    /* بلا فرعي: نعرضو التكاليف كاملة */
    if (!arg) {
      const costs = await getCosts();
      const courier = costs.courierCost ?? 0;
      return reply([
        '💰 <b>تكاليف الربح</b>',
        `سوما البضاعة (لكل وحدة): <b>${dz(costs.productCost)}</b>`,
        `تكلفة الإعلانات (لكل طلب): <b>${dz(costs.adsCost)}</b>`,
        `خسارة الرجعة (لكل طلب رجع): <b>${dz(costs.returnLoss)}</b>`,
        `تكلفة التوصيل: <b>${dz(courier)}</b>${courier === 0 ? ' (الزبون يخلّص)' : ''}`,
        '',
        '<b>الربح</b> = المجموع − سوما البضاعة×الكمية − الإعلانات − التوصيل',
        '',
        'بدّل بـ: /cost product 1800 — /cost ads 300 — /cost returns 800 — /cost courier 0',
      ].join('\n'));
    }

    const field = FIELDS[arg];
    const n = parseInt(parts[2], 10);
    if (!field || !Number.isFinite(n) || n < 0) {
      return reply('استعمل: /cost product 1800  ولا  /cost ads 300  ولا  /cost returns 800  ولا  /cost courier 0');
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

async function handler(request) {
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
    /* آخر واحد: رسالة عادية. handleFreeText تسكت على كل شي ما فيهش
       نيّة صريحة، فالهدرة العادية في الگروب ما تتلمسش. */
    else if (update.message?.text) await handleFreeText(update.message);
  } catch (error) {
    console.error('Webhook handler error:', error.message);
  }

  /* ديما 200: إذا رجعنا خطأ، تيليغرام يعاود يبعث نفس التحديث بلا فايدة */
  return new Response('ok');
}

/* توقيع Vercel هو (req,res) — الجسر في lib/http.mjs */
export default toVercel(handler);
