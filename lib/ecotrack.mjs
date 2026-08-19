/*
 * ECOTRACK — الربط مع شركة التوصيل (DHD وغيرها).
 *
 * ── واش هي ─────────────────────────────────────────────────────────
 * ECOTRACK ماشي شركة توصيل، هي منصّة مشتركة يخدمو عليها عشرات
 * الموصّلين الجزائريين (DHD، Conexlog، MSM Go، Rex…). كل موصّل عندو
 * نطاق وحدو: https://<الموصّل>.ecotrack.dz، وتوكن من لوحتو هو.
 *
 * ── الإعداد ────────────────────────────────────────────────────────
 *   ECOTRACK_URL     — نطاق الموصّل، مثال https://dhd.ecotrack.dz
 *   ECOTRACK_TOKEN   — التوكن من لوحة الموصّل — **سرّي**
 *
 * بلا الزوج، `configured()` ترجع false وكل شي في هذا الملف يرجع
 * { skipped } بدل ما يرمي — نفس نمط Twilio وMeta: الميزة تنطفي وحدها
 * والطلب يكمّل عادي.
 *
 * ── قاعدة الأمان ───────────────────────────────────────────────────
 * `create` تخلق الطردة وتبقى قابلة للتعديل والحذف. الطردة ما تخرجش
 * للموصّل حتى تنادي `valid`. فأي تجريب يمشي: create → شوف → delete.
 *
 * ⚠️ `montant` اللي نبعثوه هو **المجموع بالتوصيل** — هذاك اللي يحصّلو
 * الموصّل من الزبونة. ماشي هو المدخول تاعنا (شوف goodsTotal في
 * message.mjs): سومة التوصيل تعدّي للموصّل، وعمولتو تتقصّ منها.
 */
import { wilayaId } from './wilayas.mjs';
import { orderLines } from './offers.mjs';

const TIMEOUT_MS = 8_000;

const baseUrl = () => (process.env.ECOTRACK_URL ?? '').trim().replace(/\/+$/, '');
const token = () => (process.env.ECOTRACK_TOKEN ?? '').trim();

export const configured = () => Boolean(baseUrl() && token());

/*
 * الحدود عندهم: 50 طلب/دقيقة، 1,500/ساعة، 15,000/نهار. الزيادة ترجع
 * 429 مع Retry-After — نرجعوها كيما هي للجالب باش يقرّر يستنّى ولا
 * يعاود من بعد، بدل ما نعيدو المحاولة هنا ونعطّلو نقرة في تيليغرام.
 */
