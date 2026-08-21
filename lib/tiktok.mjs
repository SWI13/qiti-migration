/*
 * تيك توك — البيكسل (المتصفّح) + Events API (السيرفر).
 *
 * ملف واحد لمنصّة وحدة: البيكسل والـ Events API زوج وجوه لنفس الحاجة
 * (نفس الـ pixel id، نفس أسماء الأحداث، نفس منطق منع التكرار). تفريقهم
 * على زوج ملفات يخلّي واحد يبدّل اسم حدث في جيهة وينسى الجيهة الأخرى،
 * ووقتها التكرار يصرا بلا ما حد يحسّ.
 *
 * ── علاش الزوج، ماشي واحد ────────────────────────────────────────────
 * البيكسل وحدو: يشوف غير 50-65% (ad blockers، ITP، iOS)، بصح هو اللي
 * يحطّ كوكي `_ttp` ويبني الجماهير (audiences) والريتارغتينغ.
 * الـ Events API وحدو: يوصل ~95% وعندو رقم الهاتف (أقوى مفتاح مطابقة
 * عندنا — في الجزائر كل واحد عندو تيليفون وقليل اللي عندو إيميل)، بصح
 * ما عندوش `_ttp` وما يبنيش جمهور.
 * تيك توك روحها توصّي بالزوج مع منع التكرار عبر `event_id`.
 *
 * ── أسماء الأحداث ماشي كيما ميتا ─────────────────────────────────────
 * تيك توك تسمّي الشراء `CompletePayment` ماشي `Purchase`. نسخ
 * lib/meta.mjs وتبديل الرابط برك = أحداث مخصّصة ما تعرفهاش المنصّة
 * وحملة ما تتحسّنش. وزيد: الهاتف عند تيك توك بصيغة E.164 **مع `+`**
 * (`+213661445566`)، وعند ميتا بلا `+` (`213661445566`). نفس الرقم،
 * زوج هاشات مختلفين — والغلطة ما تبانش، غير المطابقة تطيح.
 *
 * ── الدفع عند الاستلام ───────────────────────────────────────────────
 *   PlaceAnOrder    → كي الزبون يبعث الفورم. "قرّر"، ماشي "خلّص".
 *   CompletePayment → كي الطردة **توصّل** والموصّل يجمع الفلوس
 *                     (lib/decisions.mjs). هذا هو الفلوس الحقيقي.
 * ما نبعثوش CompletePayment كي الطلب يتقبّل — لو درناها، الخوارزمية
 * تتعلّم بلّي فورم معمّر = بيعة، وتجيبلك ناس يعمّرو ويرفضو عند الباب.
 *
 * ── environment variables ────────────────────────────────────────────
 *   TIKTOK_PIXEL_ID      — id تاع البيكسل. ما هوش سرّ (يبان في الصفحة).
 *                          ما تحطّهاش = نستعملو id الإنتاج تحت.
 *                          حطّها فارغة = البيكسل يتطفا كامل.
 *   TIKTOK_ACCESS_TOKEN  — توكن Events API — **سرّي**. بلاه، الأحداث
 *                          من السيرفر ما تتبعثش والبيكسل يخدم وحدو.
 *   TIKTOK_TEST_EVENT_CODE — اختياري، للتجريب: الأحداث تبان في "Test
 *                          Events" بلا ما تأثّر على البيانات. حيّدها
 *                          كي تكمّل.
 */
import { createHash } from 'node:crypto';
import { toE164Dz } from './message.mjs';
import { siteUrl } from './site.mjs';

/* id الإنتاج — مكتوب هنا باش النشر يخدم بلا إعداد. ماشي سرّ: أي واحد
   يحلّ مصدر الصفحة يلقاه. السرّ الوحيد هو التوكن. */
const DEFAULT_PIXEL_ID = 'DA3Q4VRC77U14HQM5R50';

const API_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';
const REQUEST_TIMEOUT_MS = 8_000;

/* id تاع بيكسل صحيح: حروف وأرقام برك. أي حاجة أخرى ترجع فارغة بدل ما
   تدخل في `<script>` — القيمة جاية من متغيّر بيئة، ما نثقو فيها عمياني. */
