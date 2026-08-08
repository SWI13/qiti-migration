/*
 * الكاتالوڨ — المنتجات، الحملات، الفئات، والمخزون.
 *
 * ── الفكرة الأساسية: المنتج ماشي الحملة ─────────────────────────────
 * **المنتج** هو اللي تبيعو: السومة، التكلفة، الخيارات (مقاس/لون)، والمخزون.
 * **الحملة** هي صفحة تبيع بيها منتج: الرابط، الثيم، الأقسام، النصوص.
 *
 * علاقة وحدة لبزاف: منتج واحد يقدر يكون عندو أكثر من حملة (حملة رمضان
 * وحملة عادية على نفس الطوق). لو المخزون كان في الحملة، الزوج حملات
 * يحسبو نفس السلعة مرّتين وتبيع حاجة ما عندكش. علاش المخزون في المنتج.
 *
 * ── التخزين (Netlify Blobs) ─────────────────────────────────────────
 *   product:<id>              المنتج + تعريف الخيارات والفاريانتات
 *   stock:<productId>:<sku>   المخزون لكل فاريانت — بلاصة وحدها
 *   campaign:<id>             الحملة
 *   category:<id>             الفئة
 *   route:<path>              فهرس الروابط → { kind, id } ولا تحويلة
 *
 * علاش المخزون برّا المنتج: المنتج يتبدّل قليل، المخزون يتبدّل في كل طلبية.
 * لو كانو مع بعض في نفس الـ blob، زوج طلبات في نفس الوقت يقدرو يمحيو
 * بعضاهم (read-modify-write). كل sku في مفتاح وحدو = نافذة التصادم أضيق
 * بزاف، ونفس المنطق اللي كان خدّام في adjustStock.
 */
import { getStore } from '@netlify/blobs';
import { randomBytes } from 'node:crypto';

const PRODUCTS = 'products';
const CAMPAIGNS = 'campaigns';
const CATEGORIES = 'categories';
const VARIANT_STOCK = 'variant-stock';
const ROUTES = 'routes';

const products = () => getStore(PRODUCTS);
const campaigns = () => getStore(CAMPAIGNS);
const categories = () => getStore(CATEGORIES);
const variantStock = () => getStore(VARIANT_STOCK);
const routes = () => getStore(ROUTES);

const DEFAULT_STOCK_THRESHOLD = 10;

/** المنتج بلا خيارات عندو فاريانت وحيد بهذا الـ sku — باش الكود يبقى واحد */
export const SIMPLE_SKU = 'default';

/*
 * روابط محجوزة: الحملات تسكن في جذر الموقع (qiti.com/toji-outfit) على
 * خاطر هذا هو الرابط اللي يتكتب في الإعلان وعلى الكرتونة. يعني لازم
 * نحميو الأسماء اللي المتجر روحو يحتاجهم.
 */
const RESERVED_SLUGS = new Set([
  'admin', 'api', 'assets', 'shop', 'c', 'p', 'about', 'contact',
  'cart', 'checkout', 'order', 'orders', 'search', 'account', 'login',
  'privacy', 'terms', 'sitemap', 'robots', 'favicon', '404', '500',
  'index', 'preview', 'media', 'static', 'netlify',
]);

/* ── معرّفات وروابط ────────────────────────────────────────────────── */

/*
 * معرّف: وقت (base36) + 10 حروف عشوائية حقيقية.
 *
 * ⚠️ علاش randomBytes ماشي Math.random: بـ 4 حروف من Math.random لقينا
 * 5 تصادمات في 10 آلاف (نفس الميلي‑ثانية = نفس الوقت، والعشوائي قصير).
 * التصادم هنا معناه منتج جديد يكتب فوق منتج قديم ويمحيه بالسكات.
 * الـ id ماشي في الرابط (الرابط هو الـ slug)، فطولو ما يضرّ بوالو.
 */
export function newId(prefix = '') {
  const stamp = Date.now().toString(36);
  return `${prefix}${stamp}${randomBytes(5).toString('hex')}`;
}

/**
 * يحوّل نص لرابط نظيف. نقبلو الحروف اللاتينية والأرقام والعربية —
 * العربي يخدم في الروابط بصح كي تلصقو في إعلان يتحوّل لـ %D8%B7...
 * وما يبقاش مقروء. فالأحسن للحملات يكون الرابط لاتيني، وهذا الفنكشن
 * يقترح برك — المستخدم يقدر يبدّلو من اللوحة.
 */
export function slugify(input) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '')          /* التشكيل */
    .replace(/[^a-z0-9؀-ۿ]+/g, '-')       /* أي حاجة أخرى → شرطة */
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** واش هذا الرابط محجوز للمتجر روحو؟ */
export const isReservedSlug = (slug) => RESERVED_SLUGS.has(String(slug ?? '').toLowerCase());