async function call(method, path, { query = null, body = null } = {}) {
  if (!configured()) return { skipped: 'ECOTRACK_URL / ECOTRACK_TOKEN not configured' };

  const url = new URL(`/api/v1/${path.replace(/^\/+/, '')}`, baseUrl());
  /* التوكن يمشي في الهيدر وفي البارامتر: الوثيقة تسمّيه api_token،
     وبعض النطاقات تقرا Bearer برك. الزوج مع بعض يخدم في الحالتين. */
  url.searchParams.set('api_token', token());
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${token()}`,
      },
      body: body ? JSON.stringify({ api_token: token(), ...body }) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

    if (response.status === 429) {
      return { error: 'rate-limited', retryAfter: Number(response.headers.get('retry-after')) || null, status: 429 };
    }

    if (!response.ok) {
      return { error: fieldErrors(data) ?? `HTTP ${response.status}`, status: response.status, data };
    }

    return { data };
  } catch (error) {
    /* المهلة تبان كـ AbortError — نسمّيوها باسمها باش الرسالة في
       تيليغرام تقول "الموصّل ما جاوبش" ماشي خطأ غامض */
    const message = error.name === 'AbortError' ? `no answer in ${TIMEOUT_MS / 1000}s` : error.message;
    return { error: message };
  } finally {
    clearTimeout(timer);
  }
}

/*
 * أخطاء 422 ترجع بالفرنسية وحقل بحقل:
 *   { message, errors: { commune: ["Le champ commune est obligatoire."] } }
 * نجمعوها في سطر واحد — الرسالة في تيليغرام تلزمها تقول واش ناقص،
 * ماشي "فشل".
 */
function fieldErrors(data) {
  if (!data?.errors) return data?.message ?? null;
  return Object.entries(data.errors)
    .map(([field, messages]) => `${field}: ${[].concat(messages).join(' ')}`)
    .join(' · ');
}

/* ── القراءة ───────────────────────────────────────────────────────── */

export const validateToken = () => call('POST', 'validate/token');
export const listWilayas = () => call('GET', 'get/wilayas');
export const listCommunes = () => call('GET', 'get/communes');
export const listDesks = () => call('GET', 'get/desks');

/** حالات عدّة طرود في نداء واحد — الحدّ 100 tracking في المرّة */
export const trackings = (codes) =>
  call('GET', 'get/trackings/info', { query: { trackings: [].concat(codes).slice(0, 100).join(',') } });

export const trackingInfo = (code) => call('GET', 'get/tracking/info', { query: { tracking: code } });

/* ── الكتابة ───────────────────────────────────────────────────────── */

export const createParcel = (payload) => call('POST', 'create/order', { body: payload });
export const validateParcel = (code) => call('POST', 'valid/order', { body: { tracking: code } });
export const deleteParcel = (code) => call('DELETE', 'delete/order', { body: { tracking: code } });
export const askReturn = (code) => call('POST', 'ask/for/order/return', { body: { tracking: code } });
export const labelUrl = (code) => `${baseUrl()}/api/v1/get/order/label?api_token=${encodeURIComponent(token())}&tracking=${encodeURIComponent(code)}`;

/* ── ترجمة حالاتهم لحالاتنا ────────────────────────────────────────── */

/*
 * عندنا حالتين نهائيتين برك: وصلت ولا رجعت (شوف deliveryStatus في
 * api/telegram-webhook.mjs). الباقي "في الطريق" وما يبدّل والو في
 * الربح ولا في المخزون.
 *
 * `encaissed` و`payed` معناهم الفلوس تحصّلت — وهذا يجي **بعد** التوصيل،
 * فما نبدّلوش بيه الحالة مرّة ثانية.
 */
const DELIVERED = new Set(['livred', 'encaissed', 'payed']);
const RETURNED = new Set(['return_received']);

export function deliveryStatusFrom(status) {
  if (DELIVERED.has(status)) return 'delivered';
  if (RETURNED.has(status)) return 'returned';
  return null;
}

/* ── بناء الطردة من طلب Qiti ───────────────────────────────────────── */

/*
 * وصف السلعة للموصّل — من سطور الطلب (منتج، باقة بعناصرها، عرض إضافي).
 * محدود بـ 255 حرف كيما تطلب الوثيقة.
 */
export function parcelProductLine(order) {
  const parts = [];
  for (const line of orderLines(order)) {
    if (line.kind === 'bundle') {
      const inside = (line.items ?? []).map((item) => `${item.name ?? item.productId} ×${item.qty * line.qty}`).join(' + ');
      parts.push(`${line.name ?? 'Bundle'} ×${line.qty}${inside ? ` (${inside})` : ''}`);
    } else if (line.name) {
      parts.push(`${line.name} ×${line.qty}`);
    }
  }
  return parts.join(' · ').slice(0, 255);
}

/** مجموع الوحدات — يمشي في `quantite` مع stock=1 */
export const parcelQuantity = (order) =>
  orderLines(order).reduce((sum, line) => {
    if (line.kind === 'bundle') {
      return sum + (line.items ?? []).reduce((inner, item) => inner + item.qty * line.qty, 0);
    }
    return sum + (line.qty ?? 0);
  }, 0);

/**
 * طلب Qiti → جسم `create/order`.
 *
 * `deskCommune` تجي من جدول المكاتب: في التوصيل للمكتب، `commune` لازم
 * تكون بلدية **المكتب** ماشي بلدية الزبونة. بلاها نبعثو بلدية الزبونة
 * والموصّل يردّها.
 */
export function parcelFor(order, { deskCommune = null, storeName = 'Qiti' } = {}) {
  const desk = order.shipping === 'desk';
  const commune = desk ? (deskCommune ?? order.commune) : order.commune;

  return {
    reference: order.id,
    nom_client: String(order.name ?? '').slice(0, 255),
    /* أرقامنا محفوظة 0XXXXXXXXX، وهوما يستنّاو 9 ولا 10 أرقام —
       نبعثوها كيما هي بلا صفر بادئ مضاعف */
    telephone: String(order.phone ?? '').replace(/\D/g, '').slice(0, 10),
    adresse: String(order.commune ?? '').slice(0, 255),
    commune: String(commune ?? '').slice(0, 255),
    code_wilaya: wilayaId(order.wilaya),
    montant: order.total,
    remarque: order.reason ? String(order.reason).slice(0, 255) : undefined,
    produit: parcelProductLine(order),
    stock: 1,
    quantite: String(parcelQuantity(order)),
    boutique: storeName,
    type: 1,
    stop_desk: desk ? 1 : 0,
    fragile: 0,
  };
}
