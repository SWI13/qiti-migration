/*
 * يستقبل نقرات الأزرار (قبول / رفض / توصّل / رجعت)، جواب سبب الرفض،
 * وأوامر المخزون (/stock, /restock, /setstock) من تيليغرام.
 *
 * ── قبول ─────────────────────────────────────────────────────────────
 *   نقرة → الرسالة تتبدّل وتزيد "✅ مقبول — شكون · الوقت"، أزرار القرار
 *   تتبدّل بزوج أزرار "📦 توصّل" / "↩️ رجعت" (زر واتساب يبقى)، والمخزون
 *   ينقص بكمية الطلب. إذا هبط للحد ولا تحتو، يتبعث تنبيه مخزون وحدة برك.
 *
 * ── رفض ──────────────────────────────────────────────────────────────
 *   نقرة → البوت يردّ على الرسالة ويطلب السبب (ForceReply، يحلّ الكيبورد
 *   مباشرة). كي تكتب السبب، رسالة الطلب تتبدّل وتزيد "❌ مرفوض" + السبب،
 *   ورسالة السؤال تتمسح.
 *
 * ── توصّل / رجعت (بعد القبول) ──────────────────────────────────────
 *   الطلب يبقى "مقبول" لأيام قبل ما نعرفو واش وصل فعلاً ولا رجع مع
 *   المُوصّل — علاش الأزرار تبقى بايّنة في نفس الرسالة، وتتسجّل في تقرير
 *   آخر النهار (قائمة "طلبات تستنّى نتيجة التوصيل") حتى لو ماشي من نفس
 *   اليوم. "رجعت" ترجّع الكمية للمخزون أوتوماتيكياً.
 *
 * الحالة كاملة تتخزّن في Netlify Blobs باش تقرير آخر النهار يقراها.
 *
 * ── environment variables ────────────────────────────────────────────
 *   TELEGRAM_BOT_TOKEN       — نفس التوكن تاع order.mjs
 *   TELEGRAM_WEBHOOK_SECRET  — كلمة سرّ تخترعها انت (أي نص عشوائي)
 *   TELEGRAM_CHAT_ID         — نفس id تاع order.mjs، يخدم هنا باش يحصر
 *                              أوامر المخزون في الگروب/الشات تاعك برك
 *
 * ── تشبيك الـ webhook (مرّة وحدة بعد الـ deploy) ─────────────────────
 *   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *     -d "url=https://<موقعك>.netlify.app/.netlify/functions/telegram-webhook" \
 *     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
 */
import {
  getOrder, updateOrder, rememberReplyPrompt, resolveReplyPrompt, forgetReplyPrompt,
  getStock, adjustStock, setStock, markLowStockAlerted,
} from '../lib/store.mjs';
import { ownerMessage, buttonsFor, esc } from '../lib/message.mjs';

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
async function checkLowStock(chatId, stock) {
  if (!stock || stock.qty > stock.threshold || stock.lowStockAlerted) return;
  await telegram('sendMessage', {
    chat_id: chatId,
    text: `⚠️ <b>تنبيه مخزون</b>\nباقي <b>${stock.qty}</b> طوق فقط — وقت التزويد!`,
    parse_mode: 'HTML',
  }).catch((error) => console.error('Low stock alert failed:', error.message));
  await markLowStockAlerted(true).catch((error) => console.error('markLowStockAlerted failed:', error.message));
}

