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
import {
  newOrderId, saveOrder, updateOrder, algiersDate, listOrdersByPhone, getBlockEntry, getOrder,
} from '../lib/store.mjs';
import { ownerMessage, orderButtons, buttonsFor, toE164Dz, totalFor, totalWith } from '../lib/message.mjs';
import { convertLead, sweepLeads } from '../lib/leads.mjs';
import { getProduct, getCampaign, matchVariant, variantPrice, SIMPLE_SKU } from '../lib/catalog.mjs';
import { findBundle, upsellOf, linesTotal } from '../lib/offers.mjs';
/* منتج الصفحة الستاتيك — الطلب الجاي منها ما فيهش productId */
import { legacyProduct } from '../lib/legacy-stock.mjs';
import { sanitizeAttribution, channelKey } from '../lib/attribution.mjs';
import { sendMetaEvent } from '../lib/meta.mjs';
import { sendTikTokEvent, resolvePixelId } from '../lib/tiktok.mjs';
import { getSettings } from '../lib/settings.mjs';
import { checkTrust, clientIp } from '../lib/trust.mjs';
import { wilayaId } from '../lib/wilayas.mjs';
import { shippingFee, deskAvailable, isServed } from '../lib/shipping-rates.mjs';
import { logEvent } from '../lib/audit.mjs';
import { toVercel } from '../lib/http.mjs';
import { claim, release } from '../lib/locks.mjs';
import { hit, requestIp, tooManyRequests } from '../lib/rate-limit.mjs';

const REQUEST_TIMEOUT_MS = 10_000;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

/*
 * سطور الطلب — واش تباع بالضبط.
 *
 * ⚠️ السومة تتحسب هنا من الحملة والمنتجات المخزّنة. المتصفّح يبعث
 * `bundleId` برك: أي رقم جاي منّو يتجاهل. نفس القاعدة تاع productId.
 *
 * الباقة تعوّض سطر المنتج (الزبون يختار: وحدة ولا باقة)، والعرض الإضافي
 * يتزاد كسطر ثالث كي يقبلو. الشكل عام — طلب فيه الثلاثة مع بعض يتخزّن
 * ويتقرا بلا تبديل، حتى لو الفورم الحالي ما يبيعش هكذا.
 */
async function bundleLineFor(campaign, bundleId, qty) {
  const bundle = findBundle(campaign, bundleId);
  if (!bundle) return null;

  /* أسماء العناصر لقطة وقت الطلب: تبديل اسم منتج غداً ما يبدّلش واش
     كان مكتوب في الطلبية اللي شدّيتها بيدك. */
  const items = [];
  for (const item of bundle.items) {
    const product = await getProduct(item.productId).catch(() => null);
    items.push({
      productId: item.productId,
      sku: item.sku ?? SIMPLE_SKU,
      name: product?.name ?? null,
      qty: item.qty,
    });
  }

  return {
    kind: 'bundle',
    bundleId: bundle.id,
    productId: null,
    sku: null,
    name: bundle.name,
    qty,
    unitPrice: bundle.price,
    lineTotal: bundle.price * qty,
    items,
  };
}

async function upsellLineFor(campaign) {
  const upsell = upsellOf(campaign);
  if (!upsell) return null;

  const product = await getProduct(upsell.productId).catch(() => null);
  return {
    kind: 'upsell',
    productId: upsell.productId,
    sku: upsell.sku ?? SIMPLE_SKU,
    name: upsell.title ?? product?.name ?? null,
    qty: 1,
    unitPrice: upsell.price,
    lineTotal: upsell.price,
    items: null,
  };
}