/** المسار الكامل حسب النوع — هذا هو مفتاح فهرس الروابط */
export function pathFor(kind, slug) {
  if (kind === 'campaign') return `/${slug}`;
  if (kind === 'product') return `/p/${slug}`;
  if (kind === 'category') return `/c/${slug}`;
  throw new Error(`Unknown route kind: ${kind}`);
}

/* ── فهرس الروابط ──────────────────────────────────────────────────
 *
 * مفتاح واحد يجاوب على كل شيء: حملة، منتج، فئة، ولا تحويلة قديمة.
 * الرندرر يدير lookup وحيد بالمسار ويعرف واش يعرض — بلا ما يقلّب في
 * ثلاثة stores.
 */

/** يرجع { kind, id } ولا { kind:'redirect', to } ولا null */
export async function resolveRoute(path) {
  return routes().get(`route:${path}`, { type: 'json' });
}

/**
 * يحجز الرابط. يرمي خطأ إذا مشغول بحاجة أخرى — هذا هو اللي يمنع
 * زوج حملات ياخذو نفس الرابط. `ownerId` يخلّي إعادة الحفظ تخدم عادي.
 */
export async function claimRoute(path, kind, id) {
  const slug = path.split('/').filter(Boolean).pop() ?? '';
  if (kind === 'campaign' && isReservedSlug(slug)) {
    throw new Error(`الرابط "${slug}" محجوز للمتجر. اختر واحد آخر.`);
  }

  const existing = await resolveRoute(path);
  if (existing && existing.id !== id) {
    throw new Error(`الرابط "${path}" مستعمل من قبل.`);
  }

  await routes().setJSON(`route:${path}`, { kind, id });
  return path;
}

/**
 * تبديل الرابط: نحجزو الجديد، ونخلّيو القديم كتحويلة 301.
 *
 * علاش ما نمحيوش القديم: الرابط يقدر يكون مكتوب في إعلان خدّام، في
 * منشور، ولا مطبوع على ورقة. تمحيه = تخسر كل زبون يجي منّو.
 */
export async function moveRoute(oldPath, newPath, kind, id) {
  if (oldPath === newPath) return newPath;
  await claimRoute(newPath, kind, id);
  await routes().setJSON(`route:${oldPath}`, { kind: 'redirect', to: newPath });
  return newPath;
}

/* ── الفاريانتات (المقاسات والألوان) ───────────────────────────────
 *
 * الخيارات تولّد الفاريانتات ضرب بعضاهم: 4 مقاسات × 2 ألوان = 8.
 * كل فاريانت عندو مخزون وحدو — هذا هو المعنى الحقيقي تاع "عندي ولا لا".
 */

/**
 * يولّد كل التركيبات الممكنة من الخيارات.
 * options = [{ name:'المقاس', values:['S','M'] }, { name:'اللون', values:['أسود'] }]
 * → [{ sku:'0-0', options:{ 'المقاس':'S', 'اللون':'أسود' } }, …]
 *
 * الـ sku مبني على **مواقع** القيم ماشي على النص: الأسماء عربية والـ
 * slugify تخرّجها فارغة. الموقع قصير ويخدم مع أي لغة.
 *
 * ⚠️ يعني ترتيب القيم لازم يبقى ثابت. زيد قيم جداد في الأخير، وما
 * تحيّدش وحدة من الوسط وإلا الفاريانتات القدام يتزحلقو على مخزون غالط.
 */
export function buildVariants(options = []) {
  if (!options.length) {
    return [{ sku: SIMPLE_SKU, options: {}, priceDelta: 0, mediaId: null }];
  }

  let combos = [{ sku: [], options: {} }];
  for (const option of options) {
    const next = [];
    for (const combo of combos) {
      option.values.forEach((value, index) => {
        next.push({
          sku: [...combo.sku, index],
          options: { ...combo.options, [option.name]: value },
        });
      });
    }
    combos = next;
  }

  return combos.map((combo) => ({
    sku: combo.sku.join('-'),
    options: combo.options,
    priceDelta: 0,
    mediaId: null,
  }));
}

/**
 * يلقى الفاريانت اللي يوافق الخيارات اللي اختار الزبون.
 * نقارنو بالقيم ماشي بالـ sku: الكليان يبعث { المقاس:'L' }، ما يبعثش sku،
 * وهكذا ما نثقوش في حتى حاجة جايّة من المتصفّح.
 */
export function matchVariant(product, chosen = {}) {
  const variants = product?.variants ?? [];
  if (!product?.options?.length) return variants[0] ?? null;

  return variants.find((variant) =>
    product.options.every((option) => variant.options[option.name] === chosen[option.name]),
  ) ?? null;
}