/* ── نقرة زر ─────────────────────────────────────────────────────── */
async function handleCallback(query) {
  const message = query.message;
  const [action, orderId] = String(query.data ?? '').split(':');
  const who = displayName(query.from);

  const answer = (text) =>
    telegram('answerCallbackQuery', { callback_query_id: query.id, ...(text ? { text } : {}) })
      .catch((error) => console.error('answerCallbackQuery failed:', error.message));

  const isDecision = action === 'ok' || action === 'no';
  const isDeliveryOutcome = action === 'del' || action === 'ret';
  if (!message || (!isDecision && !isDeliveryOutcome)) return answer();

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

  if (action === 'ok') {
    /* ما نقبلوش طلب المخزون ما يكفيهش — الطلب يبقى بلا قرار حتى تزوّدو */
    if (order) {
      const needed = order.qty ?? 1;
      const stockBefore = await getStock().catch(() => null);
      if (stockBefore && stockBefore.qty < needed) {
        return answer(`🚫 المخزون ما يكفيش — باقي ${stockBefore.qty}، الطلب يحتاج ${needed}. زوّدو بـ /restock.`);
      }
    }

    try {
      const updated = await updateOrder(orderId, {
        status: 'accepted', actor: who, decidedAt: new Date().toISOString(), reason: null,
      });
      const record = updated ?? { ...order, messageId: message.message_id };
      await repaintOrder(message.chat.id, record);

      const stock = await adjustStock(-(record.qty ?? 0)).catch((error) => {
        console.error('Stock decrement failed:', error.message, '| order:', orderId);
        return null;
      });
      await checkLowStock(message.chat.id, stock);
    } catch (error) {
      console.error('Accept failed:', error.message, '| order:', orderId);
    }
    return answer('تقبّل الطلب ✅');
  }

  if (action === 'del' || action === 'ret') {
    const deliveryStatus = action === 'del' ? 'delivered' : 'returned';
    try {
      const updated = await updateOrder(orderId, {
        deliveryStatus, deliveryActor: who, deliveryDecidedAt: new Date().toISOString(),
      });
      if (!updated) return answer('الطلب ماشي موجود.');

      await repaintOrder(message.chat.id, updated);

      /* الطلبية رجعت للمخزن فعلياً — نرجّعو الكمية للمخزون */
      if (deliveryStatus === 'returned') {
        await adjustStock(updated.qty ?? 0).catch((error) =>
          console.error('Restock after return failed:', error.message, '| order:', orderId));
      }
    } catch (error) {
      console.error('Delivery outcome update failed:', error.message, '| order:', orderId);
      return answer('صار خطأ، عاود حاول.');
    }
    return answer(deliveryStatus === 'delivered' ? 'تسجّل: توصّل 📦' : 'تسجّل: رجعت الطلبية ↩️');
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

/* ── أوامر المخزون ────────────────────────────────────────────────
 * /stock            — يعرض الكمية الحالية وحد التنبيه
 * /restock <عدد>    — يزيد كمية للمخزون (بعد تزويد)
 * /setstock <عدد>   — يحطّ الكمية بالضبط (تصحيح، ولا الإعداد الأول)
 *
 * محصورة في الشات المسجّل في TELEGRAM_CHAT_ID: أي واحد آخر يحلّ محادثة
 * مباشرة مع البوت (خارج الگروب) ما يقدرش يبدّل المخزون.
 */
async function handleCommand(message) {
  const ownerChatId = process.env.TELEGRAM_CHAT_ID;
  if (!ownerChatId || String(message.chat.id) !== String(ownerChatId)) return;

  const [command, arg] = String(message.text ?? '').trim().split(/\s+/);
  const reply = (text) =>
    telegram('sendMessage', { chat_id: message.chat.id, text, parse_mode: 'HTML' })
      .catch((error) => console.error('Command reply failed:', error.message));

  if (command === '/stock') {
    const stock = await getStock();
    const warn = stock.qty <= stock.threshold ? ' ⚠️' : '';
    return reply(`📦 المخزون الحالي: <b>${stock.qty}</b> طوق${warn}\nحد التنبيه: ${stock.threshold}`);
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

  const site = process.env.URL ?? process.env.DEPLOY_URL;
  if (!site) return { ok: false, error: 'Site URL is not available in the environment' };

  const webhookUrl = `${site.replace(/\/$/, '')}/.netlify/functions/telegram-webhook`;

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