/* نفس التحقّق اللي في المتصفّح — يتعاود هنا على خاطر ما نثقوش في الكليان */
function validate(order) {
  const name = String(order.name ?? '').trim();
  const phone = String(order.phone ?? '').replace(/\D/g, '');
  const wilaya = String(order.wilaya ?? '').trim();
  const commune = String(order.commune ?? '').trim();
  /* ولاية بلا مكتب DHD: الطلب يولّي للدار. الفورم يعمي الخيار، بصح
     الطلب يقدر يجي من صفحة قديمة ولا من سكريبت — والوعد بمكتب ما
     كاينش أسوأ من تبديل صامت للدار. */
  const shipping = order.shipping === 'desk' && deskAvailable(wilaya) ? 'desk' : 'home';
  const qty = Math.max(1, Math.min(10, parseInt(order.qty, 10) || 1));

  if (name.length < 3 || name.length > 80) return { error: 'الاسم ماشي صحيح.' };
  if (!/^0[5-7]\d{8}$/.test(phone)) return { error: 'رقم الهاتف ماشي صحيح.' };
  /*
   * ⚠️ الاسم لازم يكون وحدة من الـ58، ماشي أي نص طولو تحت 40 حرف.
   *
   * قبل، الفحص كان `isServed(wilaya)` وحدو — و`isServed` تمرّ على
   * `rateFor` اللي ترجّع DEFAULT_RATE لأي اسم ما تعرفوش. يعني
   * "لا-وجود" ولا `"x"` كانو يعدّيو، والطلب يتخزّن بتسعيرة 600
   * افتراضية. ما يبانش غلط حتى ساعة إنشاء الطردة، وتمّة `wilayaId()`
   * ترجّع null والموصّل يردّها بـ "الولاية غير معروفة" — بعد ما
   * تكون قبلتي الطلب، نقّصتي المخزون، وعيّطتي للزبونة.
   *
   * التسعيرة الافتراضية تبقى كيما هي لولاية **معروفة** ما وصلاتناش
   * سومتها — هذاك هو معناها، ماشي "اقبل أي نص".
   */
  if (!wilaya || !wilayaId(wilaya)) return { error: 'الولاية ماشي صحيحة.' };
  /* DHD ما توصّلش لثلاث ولايات. القبول ونحنا نعرفو بلّي ما نقدروش
     نوصّلو = مكالمة اعتذار من بعد، وزبون يحكي عليها. */
  if (!isServed(wilaya)) return { error: 'ما نوصلوش لهذي الولاية حالياً. اتصل بينا ونشوفو حل.' };
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

/*
 * العرض الإضافي بضغطة وحدة.
 *
 * ── علاش هنا وماشي في فنكشن جديدة ──────────────────────────────────
 * خطة Vercel Hobby محدودة في عدد الفنكشنات، وراهي شبه معمّرة. الطلب
 * والعرض الإضافي نفس الشي تقريباً (نفس الطلب، نفس الرسالة)، فزدناه
 * كـ action هنا بدل ملف جديد.
 *
 * ⚠️ السومة تجي من الحملة، ماشي من المتصفّح. والضغطة تخدم غير على طلب
 * مازال ما تقرّرش فيه (pending) وما عندوش عرض من قبل — وإلا ضغطتين
 * يزيدو زوج سطور ويكذّبو المجموع.
 */
async function acceptUpsell(payload) {
  const orderId = String(payload.orderId ?? '').slice(0, 64);
  if (!orderId) return json(400, { error: 'الطلب ماشي معروف.' });

  /* ضغطتين سراع (شبكة بطيئة، الزبونة تعاود تنقر) كانو يزيدو زوج سطور
     على نفس الطلب ويضاعفو المجموع — الفحص تحت يقرا قبل ما يكتب. */
  if (!await claim(orderId, 'upsell')) {
    return json(409, { error: 'العرض راه يتزاد دروك.' });
  }

  /* الرفض المتوقّع يحلّ القفل: ما تبدّل والو، فالإعادة لازم تخدم */
  const refuse = async (status, body) => {
    await release(orderId, 'upsell');
    return json(status, body);
  };

  const order = await getOrder(orderId);
  if (!order) return refuse(404, { error: 'الطلب ماشي موجود.' });
  if (order.status !== 'pending') return refuse(409, { error: 'الطلب تقرّر فيه من قبل.' });
  if ((order.lines ?? []).some((line) => line.kind === 'upsell')) {
    return refuse(200, { ok: true, total: order.total, already: true });
  }

  const campaign = order.campaignId ? await getCampaign(order.campaignId).catch(() => null) : null;
  const line = await upsellLineFor(campaign);
  if (!line) return refuse(409, { error: 'العرض ماشي مفعّل.' });

  const lines = [...(order.lines ?? []), line];
  const total = linesTotal(lines) + (order.shippingFee ?? 0);
  const updated = await updateOrder(orderId, {
    lines,
    total,
    upsellAcceptedAt: new Date().toISOString(),
  });

  /* الرسالة في تيليغرام تتعاود ترسم بالمجموع الجديد — وإلا تشدّ الطلبية
     على القديم وتنسى القطعة الزايدة. */
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (updated?.messageId && token && chatId) {
    await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: updated.messageId,
        text: ownerMessage(updated),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: buttonsFor(updated),
      }),
    }).catch((err) => console.error('Upsell repaint failed:', err.message, '| order:', orderId));
  }

  return json(200, { ok: true, total: updated?.total ?? total, id: orderId });
}