/** السومة النهائية لفاريانت — سومة المنتج + الفرق تاع الفاريانت */
export const variantPrice = (product, variant) =>
  Math.max(0, (product?.price ?? 0) + (variant?.priceDelta ?? 0));

/* ── المنتجات ──────────────────────────────────────────────────────── */

export async function saveProduct(input) {
  const now = new Date().toISOString();
  const existing = input.id ? await getProduct(input.id) : null;

  const options = input.options ?? existing?.options ?? [];
  const slug = input.slug ? slugify(input.slug) : existing?.slug;
  if (!slug) throw new Error('المنتج يلزمو رابط (slug).');

  const record = {
    id: existing?.id ?? newId('prd_'),
    slug,
    name: input.name ?? existing?.name ?? '',
    type: input.type ?? existing?.type ?? 'life',
    categoryId: input.categoryId ?? existing?.categoryId ?? null,
    price: Number(input.price ?? existing?.price ?? 0),
    compareAtPrice: input.compareAtPrice ?? existing?.compareAtPrice ?? null,
    /* واش تخلّص انت في السلعة — كانت في costs/current العامّة، ودروك
       على كل منتج وحدو، على خاطر كل منتج عندو تكلفة مختلفة. */
    unitCost: Number(input.unitCost ?? existing?.unitCost ?? 0),
    options,
    /* نحافظو على priceDelta/mediaId تاع الفاريانتات القدام كي الخيارات
       ما تبدّلوش — وإلا كل حفظ يمسح التعديلات اليدوية. */
    variants: mergeVariants(buildVariants(options), existing?.variants ?? []),
    media: input.media ?? existing?.media ?? [],
    status: input.status ?? existing?.status ?? 'active',
    seo: input.seo ?? existing?.seo ?? { title: null, description: null, ogImage: null },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const oldPath = existing ? pathFor('product', existing.slug) : null;
  const newPath = pathFor('product', record.slug);
  if (oldPath && oldPath !== newPath) await moveRoute(oldPath, newPath, 'product', record.id);
  else await claimRoute(newPath, 'product', record.id);

  await products().setJSON(record.id, record);
  return record;
}

/** يخلّي التعديلات اليدوية (سومة زايدة، صورة) كي الخيارات ما تبدّلوش */
function mergeVariants(fresh, previous) {
  const byKey = new Map(previous.map((v) => [v.sku, v]));
  return fresh.map((variant) => {
    const old = byKey.get(variant.sku);
    return old ? { ...variant, priceDelta: old.priceDelta ?? 0, mediaId: old.mediaId ?? null } : variant;
  });
}

export const getProduct = (id) => products().get(id, { type: 'json' });

export async function listProducts() {
  const { blobs } = await products().list();
  const records = await Promise.all(blobs.map((b) => products().get(b.key, { type: 'json' })));
  return records.filter(Boolean);
}

/* ── المخزون لكل فاريانت ───────────────────────────────────────────
 *
 * هذا يعوّض `stock/current` العامّة اللي كانت رقم واحد للمحل كامل.
 * برقم واحد، ثاني منتج يخلّي العدّاد غالط بالسكات — يقبل طلبية على
 * سلعة ما عندكش، ولا يرفض وحدة عندك منها.
 */

const stockKey = (productId, sku) => `${productId}:${sku}`;

export async function getVariantStock(productId, sku = SIMPLE_SKU) {
  const record = await variantStock().get(stockKey(productId, sku), { type: 'json' });
  return record ?? {
    productId, sku,
    qty: 0,
    threshold: DEFAULT_STOCK_THRESHOLD,
    lowStockAlerted: false,
    updatedAt: null,
  };
}

/** يبدّل الكمية بـ delta (سالب عند القبول، موجب عند التزويد/الرجعة) */
export async function adjustVariantStock(productId, sku, delta) {
  const current = await getVariantStock(productId, sku);
  const qty = Math.max(0, current.qty + delta);
  const updated = {
    ...current,
    qty,
    /* كي المخزون يطلع فوق الحد، ننساو التنبيه باش يعاود يبان إذا هبط */
    lowStockAlerted: qty > current.threshold ? false : current.lowStockAlerted,
    updatedAt: new Date().toISOString(),
  };
  await variantStock().setJSON(stockKey(productId, sku), updated);
  return updated;
}

export async function setVariantStock(productId, sku, qty, threshold) {
  const current = await getVariantStock(productId, sku);
  const updated = {
    ...current,
    qty: Math.max(0, qty),
    threshold: threshold ?? current.threshold,
    lowStockAlerted: false,
    updatedAt: new Date().toISOString(),
  };
  await variantStock().setJSON(stockKey(productId, sku), updated);
  return updated;
}

export async function markVariantLowStockAlerted(productId, sku, value) {
  const current = await getVariantStock(productId, sku);
  await variantStock().setJSON(stockKey(productId, sku), { ...current, lowStockAlerted: value });
}

/** كل مخزون منتج، فاريانت بفاريانت — أساس جدول /stock في تيليغرام */
export async function listStockFor(product) {
  return Promise.all(
    (product.variants ?? []).map(async (variant) => ({
      variant,
      stock: await getVariantStock(product.id, variant.sku),
    })),
  );
}

/* ── الحملات ───────────────────────────────────────────────────────── */

export async function saveCampaign(input) {
  const now = new Date().toISOString();
  const existing = input.id ? await getCampaign(input.id) : null;

  const slug = input.slug ? slugify(input.slug) : existing?.slug;
  if (!slug) throw new Error('الحملة تلزمها رابط (slug).');
  if (isReservedSlug(slug)) throw new Error(`الرابط "${slug}" محجوز. اختر واحد آخر.`);

  const record = {
    id: existing?.id ?? newId('cmp_'),
    slug,
    name: input.name ?? existing?.name ?? '',
    productId: input.productId ?? existing?.productId ?? null,
    template: input.template ?? existing?.template ?? 'qiti-default',
    theme: input.theme ?? existing?.theme ?? {},
    sections: input.sections ?? existing?.sections ?? [],
    status: input.status ?? existing?.status ?? 'draft',
    seo: input.seo ?? existing?.seo ?? { title: null, description: null, ogImage: null },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    publishedAt: input.status === 'published' ? (existing?.publishedAt ?? now) : (existing?.publishedAt ?? null),
  };

  const oldPath = existing ? pathFor('campaign', existing.slug) : null;
  const newPath = pathFor('campaign', record.slug);
  if (oldPath && oldPath !== newPath) await moveRoute(oldPath, newPath, 'campaign', record.id);
  else await claimRoute(newPath, 'campaign', record.id);

  await campaigns().setJSON(record.id, record);
  return record;
}

export const getCampaign = (id) => campaigns().get(id, { type: 'json' });

export async function listCampaigns() {
  const { blobs } = await campaigns().list();
  const records = await Promise.all(blobs.map((b) => campaigns().get(b.key, { type: 'json' })));
  return records.filter(Boolean);
}

/**
 * ينسخ حملة. هذا هو الطريق الأسرع لإطلاق منتج جديد: تاخذ حملة خدّامة،
 * تنسخها، وتبدّل المنتج والصور والنصوص — بدل ما تبدا من فورم فارغ.
 * النسخة ديما مسوّدة (draft) وبرابط جديد.
 */
export async function duplicateCampaign(id, { name, slug } = {}) {
  const source = await getCampaign(id);
  if (!source) return null;

  const copy = { ...source };
  delete copy.id;
  delete copy.createdAt;
  delete copy.publishedAt;

  return saveCampaign({
    ...copy,
    name: name ?? `${source.name} (نسخة)`,
    slug: slug ?? `${source.slug}-copy`,
    status: 'draft',
  });
}

export async function deleteCampaign(id) {
  const existing = await getCampaign(id);
  if (!existing) return false;
  await routes().delete(`route:${pathFor('campaign', existing.slug)}`);
  await campaigns().delete(id);
  return true;
}

/* ── الفئات ────────────────────────────────────────────────────────── */

export async function saveCategory(input) {
  const now = new Date().toISOString();
  const existing = input.id ? await getCategory(input.id) : null;

  const slug = input.slug ? slugify(input.slug) : existing?.slug;
  if (!slug) throw new Error('الفئة تلزمها رابط (slug).');

  const record = {
    id: existing?.id ?? newId('cat_'),
    slug,
    name: input.name ?? existing?.name ?? '',
    tagline: input.tagline ?? existing?.tagline ?? null,
    icon: input.icon ?? existing?.icon ?? null,
    sort: Number(input.sort ?? existing?.sort ?? 0),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const oldPath = existing ? pathFor('category', existing.slug) : null;
  const newPath = pathFor('category', record.slug);
  if (oldPath && oldPath !== newPath) await moveRoute(oldPath, newPath, 'category', record.id);
  else await claimRoute(newPath, 'category', record.id);

  await categories().setJSON(record.id, record);
  return record;
}

export const getCategory = (id) => categories().get(id, { type: 'json' });

export async function listCategories() {
  const { blobs } = await categories().list();
  const records = await Promise.all(blobs.map((b) => categories().get(b.key, { type: 'json' })));
  return records.filter(Boolean).sort((a, b) => a.sort - b.sort);
}
