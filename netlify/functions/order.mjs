/*
 * يستقبل الطلب من فورم `#orderForm`، يسجّلو، ويبعثلك إشعار على تيليغرام
 * فيه أزرار قبول / رفض.
 *
 * علاش تيليغرام ماشي واتساب: واتساب (سواء عبر Twilio ولا Meta) ما يخلّيكش
 * تبعث نص حر برّا نافذة 24 ساعة — لازم template معتمد من Meta على كل تغيير
 * في صيغة الرسالة. تيليغرام بلا حدود، بلا موافقة، وبلا فلوس.
 *
 * ── environment variables (في Netlify، ماشي في أي ملف هنا) ───────────
 *   TELEGRAM_BOT_TOKEN   — من @BotFather، شكلو 1234567890:AA...
 *   TELEGRAM_CHAT_ID     — id تاع الشات ولا الگروب (الگروب يبدا بـ -)
 *
 * ── اختياري: SMS تأكيد للزبون عبر Twilio ─────────────────────────────
 *   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_SMS_FROM
 *   إذا ما حطّيتهمش، ما يتبعثش SMS للزبون والطلب يخدم عادي.
 *   ⚠️ حساب Twilio Trial يبعث غير للأرقام المتحقّق منها — أرقام الزبائن
 *      ما تخدمش حتى ترقّي الحساب لـ paid.
 */
import { newOrderId, saveOrder, updateOrder, algiersDate } from '../lib/store.mjs';
import { ownerMessage, orderButtons, toE164Dz, totalFor } from '../lib/message.mjs';

const REQUEST_TIMEOUT_MS = 10_000;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

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

/*
 * رسالة الزبون — مقصودة قصيرة. الحروف العربية تتبعث بترميز UCS-2، يعني
 * 70 حرف في كل segment (مقابل 160 بالحروف اللاتينية). خلّيها تحت 70 حرف
 * وإلا كل رسالة تحسبلك مرّتين ولا ثلاثة.
 */
const customerMessage = ({ name }) =>
  `شكراً ${name.split(' ')[0]}! طلبك من Qiti تسجّل، نتصلو بيك قريباً باش نأكّدوه.`;

/** يرجع message_id باش نخزّنوه ونقدرو نبدّلو الرسالة من بعد */
async function notifyOwner(record) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not configured');

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: ownerMessage(record),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: orderButtons(record),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  /* تيليغرام يرجع 200 مع ok:false في بعض الأخطاء، فنتفقّدو الزوج */
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(`Telegram ${response.status}: ${result.description ?? 'unknown error'}`);
  }
  return result.result;
}

async function notifyCustomer(record) {
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
    body: new URLSearchParams({ To: toE164Dz(record.phone), From: from, Body: customerMessage(record) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`Twilio ${response.status}: ${await response.text()}`);
}

export default async function handler(request) {
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

  const now = new Date();
  const record = {
    ...order,
    id: newOrderId(now),
    total: totalFor(order),
    day: algiersDate(now),
    createdAt: now.toISOString(),
    status: 'pending',
    actor: null,
    reason: null,
    decidedAt: null,
    messageId: null,
    deliveryStatus: null,
    deliveryActor: null,
    deliveryDecidedAt: null,
    returnReceivedAt: null,
    returnReceivedActor: null,
  };

  /*
   * نسجّلو الطلب قبل ما نبعثو: حتى لو تيليغرام طاح، الطلب يبقى محفوظ
   * ويبان في تقرير آخر النهار.
   */
  try {
    await saveOrder(record);
  } catch (err) {
    console.error('Failed to persist order:', err.message, '| order:', JSON.stringify(record));
  }

  /*
   * إشعارك انت هو الحرج — إذا فشل، الطلب يضيع، فنرجعو خطأ للزبون باش يعاود.
   * رسالة الزبون ثانوية: إذا فشلت وحدها، الطلب وصلك وخلاص، ما نوقفوش العملية.
   */
  const [ownerResult, customerResult] = await Promise.allSettled([
    notifyOwner(record),
    notifyCustomer(record),
  ]);

  if (customerResult.status === 'rejected') {
    console.error('Customer SMS failed:', customerResult.reason.message, '| phone:', record.phone);
  }

  if (ownerResult.status === 'rejected') {
    /* الطلب يبقى في اللوغ وفي التخزين حتى إذا تيليغرام فشل — ما نخسروش زبون. */
    console.error('Telegram notification failed:', ownerResult.reason.message, '| order:', JSON.stringify(record));
    return json(502, { error: 'ما قدرناش نسجّلو الطلب دروك. عاود حاول أو اتصل بينا مباشرة.' });
  }

  /* نخزّنو message_id باش الويبهوك يقدر يبدّل نفس الرسالة كي تنقر على زر */
  const messageId = ownerResult.value?.message_id ?? null;
  if (messageId) {
    await updateOrder(record.id, { messageId }).catch((err) =>
      console.error('Failed to store message id:', err.message),
    );
  }

  console.log('Order received:', record.id, JSON.stringify(order), '| customer SMS:', customerResult.status);
  return json(200, { ok: true });
}