async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'طلب ماشي صحيح.' });
  }

  /* فخّ البوتات: حقل مخبّي، البشر ما يعمّروهش. نجاوبو بنجاح باش البوت ما يعاودش. */
  if (payload.website) return json(200, { ok: true });

  /*
   * تحديد المعدّل بالـ IP — قبل أي كتابة وأي نداء برّاني.
   *
   * ⚠️ فخّ البوتات فوق يشدّ الزحف الغبي برك. اللي يشوف الفورم مرّة
   * وحدة يعرف يتخطّاه، وبعدها ولا حاجة توقفو من يغرق الگروب بطلبات
   * مزوّرة — والطلبات الحقيقية تضيع بيناتهم.
   */
  const ip = requestIp(request);
  const ipLimit = await hit('order', ip);
  if (!ipLimit.allowed) {
    console.warn('Rate limit hit:', ipLimit.count, 'orders from', ip);
    return tooManyRequests(ipLimit.retryAfter);
  }

  /* ضغطة "زيدها" بعد الطلب — ما تعاودش تمرّ على التحقّق تاع الفورم */
  if (payload.action === 'upsell') return acceptUpsell(payload);

  const { order, error } = validate(payload);
  if (error) return json(400, { error });

  /*
   * والرقم تاني: IP يتبدّل (4G يعطي واحد جديد كل شوية)، والرقم لا.
   * الحدّ هنا أضيق — الزبونة اللي تعاود على خاطر ما شافتش شاشة النجاح
   * تدير زوج محاولات، ماشي أربعة.
   */
  const phoneLimit = await hit('order-phone', order.phone);
  if (!phoneLimit.allowed) {
    console.warn('Rate limit hit:', phoneLimit.count, 'orders for phone', order.phone);
    return tooManyRequests(phoneLimit.retryAfter, 'سجّلنا طلبك من قبل. نتصلو بيك قريباً.');
  }

  const now = new Date();
  const attribution = sanitizeAttribution(payload.attribution);

  /*
   * واش راه يتطلب — نجيبوه من التخزين بالـ id، ماشي من الـ payload.
   * المتصفّح يبعث `productId` برك؛ السومة والخيارات نقراوهم من عندنا.
   *
   * علاش هذا حرج: قبل، السيرفر كان يحسب PRODUCT_PRICE=3900 مهما كان
   * المنتج. منتج بـ 5500 كان يتسجّل بـ 3900 — الزبون يشوف رقم في
   * الصفحة، والمُوصّل يجبى رقم آخر.
   *
   * الصفحة القديمة (index.html) ما تبعثش productId، فنرجعو للطريق
   * القديم بلاه — الموقع الحالي يبقى خدّام كيما هو.
   */
  const product = payload.productId
    ? await getProduct(String(payload.productId)).catch((err) => {
        console.error('Product lookup failed:', err.message, '| id:', payload.productId);
        return null;
      })
    : null;

  /*
   * الصفحة الستاتيك ما تبعثش productId، فالطلب كان يوصل بلا منتج —
   * ومخزونو ينقص من عدّاد عام ما يبان في اللوحة (شوف lib/legacy-stock.mjs).
   * دروك نعلّقوه بمنتج الطوق الحقيقي، فالقبول ينقّص نفس الرقم اللي
   * تشوفو في اللوحة، والتقارير تعرف اسم السلعة وتكلفتها.
   *
   * ⚠️ للمخزون والتقارير برك — السومة تبقى تتحسب بالطريق القديم تحت.
   * السومة مكتوبة في الـ HTML الستاتيك، فلو نحسبو بسومة المنتج
   * وتبدّلها من اللوحة، الصفحة توري رقم والمُوصّل يجبى رقم آخر.
   */
  const stockProduct = product ?? await legacyProduct().catch((err) => {
    console.error('Legacy product lookup failed:', err.message);
    return null;
  });

  let variant = null;
  if (product) {
    variant = matchVariant(product, payload.options ?? {});
    /*
     * منتج بخيارات (مقاس/لون) والزبون ما اختارش وحدة صحيحة — نوقفو.
     * أحسن ما نسجّلو طلبية ما نعرفوش واش نبعثو فيها.
     */
    if (!variant) return json(400, { error: 'اختر المقاس واللون قبل ما تأكّد.' });
  }

  /*
   * الحملة تجيب معاها الباقات والعرض الإضافي. طلب بلا campaignId (صفحة
   * index.html الستاتيك) يخدم كيما كان بالضبط — campaign تبقى null وكل
   * ما تحت يتخطّى.
   */
  const campaignId = typeof payload.campaignId === 'string' ? payload.campaignId.slice(0, 64) : null;
  const campaign = campaignId && !campaignId.startsWith('product:')
    ? await getCampaign(campaignId).catch((err) => {
        console.error('Campaign lookup failed:', err.message, '| id:', campaignId);
        return null;
      })
    : null;

  const bundleLine = campaign && payload.bundleId
    ? await bundleLineFor(campaign, String(payload.bundleId).slice(0, 64), order.qty)
    : null;

  const unitPrice = product && variant ? variantPrice(product, variant) : null;

  /*
   * السطور: باقة ولا منتج، ماشي الزوج — الفورم يخيّر بيناتهم.
   * `lines` هو المصدر الوحيد للمخزون وللتكلفة، والحقول القديمة
   * (productId/unitPrice/qty) تبقى معمّرة باش كل كود قديم يبقى يخدم.
   */
  const lines = bundleLine
    ? [bundleLine]
    : [{
        kind: 'product',
        /* منتج الصفحة الستاتيك يدخل هنا كي ما يجيش productId — هذا
           السطر هو مصدر مراجع المخزون (شوف orderStockRefs) */
        productId: stockProduct?.id ?? null,
        sku: variant?.sku ?? SIMPLE_SKU,
        name: stockProduct?.name ?? null,
        qty: order.qty,
        unitPrice,
        lineTotal: unitPrice === null ? null : unitPrice * order.qty,
        items: null,
      }];

  const total = bundleLine
    ? linesTotal(lines) + shippingFee(order.wilaya, order.shipping)
    : (unitPrice !== null ? totalWith(unitPrice, order) : totalFor(order));

  /*
   * تاريخ الزبون بهذا الرقم — لازم **قبل** ما نسجّلو الطلب الجديد، وإلا
   * يدخل هو نفسو في العدّ (نفس الرقم) ويفسد النتيجة.
   *
   * وجهين، ماشي وجه واحد: `delivered` مهمّة قد `denied`/`returned`.
   * زبون خلّص وستلم 3 مرّات قبل هذا هو أحسن طلب يقدر يجيك — وقبل هذا
   * التبديل كان يبان كيما أي واحد جديد، بلا أي إشارة.
   */
  /*
   * الزوج مع بعض (parallel): تاريخك انت + فحص الثقة البرّاني. الزبون
   * مستنّى، فما نخلّوهمش واحد ورا الآخر. `checkTrust` ما يرمي خطأ عمرو —
   * يرجع null إذا ما خدمش، والطلب يكمّل عادي بلاه.
   */
  const [pastOrders, trust, blocked] = await Promise.all([
    listOrdersByPhone(order.phone).catch((err) => {
      console.error('Failed to fetch customer history:', err.message, '| phone:', order.phone);
      return [];
    }),
    checkTrust({
      phone: order.phone,
      wilayaId: wilayaId(order.wilaya),
      orderValue: total,
      ip: clientIp(request),
    }),
    getBlockEntry(order.phone).catch((err) => {
      console.error('Blocklist check failed:', err.message, '| phone:', order.phone);
      return null;
    }),
  ]);

  const customerHistory = {
    delivered: pastOrders.filter((o) => o.deliveryStatus === 'delivered').length,
    denied: pastOrders.filter((o) => o.status === 'denied').length,
    returned: pastOrders.filter((o) => o.deliveryStatus === 'returned').length,
  };

  const record = {
    ...order,
    id: newOrderId(now),
    total,
    day: algiersDate(now),
    createdAt: now.toISOString(),
    /*
     * واش تباع بالضبط — لقطة وقت الطلب، ماشي إشارة للمنتج.
     * لو خزّنا الإشارة برك، تبديل سومة المنتج غداً يعاود يكتب تاريخ
     * الطلبيات القديمة ويخرّب حساب الربح تاع الشهر اللي فات.
     */
    productId: stockProduct?.id ?? null,
    productName: stockProduct?.name ?? null,
    campaignId,
    variant: variant ? { sku: variant.sku, options: variant.options } : null,
    unitPrice: bundleLine ? bundleLine.unitPrice : unitPrice,
    /* واش تباع بالضبط — سطر لكل حاجة. شوف lib/offers.mjs */
    lines,
    /* واش تعرض عليه عرض إضافي أصلاً — بلا هذا، نسبة القبول تتحسب على
       كل الطلبات وتبان أصغر بزّاف مما هي. */
    upsellOffered: Boolean(upsellOf(campaign)),
    upsellAcceptedAt: null,
    /* سومة التوصيل مخزّنة صراحةً: total فيه سومة السلعة + التوصيل،
       والمداخيل/الربح لازمهم السلعة وحدها. تخزينها هنا يخلّي الحساب
       صحيح حتى لو بدّلنا تسعيرة التوصيل من بعد — الطلبات القديمة تبقى
       بسومتها هي، ما تتعاودش تتحسب بتسعيرة اليوم. */
    shippingFee: shippingFee(order.wilaya, order.shipping),
    /* منين جا الزبون — يبان في الرسالة ويتجمّع في التقارير حسب القناة */
    attribution,
    channel: channelKey(attribution),
    /*
     * بيكسل الحملة وقت الطلب — لقطة، ماشي إشارة.
     * حدث CompletePayment يتبعث من بعد أيام (كي توصّل الطردة). لو
     * قرينا بيكسل الحملة وقتها، وكان المشغّل بدّلو، التحويلة تروح
     * لحساب إعلاني ما صرفش عليها، والحساب اللي صرف ما يشوف والو.
     */
    tiktokPixelId: resolvePixelId({
      campaign,
      settings: await getSettings().catch(() => null),
    }) || null,
    status: 'pending',
    actor: null,
    reason: null,
    decidedAt: null,
    /* التأكيد بالتيليفون قبل القبول — الحاجة اللي تنقّص الرجعات أكثر من كلش */
    confirmedAt: null,
    confirmedBy: null,
    confirmedBeforeAccept: null,
    messageId: null,
    /* رسالة تيليغرام ما وصلاتش — الطلب يبقى صحيح، بصح لازم يبان
       للمشغّل بلاصة ما (شوف الجواب على ownerResult تحت). */
    notifyError: null,
    notifyErrorAt: null,
    deliveryStatus: null,
    deliveryActor: null,
    deliveryDecidedAt: null,
    returnReceivedAt: null,
    returnReceivedActor: null,
    /*
     * نخزّنو لقطة التاريخ وقت الطلب (ماشي نحسبوها كل مرّة): هكذا نقدرو
     * من بعد نشوفو واش التنبيه كان صحيح — الطلبات المعلّمة بالأحمر واش
     * رجعت فعلاً أكثر من غيرها؟ بلا تخزين، ما كانش كيفاش نتأكّدو.
     */
    customerHistory,
    /*
     * نتيجة الفحص البرّاني — تتخزّن باش من بعد تشوف واش النقاط كانت
     * تتنبّأ فعلاً بالرجعات (نفس منطق customerHistory). null = الفحص
     * ماشي مفعّل ولا ما خدمش.
     */
    trust,
    /* قائمة الحظر اليدوية تاعك — تغلب فحص الثقة في العرض */
    blocked,
  };

  /*
   * نسجّلو الطلب قبل ما نبعثو: حتى لو تيليغرام طاح، الطلب يبقى محفوظ
   * ويبان في تقرير آخر النهار.
   */
  /*
   * ⚠️ التخزين هو الحاجة الوحيدة اللي فشلها يخصّر الطلب.
   *
   * قبل، الفشل كان يتسجّل في اللوغ والفنكشن تكمّل وترجّع 200 — الزبونة
   * تشوف "تسجّل طلبك" وما تسجّل والو. دروك نرجّعو 503: ما تكتب حتى
   * حاجة، فالإعادة ما تدير تكرار.
   */
  try {
    await saveOrder(record);
  } catch (err) {
    console.error('Failed to persist order:', err.message, '| order:', JSON.stringify(record));
    await logEvent({
      action: 'order.createFailed',
      source: 'storefront',
      actorType: 'customer',
      status: 'failed',
      error: err.message,
      entityType: 'order',
      entityId: record.id,
      orderId: record.id,
      productId: record.productId,
      customerPhone: record.phone,
      description: 'التخزين طاح — الطلب ما تسجّلش',
    });
    return json(503, { error: 'ما قدرناش نسجّلو الطلب دروك. عاود حاول أو اتصل بينا مباشرة.' });
  }

  /*
   * ⚠️ الطلب يتسجّل في السجلّ بعد ما يتخزّن، ماشي قبل: سطر يقول
   * "طلب تصنع" على طلب ما تخزّنش يخلّي المشغّل يقلّب على طلب ما
   * كانش. الترتيب هنا هو الفرق بين سجلّ يتثق فيه وسجلّ يكذب.
   */
  await logEvent({
    action: 'order.created',
    source: 'storefront',
    actorType: 'customer',
    actorName: record.name ?? null,
    entityType: 'order',
    entityId: record.id,
    orderId: record.id,
    productId: record.productId,
    customerPhone: record.phone,
    description: `طلب جديد من ${record.wilaya ?? ""} — ${record.total} دج`,
    newValues: {
      status: 'pending',
      total: record.total,
      qty: record.qty,
      wilaya: record.wilaya,
      commune: record.commune,
      shipping: record.shipping,
    },
    metadata: { channel: record.channel ?? null, blocked: Boolean(record.blocked) },
  });

  /*
   * الزبون كان مسجّل كـ "ما كملش" وها هو كمّل — رسالة الـ lead روحها
   * تولّي "✅ كمّل الطلب"، وأزرار المكالمة تطيح منها. بلا هذا، تلقى
   * في الگروب رسالة تقولّك عيّطلو، وتحتها بسطر رسالة الطلب تاعو.
   *
   * ⚠️ بالـ await: خدمة تبقى بعد الجواب تتقتل في Vercel.
   */
  await convertLead(record.phone, record.id).catch((err) =>
    console.error('Lead conversion failed:', err.message, '| phone:', record.phone));

  /* شبكة أمان لـ leads فشل إشعارهم — شوف lib/leads.mjs */
  sweepLeads().catch(() => {});

  /*
   * إشعارك انت هو الحرج — إذا فشل، الطلب يضيع، فنرجعو خطأ للزبون باش يعاود.
   * رسالة الزبون ثانوية: إذا فشلت وحدها، الطلب وصلك وخلاص، ما نوقفوش العملية.
   */
  const [ownerResult, customerResult, metaResult, tiktokResult] = await Promise.allSettled([
    notifyOwner(record),
    notifyCustomer(record),
    /*
     * Lead ماشي Purchase: الطلب دروك ماشي فلوس، يقدر يرجع. حدث Purchase
     * يتبعث غير كي الطلبية توصّل فعلاً (شوف telegram-webhook.mjs).
     */
    sendMetaEvent('Lead', record),
    /*
     * تيك توك تسمّيه PlaceAnOrder. المتصفّح يبعث نفس الحدث بنفس الـ
     * `event_id` — تيك توك تحسبهم واحد. علاش الزوج: المتصفّح عندو
     * كوكي `_ttp`، والسيرفر عندو رقم الهاتف؛ المطابقة تولّي أقوى من
     * الزوج معاً، والسيرفر يوصل حتى لو البيكسل محجوب.
     */
    sendTikTokEvent('PlaceAnOrder', record, { value: record.total }),
  ]);

  if (customerResult.status === 'rejected') {
    console.error('Customer SMS failed:', customerResult.reason.message, '| phone:', record.phone);
  }

  /* التتبّع ما يوقّفش الطلب أبداً — نسجّلو الخطأ ونكمّلو */
  const meta = metaResult.status === 'fulfilled' ? metaResult.value : { error: metaResult.reason?.message };
  if (meta?.error) console.error('Meta CAPI Lead failed:', meta.error, '| order:', record.id);

  const tiktok = tiktokResult.status === 'fulfilled' ? tiktokResult.value : { error: tiktokResult.reason?.message };
  if (tiktok?.error) console.error('TikTok Events PlaceAnOrder failed:', tiktok.error, '| order:', record.id);

  /*
   * ⚠️ تيليغرام طبقة إشعار، ماشي جزء من الطلب.
   *
   * قبل، فشلو كان يرجّع 502 بـ "ما قدرناش نسجّلو الطلب" — والطلب راه
   * **مسجّل** فوق بسطرين. الزبونة تقرا "عاود حاول" وتبعث مرّة ثانية،
   * فيولّي عندك زوج طلبات على نفس السلعة بزوج أرقام مختلفين. يعني
   * انقطاع عند تيليغرام كان يولّد طلبات مكرّرة بدل ما يمنع وحدة.
   *
   * دروك الجواب نجاح (الطلب محفوظ فعلاً)، والفشل يتعلّم على السجلّ:
   * `notifyError` يخلّي التقرير اليومي والصفّ يبيّنو الطلب اللي عمرها
   * ما وصلات رسالتو، بدل ما يضيع في اللوغ.
   */
  if (ownerResult.status === 'rejected') {
    console.error('Telegram notification failed:', ownerResult.reason.message, '| order:', record.id);
    await updateOrder(record.id, {
      notifyError: String(ownerResult.reason.message).slice(0, 300),
      notifyErrorAt: new Date().toISOString(),
    }).catch((err) => console.error('Failed to store notify error:', err.message));

    await logEvent({
      action: 'telegram.notifyFailed',
      source: 'telegram',
      actorType: 'system',
      status: 'failed',
      error: ownerResult.reason.message,
      entityType: 'order',
      entityId: record.id,
      orderId: record.id,
      customerPhone: record.phone,
      description: 'رسالة الطلب ما وصلاتش للگروب',
    });

    return json(200, { ok: true, id: record.id });
  }

  /* نخزّنو message_id باش الويبهوك يقدر يبدّل نفس الرسالة كي تنقر على زر */
  const messageId = ownerResult.value?.message_id ?? null;
  if (messageId) {
    await updateOrder(record.id, { messageId, notifyError: null, notifyErrorAt: null }).catch((err) =>
      console.error('Failed to store message id:', err.message),
    );
  }

  await logEvent({
    action: 'telegram.notified',
    source: 'telegram',
    actorType: 'system',
    entityType: 'order',
    entityId: record.id,
    orderId: record.id,
    description: 'رسالة الطلب وصلت للگروب',
    telegramMessageId: messageId,
  });

  console.log(
    'Order received:', record.id, JSON.stringify(order),
    '| channel:', record.channel,
    '| customer SMS:', customerResult.status,
    '| meta Lead:', meta?.ok ? 'sent' : (meta?.skipped ? 'skipped' : 'failed'),
  );
  /* رقم الطلب يرجع للصفحة — الزبون يشوفو في شاشة النجاح ويذكرو كي
     يتّصل. ماشي سرّ: كل تبديل على الطلب يمرّ من تيليغرام ولا من اللوحة
     وزوجهم يطلبو صلاحية. */
  return json(200, { ok: true, id: record.id });
}

/* توقيع Vercel هو (req,res) — الجسر في lib/http.mjs */
export default toVercel(handler);
