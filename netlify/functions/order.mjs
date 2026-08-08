/*
 * يستقبل الطلب من فورم `#orderForm` ويبعثلك إشعار على تيليغرام.
 *
 * علاش تيليغرام ماشي واتساب: واتساب (سواء عبر Twilio ولا Meta) ما يخلّيكش
 * تبعث نص حر برّا نافذة 24 ساعة — لازم template معتمد من Meta على كل تغيير
 * في صيغة الرسالة. تيليغرام بلا حدود، بلا موافقة، وبلا فلوس.
 *
 * ── environment variables (في Netlify، ماشي في أي ملف هنا) ───────────
 *   TELEGRAM_BOT_TOKEN   — من @BotFather، شكلو 1234567890:AA...
 *   TELEGRAM_CHAT_ID     — الـ id تاعك، رقم مثل 123456789
 *
 * ── اختياري: SMS تأكيد للزبون عبر Twilio ─────────────────────────────
 *   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_SMS_FROM
 *   إذا ما حطّيتهمش، ما يتبعثش SMS للزبون والطلب يخدم عادي.
 *   ⚠️ حساب Twilio Trial يبعث غير للأرقام المتحقّق منها — أرقام الزبائن
 *      ما تخدمش حتى ترقّي الحساب لـ paid.
 */

const PRODUCT_PRICE = 3900;
const SHIPPING = { home: 600, desk: 400 };
const SHIPPING_LABEL = { home: 'للدار', desk: 'لمكتب التوصيل' };
const REQUEST_TIMEOUT_MS = 10_000;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

/** 0661445566 → +213661445566 (صيغة E.164) */
const toE164Dz = (localPhone) => `+213${localPhone.replace(/\D/g, '').replace(/^0/, '')}`;

const dz = (n) => `${n.toLocaleString('en-US')} دج`;

/*
 * الاسم والبلدية يكتبهم الزبون، فلازم نهربو الرموز اللي يفهمها تيليغرام كـ
 * HTML. بلا هذا، اسم فيه `<` يهرّس الرسالة كاملة (ولا يزيد markup ما بغيناهش).
 */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* نفس التحقّق اللي في المتصفّح — يتعاود هنا على خاطر ما نثقوش في الكليان */
function validate(order) {
  const name = String(order.name ?? '').trim();
  const phone = String(order.phone ?? '').replace(/\D/g, '');
  const wilaya = String(order.wilaya ?? '').trim();
  const commune = String(order.commune ?? '').trim();
  const shipping = order.shipping === 'desk' ? 'desk' : 'home';
  const qty = Math.max(1, Math.min(10, parseInt(order.qty, 10) || 1));

  if (name.length < 3 || name.length > 80) return { error: 'الاسم ماشي صحيح.' };
  if (!/^0[5-7]\d{8}$/.test(phone)) return { error: 'رقم الهاتف ماشي صحيح.' };
  if (!wilaya || wilaya.length > 40) return { error: 'الولاية ماشي صحيحة.' };
  if (commune.length < 2 || commune.length > 60) return { error: 'البلدية ماشي صحيحة.' };

  return { order: { name, phone, wilaya, commune, shipping, qty } };
}

const totalFor = ({ shipping, qty }) => PRODUCT_PRICE * qty + SHIPPING[shipping];

/*
 * الرقم مكتوب نص عادي (ماشي <code>) قصداً: تيليغرام يتعرّف على أرقام الهاتف
 * ويديرها قابلة للنقر — تنقر عليها وتعيّط مباشرة. <code> يديرها نسخ برك.
 */
const ownerMessage = (order) =>
  [
    '<b>🐱 طلب جديد — Qiti</b>',
    '',
    `<b>${esc(order.name)}</b>`,
    `📞 ${esc(toE164Dz(order.phone))}`,
    `📍 ${esc(order.wilaya)} / ${esc(order.commune)}`,
    `🚚 ${SHIPPING_LABEL[order.shipping]} — الكمية ×${order.qty}`,
    '',
    `<b>المجموع: ${dz(totalFor(order))}</b> — كاش عند الاستلام`,
  ].join('\n');

