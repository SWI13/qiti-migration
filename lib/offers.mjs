/*
 * العروض: الباقات (bundles) والعرض الإضافي بضغطة (upsell).
 *
 * ── علاش ملف وحدو ──────────────────────────────────────────────────
 * الباقة تمسّ خمس بلايص: الفورم اللي يعرضها، السيرفر اللي يحسب سومتها،
 * المخزون اللي ينقص كل عنصر فيها، رسالة تيليغرام اللي تبيّنها، وحساب
 * الربح. لو كل بلاصة تفهم الباقة بطريقتها، تكفي تبديلة وحدة باش الأرقام
 * ما تبقاوش يتفقو. هنا التطبيع (normalize) والحساب في بلاصة وحدة، والباقي
 * ينادي.
 *
 * ── القاعدة اللي ما نخرجوش منها ────────────────────────────────────
 * السومة اللي تتخلّص تتحسب في السيرفر من `campaign` و`product` — والو
 * منها ما يجي من المتصفّح. المتصفّح يبعث `bundleId` برك، كيما يبعث
 * `productId`.
 *
 * ── السطور (lines) ─────────────────────────────────────────────────
 * الطلب الجديد يخزّن `lines[]`: كل سطر واش تباع بالضبط ومنين. الطلبات
 * القدام ما عندهاش الحقل — `orderLines()` تبنيه ليهم من الحقول القديمة
 * (productId/variant/unitPrice/qty)، فكل مستهلك يقرا شكل واحد وما
 * نحتاجوش هجرة على التخزين.
 */

export const BUNDLE_LIMIT = 12;
export const BUNDLE_ITEM_LIMIT = 8;
export const ITEM_QTY_LIMIT = 20;

/** فاريانت المنتج البسيط — نفس المفتاح تاع catalog.mjs */
export const SIMPLE_SKU = 'default';

const text = (value, max) => {
  const out = String(value ?? '').trim();
  return out ? out.slice(0, max) : null;
};

const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

const count = (value, max) => {
  const n = Math.round(Number(value) || 0);
  return Math.min(Math.max(n, 1), max);
};

/*
 * مرجع عنصر: "prd_x:0-1" ولا كائن { productId, sku }.
 *
 * اللوحة تخزّن النص (قائمة منسدلة وحدة تختار المنتج والفاريانت مع بعض —
 * قائمتين مربوطتين ببعضهن يلزمهن حالة في الواجهة، والنص يعفينا منها).
 */
export function parseItemRef(value) {
  if (value && typeof value === 'object') {
    const productId = text(value.productId, 64);
    return productId ? { productId, sku: text(value.sku, 64) ?? SIMPLE_SKU } : null;
  }
  const raw = text(value, 160);
  if (!raw) return null;
  const at = raw.indexOf(':');
  const productId = at === -1 ? raw : raw.slice(0, at);
  const sku = at === -1 ? SIMPLE_SKU : raw.slice(at + 1);
  return productId ? { productId, sku: sku || SIMPLE_SKU } : null;
}

export const itemRefValue = (ref) => (ref?.productId ? `${ref.productId}:${ref.sku ?? SIMPLE_SKU}` : '');

let seq = 0;
const newBundleId = () => `bnd_${Date.now().toString(36)}${(seq++).toString(36)}`;

function normalizeBundle(input, index) {
  const items = (Array.isArray(input?.items) ? input.items : [])
    .map((item) => {
      const ref = parseItemRef(item?.ref ?? item);
      if (!ref) return null;
      return { ...ref, qty: count(item?.qty ?? 1, ITEM_QTY_LIMIT) };
    })
    .filter(Boolean)
    .slice(0, BUNDLE_ITEM_LIMIT);

  /* باقة بلا عناصر ما تتخزّنش: الفورم ما يقدرش يبيعها، ووجودها في
     اللائحة يخلّي التاجر يحسب راهي خدّامة. */
  if (!items.length) return null;

  const price = money(input?.price);
  if (price === null) return null;

  return {
    id: text(input?.id, 64) ?? newBundleId(),
    name: text(input?.name, 120) ?? 'Bundle',
    description: text(input?.description, 400),
    image: text(input?.image, 300),
    price,
    compareAt: money(input?.compareAt),
    active: input?.active !== false,
    order: Number.isFinite(Number(input?.order)) ? Number(input.order) : index + 1,
    items,
  };
}

/**
 * شكل `campaign.bundles` بعد التطبيع. حملة قديمة (بلا الحقل) ترجع
 * معطّلة بلائحة فارغة — العرض يتخطّاها بلا أي شرط خاص عندو.
 */
export function normalizeBundles(input, existing) {
  const source = input ?? existing;
  if (!source) return { enabled: false, items: [] };

  const items = (Array.isArray(source.items) ? source.items : [])
    .map((item, index) => normalizeBundle(item, index))
    .filter(Boolean)
    .slice(0, BUNDLE_LIMIT)
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index + 1 }));

  return { enabled: Boolean(source.enabled) && items.length > 0, items };
}

/**
 * العرض الإضافي. `trigger` وين يبان:
 *   'after-order'    بعد ما يتسجّل الطلب — ضغطة وحدة، بلا فورم ثاني
 *   'before-submit'  فوق زرّ التأكيد، الزبون يعلّم عليه قبل ما يبعث
 */