const PIXEL_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * ينظّف id جاي من برّا (اللوحة، متغيّر بيئة) ويرجّع '' إذا ما كانش صحيح.
 *
 * الـ id يدخل في `<script>` في الصفحة — قيمة ما تتفحّصش هنا تولّي ثغرة
 * حقن. والحقل في اللوحة مفتوح: أي واحد عندو دخول للوحة يقدر يلصق فيه
 * أي حاجة، حتى بلا قصد سيّئ (يلصق الكود كامل بدل الـ id برك).
 */
export function sanitizePixelId(value) {
  const id = String(value ?? '').trim();
  return PIXEL_ID_RE.test(id) ? id : '';
}

/**
 * id البيكسل الافتراضي تاع الموقع، ولا '' إذا كان مطفي.
 *
 * الفرق بين "ما حطّيتهاش" و"حطّيتها فارغة" مقصود: بلا متغيّر نخدمو
 * بالإنتاج (النشر ما يحتاج والو)، وبمتغيّر فارغ نطفيوه (تجريب محلّي،
 * معاينة، بيئة تست) بلا ما نمسّو الكود.
 *
 * كل حملة تقدر تغلبو بـ id تاعها (شوف pixelIdFor) — الافتراضي هو
 * اللي يخدم للصفحة الرئيسية وللحملات اللي ما حطّيتلهمش واحد.
 */
export function tiktokPixelId() {
  const raw = process.env.TIKTOK_PIXEL_ID;
  return sanitizePixelId(raw === undefined ? DEFAULT_PIXEL_ID : raw);
}

/**
 * أشمن بيكسل يخدم لهذه الصفحة: تاع الحملة إذا كان، وإلا الافتراضي.
 *
 * علاش الحملة تستاهل بيكسل وحدها: كل صفحة هبوط تقدر تكون حملة أخرى،
 * ومنتج آخر، وحتى حساب إعلاني آخر. بيكسل واحد لكلش يخلط الجماهير
 * والتحويلات تاع منتجين مختلفين في نفس القمع — والخوارزمية تتعلّم على
 * خليط ماشي على منتج.
 */
export const pixelIdFor = (campaign) =>
  sanitizePixelId(campaign?.tiktokPixelId) || tiktokPixelId();

/**
 * وسم البيكسل. يرجع '' إذا كان مطفي — الصفحة تخرج بلا حتى بايت زايد.
 *
 * الحارس `__qitiTtq` مهمّ: الصفحة الستاتيك تعدّي على البناء والصفحات
 * المعروضة تعدّي على الـ renderer. لو نهار من النهارات الزوج تلاقاو في
 * نفس الصفحة، `ttq.load()` يتنادى مرّتين وكل زيارة تتحسب زوج مرّات —
 * إحصائيات مضروبة وميزانية تتصرف على أرقام كاذبة.
 *
 * السكريبت تاع تيك توك يتحطّ بـ `async` (من داخل اللودر روحو)، فما
 * يوقّفش رسم الصفحة — مهمّ على 3G الجزائري.
 */
export function tiktokPixelSnippet(rawId = tiktokPixelId()) {
  const id = sanitizePixelId(rawId);
  if (!id) return '';

  return `<!-- TikTok Pixel -->
<script>
(function(){
if(window.__qitiTtq)return;window.__qitiTtq=1;
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(
var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script")
;n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};

  ttq.load('${id}');
  ttq.page();
}(window, document, 'ttq');
})();
</script>`;
}

/* ── Events API (من السيرفر) ───────────────────────────────────────── */

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

/**
 * بيانات المطابقة. كل حاجة شخصية تتهرّس قبل ما تخرج — تيك توك عمرها
 * ما تشوف الرقم بصيغتو الأصلية.
 *
 * ما نبعثوش الاسم، الولاية، البلدية، IP، ولا user-agent: تيك توك
 * تقدر تطابق بالهاتف + ttclid، والباقي بيانات شخصية زايدة بلا فايدة
 * تُذكر. أقلّ ما يمكن، ماشي كل ما يمكن.
 */