/*
 * أزرار تحت الرسالة. `callback_data` توصل لـ `telegram-webhook.mjs` كي تنقر.
 * ملاحظة: تيليغرام ما يقبلش روابط `tel:` في الأزرار ("Wrong port number") —
 * علاش زر الاتصال ما كاينش، وعوّضناه بالرقم القابل للنقر فوق + زر واتساب.
 */
const orderButtons = (order) => ({
  inline_keyboard: [
    [
      { text: '✅ قبول الطلب', callback_data: 'ok' },
      { text: '❌ رفض الطلب', callback_data: 'no' },
    ],
    [
      { text: '💬 راسل الزبون واتساب', url: `https://wa.me/${toE164Dz(order.phone).replace('+', '')}` },
    ],
  ],
});

/*
 * رسالة الزبون — مقصودة قصيرة. الحروف العربية تتبعث بترميز UCS-2، يعني
 * 70 حرف في كل segment (مقابل 160 بالحروف اللاتينية). خلّيها تحت 70 حرف
 * وإلا كل رسالة تحسبلك مرّتين ولا ثلاثة.
 */
const customerMessage = ({ name }) =>
  `شكراً ${name.split(' ')[0]}! طلبك من Qiti تسجّل، نتصلو بيك قريباً باش نأكّدوه.`;

async function notifyOwner(order) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not configured');

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: ownerMessage(order),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: orderButtons(order),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  /* تيليغرام يرجع 200 مع ok:false في بعض الأخطاء، فنتفقّدو الزوج */
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(`Telegram ${response.status}: ${result.description ?? 'unknown error'}`);
  }
}

async function notifyCustomer(order) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_FROM;
  if (!sid || !token || !from) return;   // ماشي مفعّل — عادي، إشعارك انت هو المهم

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: toE164Dz(order.phone), From: from, Body: customerMessage(order) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`Twilio ${response.status}: ${await response.text()}`);
}

/* ⚠️ مؤقّت — تشخيص الإعداد. يتنحّى كي نلقاو المشكل. ما يكشف حتى توكن. */
async function diagnose() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const report = {
    hasToken: Boolean(token),
    tokenEndsWith: token ? token.slice(-4) : null,
    tokenLength: token ? token.length : 0,
    hasChatId: Boolean(chatId),
    chatIdRaw: chatId ?? null,
    hasWebhookSecret: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
  };
  if (!token || !chatId) return report;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await res.json().catch(() => ({}));
    report.telegramCheck = body.ok
      ? `OK — ${body.result?.title ?? body.result?.first_name}`
      : `FAIL — ${body.description}`;
  } catch (error) {
    report.telegramCheck = `FAIL — ${error.message}`;
  }
  return report;
}

export default async function handler(request) {
  if (request.method === 'GET' && new URL(request.url).searchParams.has('diag')) {
    return json(200, await diagnose());
  }
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'طلب ماشي صحيح.' });
  }

  /* فخّ البوتات: حقل مخبّي، البشر ما يعمّروهش. نجاوبو بنجاح باش البوت ما يعاودش. */
  if (payload.website) return json(200, { ok: true });

  const { order, error } = validate(payload);
  if (error) return json(400, { error });

  /*
   * إشعارك انت هو الحرج — إذا فشل، الطلب يضيع، فنرجعو خطأ للزبون باش يعاود.
   * رسالة الزبون ثانوية: إذا فشلت وحدها، الطلب وصلك وخلاص، ما نوقفوش العملية.
   */
  const [ownerResult, customerResult] = await Promise.allSettled([
    notifyOwner(order),
    notifyCustomer(order),
  ]);

  if (customerResult.status === 'rejected') {
    console.error('Customer SMS failed:', customerResult.reason.message, '| phone:', order.phone);
  }

  if (ownerResult.status === 'rejected') {
    /* الطلب يبقى في لوغ الفنكشن حتى إذا تيليغرام فشل — ما نخسروش زبون. */
    console.error('Telegram notification failed:', ownerResult.reason.message, '| order:', JSON.stringify(order));
    return json(502, { error: 'ما قدرناش نسجّلو الطلب دروك. عاود حاول أو اتصل بينا مباشرة.' });
  }

  console.log('Order received:', JSON.stringify(order), '| customer SMS:', customerResult.status);
  return json(200, { ok: true });
}