export function normalizeUpsell(input, existing) {
  const source = input ?? existing;
  if (!source) return { enabled: false };

  const ref = parseItemRef(source.ref ?? { productId: source.productId, sku: source.sku });
  const price = money(source.price);

  return {
    enabled: Boolean(source.enabled) && Boolean(ref) && price !== null,
    productId: ref?.productId ?? null,
    sku: ref?.sku ?? SIMPLE_SKU,
    title: text(source.title, 120),
    description: text(source.description, 400),
    image: text(source.image, 300),
    price,
    compareAt: money(source.compareAt),
    trigger: source.trigger === 'before-submit' ? 'before-submit' : 'after-order',
  };
}

/** الباقات اللي تتعرض فعلاً — مفعّلة، نشطة، ومرتّبة */
export const activeBundles = (campaign) =>
  (campaign?.bundles?.enabled ? campaign.bundles.items : [])
    .filter((bundle) => bundle?.active !== false)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

export const findBundle = (campaign, id) =>
  activeBundles(campaign).find((bundle) => bundle.id === id) ?? null;

export const upsellOf = (campaign) => (campaign?.upsell?.enabled ? campaign.upsell : null);

/**
 * سومة العناصر وحدها وحدة بوحدة — تخدم كـ compareAt تلقائي كي التاجر
 * ما يكتبوش، وهي اللي تحسب "ربحت 500 دج".
 */
export function bundleListPrice(bundle, priceOf) {
  let sum = 0;
  for (const item of bundle?.items ?? []) {
    const unit = priceOf(item);
    if (unit == null) return null;
    sum += unit * item.qty;
  }
  return sum || null;
}

export function bundleSavings(bundle, priceOf) {
  const listed = bundle?.compareAt ?? bundleListPrice(bundle, priceOf);
  if (!listed || listed <= (bundle?.price ?? 0)) return null;
  return { compareAt: listed, save: listed - bundle.price };
}

/* ── سطور الطلب ────────────────────────────────────────────────────── */

/**
 * السطور تاع طلب، مهما كانت قِدمتو.
 *
 * الطلب الجديد عندو `lines`. القديم (وصفحة index.html الستاتيك) ما
 * عندوش، فنبنيوهم من الحقول القديمة. أي حساب — مخزون، ربح، رسالة —
 * يمرّ من هنا باش يشوف نفس الشكل.
 */
export function orderLines(order) {
  if (Array.isArray(order?.lines) && order.lines.length) return order.lines;

  const qty = order?.qty ?? 0;
  const unitPrice = order?.unitPrice ?? null;
  return [{
    kind: 'product',
    productId: order?.productId ?? null,
    sku: order?.variant?.sku ?? SIMPLE_SKU,
    name: order?.productName ?? null,
    qty,
    unitPrice,
    lineTotal: unitPrice == null ? null : unitPrice * qty,
    items: null,
  }];
}

/**
 * كل وحدة لازم تنقص من المخزون: عنصر الباقة يتضاعف بعدد الباقات.
 * الطلب القديم بلا productId يرجع لائحة فارغة — الجالب يرجع للعدّاد
 * القديم كيما كان.
 */
export function orderStockRefs(order) {
  const refs = new Map();
  const add = (productId, sku, qty) => {
    if (!productId || qty <= 0) return;
    const key = `${productId}:${sku ?? SIMPLE_SKU}`;
    const entry = refs.get(key) ?? { productId, sku: sku ?? SIMPLE_SKU, qty: 0 };
    entry.qty += qty;
    refs.set(key, entry);
  };

  for (const line of orderLines(order)) {
    if (line.kind === 'bundle') {
      for (const item of line.items ?? []) add(item.productId, item.sku, item.qty * line.qty);
    } else {
      add(line.productId, line.sku, line.qty);
    }
  }

  return [...refs.values()];
}

/** مجموع السلعة تاع السطور — بلا توصيل */
export const linesTotal = (lines) =>
  (lines ?? []).reduce((sum, line) => sum + (line.lineTotal ?? 0), 0);

/**
 * تكلفة السلعة تاع الطلب. `unitCostOf(productId)` ترجع تكلفة المنتج
 * الحقيقية، و`fallback` تخدم للمنتج اللي ما كتبش تكلفتو (ولا الطلب
 * القديم بلا منتج) — نفس الرقم اللي كان يخدم قبل الباقات.
 */
export function orderGoodsCost(order, unitCostOf, fallback) {
  let cost = 0;
  for (const line of orderLines(order)) {
    if (line.kind === 'bundle') {
      for (const item of line.items ?? []) {
        cost += (unitCostOf(item.productId) ?? fallback) * item.qty * line.qty;
      }
    } else {
      cost += (unitCostOf(line.productId) ?? fallback) * line.qty;
    }
  }
  return cost;
}

export const hasBundle = (order) => orderLines(order).some((line) => line.kind === 'bundle');
export const hasUpsell = (order) => orderLines(order).some((line) => line.kind === 'upsell');

export const upsellLine = (order) => orderLines(order).find((line) => line.kind === 'upsell') ?? null;
export const bundleLines = (order) => orderLines(order).filter((line) => line.kind === 'bundle');

/**
 * كل ids المنتجات اللي يحتاجهم عرض الحملة برّا المنتج الرئيسي: عناصر
 * الباقات + منتج العرض الإضافي. بلا تكرار، وحملة بلا عروض ترجع فارغة.
 */
export function offerProductIds(campaign) {
  const ids = new Set();
  for (const bundle of activeBundles(campaign)) {
    for (const item of bundle.items ?? []) ids.add(item.productId);
  }
  const upsell = upsellOf(campaign);
  if (upsell?.productId) ids.add(upsell.productId);
  return [...ids];
}