function userData(order) {
  const attribution = order.attribution ?? {};
  const data = {};

  if (order.phone) {
    const e164 = toE164Dz(order.phone);
    /* E.164 مع '+' — هذي صيغة تيك توك. ميتا تحبّها بلا '+'. */
    data.phone = sha256(e164);
    /*
     * معرّف ثابت للزبون: نفس الرقم = نفس المعرّف عبر الأجهزة والطلبات.
     * نبنيوه من نفس الرقم الدولي (بلا '+') باش رقم مكتوب بشكل آخر
     * (0661… ولا 213661…) يعطي نفس المعرّف — وإلا زبون واحد يبان زوج.
     */
    data.external_id = sha256(e164.replace('+', ''));
  }

  /* ttclid يتبعث خام — ماشي كيما `fbc` تاع ميتا اللي يتغلّف بالوقت.
     صالح 7 أيام عند تيك توك؛ نبعثوه كيما هو ويحكمو هوما. */
  if (attribution.ttclid) data.ttclid = attribution.ttclid;
  /* `_ttp` كوكي يحطّها البيكسل — بلا بيكسل ما تكونش، وهذا عادي */
  if (attribution.ttp) data.ttp = attribution.ttp;

  return data;
}

/**
 * يبعث حدث لتيك توك. **ما يرميش خطأ للفوق أبداً** — الطلب أهمّ من
 * التتبّع. يرجع { skipped } ولا { ok } ولا { error }.
 *
 * ⚠️ تيك توك ترجع HTTP 200 حتى كي الحدث يطيح، والخطأ الحقيقي يكون في
 * `code` داخل الجسم. فحص `response.ok` وحدو (كيما lib/meta.mjs) يخلّي
 * كل شي يبان مليح وحنا ما نبعثو والو.
 */
export async function sendTikTokEvent(eventName, order, { value, pixelId: override } = {}) {
  /* الطلبية تخزّن البيكسل اللي كانت عليه الصفحة وقت الطلب — تبديل
     بيكسل الحملة غداً ما يلزموش يحوّل تحويلة قديمة لحساب آخر */
  const pixelId = sanitizePixelId(override ?? order?.tiktokPixelId) || tiktokPixelId();
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!pixelId || !token) return { skipped: 'TIKTOK_PIXEL_ID / TIKTOK_ACCESS_TOKEN not configured' };

  const user = userData(order);
  /* بلا حتى مفتاح مطابقة، الحدث يوصل ويضيع — نوفّرو الطلب والوقت */
  if (!Object.keys(user).length) return { skipped: 'no match keys on order' };

  const event = {
    event: eventName,
    /* بالثواني، ماشي بالميلي */
    event_time: Math.floor(Date.now() / 1000),
    /* نفس الـ id لنفس الطلب+الحدث — يمنع التكرار مع حدث المتصفّح
       (شوف ttEventId في assets/js/main.js) وكي يتعاود الإرسال */
    event_id: tiktokEventId(order.id, eventName),
    user,
    properties: {
      content_type: 'product',
      ...(order.productId ? { contents: [{
        content_id: String(order.productId),
        content_type: 'product',
        quantity: Number(order.qty) || 1,
      }] } : {}),
      ...(value === undefined ? {} : { currency: 'DZD', value: Number(value) }),
      ...(order.id ? { order_id: String(order.id) } : {}),
    },
  };

  const site = siteUrl();
  if (site) event.page = { url: site };

  const payload = {
    event_source: 'web',
    event_source_id: pixelId,
    data: [event],
  };
  if (process.env.TIKTOK_TEST_EVENT_CODE) payload.test_event_code = process.env.TIKTOK_TEST_EVENT_CODE;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Access-Token': token },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) return { error: `TikTok HTTP ${response.status}` };
    /* code !== 0 = فشل، حتى لو HTTP 200 */
    if (result?.code !== 0) return { error: `TikTok ${result?.code}: ${result?.message ?? 'unknown error'}` };

    return { ok: true };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * صيغة `event_id` — مشتركة بين السيرفر والمتصفّح.
 *
 * لازم الزوج يبنيوها بنفس الطريقة بالضبط، وإلا تيك توك تحسب الطلبية
 * مرّتين: وحدة من البيكسل ووحدة من الـ Events API. ROAS مضخّم أوحش من
 * ROAS مفقود — على خاطر تصرف عليه فلوس حقيقية.
 */
export const tiktokEventId = (orderId, eventName) =>
  `${orderId}-${String(eventName).toLowerCase()}`;
