/*
 * Meta Conversions API (CAPI) — نبعثو الأحداث من السيرفر، ماشي من المتصفّح.
 *
 * علاش من السيرفر: الـ pixel تاع المتصفّح يشوف غير 50-65% من التحويلات
 * (ad blockers، ITP، iOS). من السيرفر يوصل ~95%. وزيادة على هذا، عندنا
 * رقم الهاتف تاع الزبون — وفي الجزائر كل واحد عندو تيليفون وقليل اللي
 * عندو إيميل، فالمطابقة (Event Match Quality) تولّي عالية بزاف.
 *
 * ── حدثين، ماشي واحد ─────────────────────────────────────────────────
 *   Lead     → كي الزبون يعمّر الفورم. إشارة سريعة للخوارزمية.
 *   Purchase → كي الطلبية **توصّل فعلاً** (ماشي كي تتقبّل). هذا هو
 *              الفرق الكبير: في الدفع عند الاستلام، الطلب المقبول ماشي
 *              فلوس — يقدر يرجع. إذا علّمتي ميتا إنّ كل طلب = بيعة،
 *              راح تجيبلك ناس يعمّرو الفورم ويرفضو عند الباب.
 *              نبعثو Purchase غير على اللي خلّص فعلاً.
 *
 * ── environment variables (اختيارية — بلاهم ما يتبعث والو) ──────────
 *   META_PIXEL_ID        — id تاع الـ pixel (Events Manager)
 *   META_CAPI_TOKEN      — access token — **سرّي**
 *   META_TEST_EVENT_CODE — اختياري، للتجريب برك: يخلّي الأحداث تبان في
 *                          تبويب "Test Events" بلا ما تأثّر على البيانات.
 *                          حيّدو كي تكمّل التجريب.
 */
import { createHash } from 'node:crypto';
import { siteUrl } from './site.mjs';

const GRAPH_VERSION = 'v21.0';
const REQUEST_TIMEOUT_MS = 8_000;

/** ميتا تطلب SHA-256 على قيمة منظّفة (lowercase، بلا فراغات) */
const hash = (value) => createHash('sha256').update(String(value)).digest('hex');

const normalize = (value) => String(value ?? '').trim().toLowerCase();

/** 0661445566 → 213661445566 (بلا +، كيما تحب ميتا) */
const phoneForMeta = (localPhone) =>
  `213${String(localPhone).replace(/\D/g, '').replace(/^0/, '')}`;

/**
 * `fbc` = الـ click id بصيغة ميتا: fb.1.<وقت النقرة بالميلي>.<fbclid>
 * الوقت لازم يكون وقتاش الزبون نقر على الإعلان — نستعملو `landedAt`
 * (وقتاش حلّ الصفحة) وهو أقرب حاجة عندنا.
 */
function buildFbc(attribution, fallbackMs) {
  if (!attribution?.fbclid) return null;
  const clickedAt = attribution.landedAt ?? fallbackMs;
  return `fb.1.${clickedAt}.${attribution.fbclid}`;
}

/**
 * يبني بيانات المطابقة. كل حاجة شخصية تتهرّس بـ SHA-256 قبل ما تخرج —
 * ميتا ما تشوف عمرها الرقم ولا الاسم بصيغتهم الأصلية.
 */
function userData(order, createdAtMs) {
  const [firstName, ...rest] = normalize(order.name).split(/\s+/);
  const data = {
    ph: [hash(phoneForMeta(order.phone))],
    country: [hash('dz')],
  };

  if (firstName) data.fn = [hash(firstName)];
  if (rest.length) data.ln = [hash(rest.join(' '))];
  if (order.wilaya) data.ct = [hash(normalize(order.wilaya).replace(/\s/g, ''))];

  const fbc = buildFbc(order.attribution, createdAtMs);
  if (fbc) data.fbc = fbc;

  return data;
}

/**
 * يبعث حدث لميتا. **ما يرميش خطأ للفوق أبداً** — الطلب أهم من التتبّع،
 * فإذا ميتا طاحت الطلب يكمّل عادي. يرجع { skipped } ولا { ok } ولا { error }.
 */
export async function sendMetaEvent(eventName, order, { value } = {}) {
  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixelId || !token) return { skipped: 'META_PIXEL_ID / META_CAPI_TOKEN not configured' };

  const createdAtMs = new Date(order.createdAt ?? Date.now()).getTime();

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    /* نفس الـ id لنفس الطلب+الحدث — إذا تعاود الإرسال ميتا ما تحسبوش مرّتين */
    event_id: `${order.id}-${eventName.toLowerCase()}`,
    action_source: 'website',
    user_data: userData(order, createdAtMs),
  };

  const site = siteUrl();
  if (site) event.event_source_url = site;

  if (value !== undefined) {
    event.custom_data = { currency: 'DZD', value: Number(value) };
  }

  const payload = { data: [event] };
  if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { error: `Meta ${response.status}: ${result?.error?.message ?? 'unknown error'}` };
    }
    return { ok: true, received: result.events_received };
  } catch (error) {
    return { error: error.message };
  }
}
