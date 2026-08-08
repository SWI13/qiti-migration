/*
 * يستقبل نقرات الأزرار (قبول / رفض) اللي تحت إشعار الطلب في تيليغرام.
 *
 * كي تنقر على زر، تيليغرام يبعث POST هنا. الفنكشن:
 *   1. تتأكّد أنّ الطلب جاي من تيليغرام فعلاً (secret token في الـ header).
 *   2. تبدّل نص الرسالة وتزيد سطر الحالة + شكون نقر + الوقت.
 *   3. تنحّي أزرار قبول/رفض (يبقى غير زر واتساب) باش ما تتنقرش مرّتين.
 *   4. تجاوب تيليغرام باش يوقّف الـ spinner على الزر.
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

const TELEGRAM_TIMEOUT_MS = 10_000;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ACTIONS = {
  ok: { label: '✅ <b>مقبول</b>', toast: 'تقبّل الطلب ✅' },
  no: { label: '❌ <b>مرفوض</b>', toast: 'تّرفض الطلب ❌' },
};

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

/*
 * تيليغرام يعطينا نص الرسالة بلا تنسيق (بلا <b>). نحنا اللي كتبنا الرسالة
 * في `order.mjs` فنعرفو بنيتها: السطر الأوّل عنوان، سطر الاسم، وسطر المجموع.
 * نعاودو نحطّو الـ bold عليهم. إذا بدّلتي صيغة الرسالة، أسوأ حاجة تصرا هي
 * أنّ الرسالة تولّي بلا تنسيق — المعلومة تبقى كاملة.
 */
function reformat(plainText) {
  return plainText
    .split('\n')
    .map((line, i) => {
      if (i === 0) return `<b>${esc(line)}</b>`;
      if (line.startsWith('المجموع:')) return `<b>${esc(line)}</b>`;
      /* سطر الاسم: الوحيد اللي ما فيهش إيموجي ولا فارغ */
      if (i === 2 && line.trim()) return `<b>${esc(line)}</b>`;
      return esc(line);
    })
    .join('\n');
}

const dzTime = () =>
  new Date().toLocaleString('fr-DZ', {
    timeZone: 'Africa/Algiers',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

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

  const query = update.callback_query;
  if (!query) return new Response('ok');   /* تحديثات أخرى ما تهمّناش */

  const action = ACTIONS[query.data];
  const message = query.message;

  if (!action || !message) {
    await telegram('answerCallbackQuery', { callback_query_id: query.id }).catch(() => {});
    return new Response('ok');
  }

  const who = esc([query.from.first_name, query.from.last_name].filter(Boolean).join(' ') || 'مجهول');
  /* زر واتساب يبقى — يفيد حتى بعد ما يتقبّل الطلب */
  const keptButtons = (message.reply_markup?.inline_keyboard ?? []).filter((row) =>
    row.every((button) => button.url),
  );

  try {
    await telegram('editMessageText', {
      chat_id: message.chat.id,
      message_id: message.message_id,
      text: `${reformat(message.text)}\n\n${action.label} — ${who} · ${dzTime()}`,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: keptButtons },
    });
  } catch (error) {
    console.error('Failed to update order message:', error.message);
  }

  /* لازم نجاوبو دايماً وإلا الزر يبقى يلوّح spinner عند المستخدم */
  await telegram('answerCallbackQuery', {
    callback_query_id: query.id,
    text: action.toast,
  }).catch((error) => console.error('answerCallbackQuery failed:', error.message));

  return new Response('ok');
}
