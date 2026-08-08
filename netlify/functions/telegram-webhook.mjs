/*
 * يستقبل نقرات الأزرار (قبول / رفض) وجواب سبب الرفض من تيليغرام.
 *
 * ── قبول ─────────────────────────────────────────────────────────────
 *   نقرة → الرسالة تتبدّل وتزيد "✅ مقبول — شكون · الوقت"، وأزرار القرار
 *   تتنحّى (زر واتساب يبقى).
 *
 * ── رفض ──────────────────────────────────────────────────────────────
 *   نقرة → البوت يردّ على الرسالة ويطلب السبب (ForceReply، يحلّ الكيبورد
 *   مباشرة). كي تكتب السبب، رسالة الطلب تتبدّل وتزيد "❌ مرفوض" + السبب،
 *   ورسالة السؤال تتمسح.
 *
 * الحالة كاملة تتخزّن في Netlify Blobs باش تقرير آخر النهار يقراها.
 *
 * ── environment variables ────────────────────────────────────────────
 *   TELEGRAM_BOT_TOKEN       — نفس التوكن تاع order.mjs
 *   TELEGRAM_WEBHOOK_SECRET  — كلمة سرّ تخترعها انت (أي نص عشوائي)
 *
 * ── تشبيك الـ webhook (مرّة وحدة بعد الـ deploy) ─────────────────────
 *   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *     -d "url=https://<موقعك>.netlify.app/.netlify/functions/telegram-webhook" \
 *     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
 */
import { getOrder, updateOrder, rememberReplyPrompt, resolveReplyPrompt, forgetReplyPrompt } from '../lib/store.mjs';
import { ownerMessage, whatsappOnlyButtons, esc } from '../lib/message.mjs';

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
    reply_markup: whatsappOnlyButtons(record),
  });
}

/* ── نقرة زر ─────────────────────────────────────────────────────── */
async function handleCallback(query) {
  const message = query.message;
  const [action, orderId] = String(query.data ?? '').split(':');
  const who = displayName(query.from);

  const answer = (text) =>
    telegram('answerCallbackQuery', { callback_query_id: query.id, ...(text ? { text } : {}) })
      .catch((error) => console.error('answerCallbackQuery failed:', error.message));

  if (!message || (action !== 'ok' && action !== 'no')) return answer();

  const order = orderId ? await getOrder(orderId).catch(() => null) : null;

  /* الطلب تقرّر من قبل — ما نعاودوش، ونقولو لللي نقر */
  if (order && order.status !== 'pending') {
    const label = order.status === 'accepted' ? 'مقبول' : 'مرفوض';
    return answer(`الطلب راهو ${label} من قبل — ${order.actor ?? ''}`);
  }

  if (action === 'ok') {
    try {
      const updated = await updateOrder(orderId, {
        status: 'accepted', actor: who, decidedAt: new Date().toISOString(), reason: null,
      });
      await repaintOrder(message.chat.id, updated ?? { ...order, messageId: message.message_id });
    } catch (error) {
      console.error('Accept failed:', error.message, '| order:', orderId);
    }
    return answer('تقبّل الطلب ✅');
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

export default async function handler(request) {
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
  } catch (error) {
    console.error('Webhook handler error:', error.message);
  }

  /* ديما 200: إذا رجعنا خطأ، تيليغرام يعاود يبعث نفس التحديث بلا فايدة */
  return new Response('ok');
}
