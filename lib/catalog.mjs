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
import { getStore } from './blobs.mjs';
import { randomBytes } from 'node:crypto';
import { normalizeBundles, normalizeUpsell } from './offers.mjs';
import { sanitizePixelId } from './tiktok.mjs';

const PRODUCTS = 'products';
const CAMPAIGNS = 'campaigns';
const CATEGORIES = 'categories';
const VARIANT_STOCK = 'variant-stock';
const ROUTES = 'routes';
/* عدّادات الكاتالوغ — دروك فيها وحدة برك: الرقم التسلسلي تاع المنتج */
const META = 'catalog-meta';

const products = () => getStore(PRODUCTS);
const campaigns = () => getStore(CAMPAIGNS);
const categories = () => getStore(CATEGORIES);
const variantStock = () => getStore(VARIANT_STOCK);
const routes = () => getStore(ROUTES);
const meta = () => getStore(META);

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

/* ── الرقم التسلسلي ────────────────────────────────────────────────
 *
 * كل منتج عندو رقم صغير (#1, #2...) يتعطالو مرّة وحدة ويبقى معاه.
 *
 * ⚠️ علاش ما كفاش الترتيب اللي كان: `/restock 3 10` كان ياخذ الرقم من
 * مرتبة المنتج في لائحة مرتّبة بالاسم. تزيد منتج جديد يبدا بحرف قبلو،
 * ولا تبدّل اسم منتج، والأرقام كامل تتزحلق — تكتب نفس الأمر اللي
 * كتبتيه البارح وتزوّد سلعة أخرى، بلا ما يبان حتى خطأ.
 *
 * الرقم دروك مخزّن على المنتج روحو. يتزحلق يوم ما تبدّل حتى حاجة.
 *
 * الـ id (prd_…) يبقى هو المفتاح في التخزين — الرقم التسلسلي للعين
 * ولليد برك: تقراه في اللوحة وتكتبو في تيليغرام.
 */
const SERIAL_KEY = 'counters';
const SERIAL_FIELD = 'productSerial';

/** الرقم اللي بعدو — ذرّي، فزوج منتجات في نفس اللحظة ما ياخذوش نفس الرقم */
export const nextProductSerial = () => meta().hincrBy(SERIAL_KEY, SERIAL_FIELD, 1);

/**
 * يعطي رقم تسلسلي لكل منتج قديم ما عندوش واحد، ويحطّ العدّاد فوق
 * أكبر رقم موجود. يتنادى من الهجرة (lib/legacy-stock.mjs) — بلاه،
 * محل خدّام من قبل هاذ الميزة يبقى بلا أرقام، والعدّاد يبدا من 1
 * ويعطي أرقام مكرّرة لمنتجات موجودة.
 */
export async function assignMissingSerials() {
  const all = await listProducts();
  const highest = all.reduce((max, product) => Math.max(max, Number(product.serial) || 0), 0);

  const current = Number(await meta().hget(SERIAL_KEY, SERIAL_FIELD)) || 0;
  if (current < highest) await meta().hincrBy(SERIAL_KEY, SERIAL_FIELD, highest - current);

  /* الأقدم ياخذ الرقم الأصغر — الترتيب اللي يستنّاه المشغّل */
  const missing = all
    .filter((product) => !Number(product.serial))
    .sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));

  const numbered = [];
  for (const product of missing) {
    const serial = await nextProductSerial();
    await products().setJSON(product.id, { ...product, serial });
    numbered.push({ id: product.id, serial });
  }
  return numbered;
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

/**
 * رقم فلوس صالح: عدد حقيقي، موجب، ومحدود.
 * يرمي خطأ بدل ما يرجع NaN — الخطأ يوصل للوحة ويتصلّح، وNaN يمشي
 * للتخزين ويبان في الصفحة بعد أيام.
 */
function money(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a valid non-negative number.`);
  return Math.round(n);
}

/**
 * فرق سومة يقدر يكون سالب (فاريانت أرخص من الأصل) — بعكس money() اللي
 * يرفض السالب. `minValue` افتراضيًا -مليون، بصح mergeVariants يبعث
 * -سومة_المنتج باش الفرق ما يقدرش يهبط بالسومة تحت الصفر.
 *
 * ⚠️ بلا هذا الحد: تاجر يكتب -39000 غلط بدل -3900، السومة النهائية
 * تولّي 0 (variantPrice تحبس عند 0)، الزبون يشوف رقم سالب في الصفحة
 * (main.js ما فيهش نفس الحبس)، والمُوصّل يجبى سومة الشحن غير — بيع
 * بالمجان وصفحة تعرض رقم ماشي هو اللي يتحاسب بيه.
 */
function signedMoney(value, label, minValue = -1_000_000) {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} must be a valid number.`);
  return Math.max(minValue, Math.min(1_000_000, Math.round(n)));
}

/** يقصّر نص ويرجّع null إذا فارغ — يخدم لـ merchantSku/barcode */
function shortText(value, maxLen) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed.slice(0, maxLen) : null;
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
    throw new Error(`The slug "${slug}" is reserved for the store. Choose another one.`);
  }

  /*
   * الحجز لازم يكون ذرّي (atomic). لو قرينا ومن بعد كتبنا، زوج حفظات
   * في نفس اللحظة بنفس الرابط يشوفو الزوج "فاضي" ويكتبو، والأخير يغلب
   * — الحملة الأولى تتخزّن بصح ما توصلهاش حتى زيارة، بلا حتى خطأ.
   *
   * `onlyIfNew` يخلّي الكتابة تفشل إذا المفتاح موجود، فالثاني ياخذ
   * خطأ واضح بدل ما يضيع بالسكات.
   */
  const key = `route:${path}`;
  const { modified } = await routes().setJSON(key, { kind, id }, { onlyIfNew: true });
  if (modified) return path;

  /* المفتاح موجود — نشوفو واش تاعنا (إعادة حفظ) ولا تاع واحد آخر */
  const existing = await resolveRoute(path);
  if (existing && existing.id !== id) {
    throw new Error(`The slug "${path}" is already in use.`);
  }
  await routes().setJSON(key, { kind, id });
  return path;
}

/**
 * يرجّع سلاق فاضي مبني على `base`: نفسو إذا الرابط خالي، وإلا `-2`,
 * `-3`… حتى يلقى واحد.
 *
 * علاش: claimRoute يرمي خطأ على السلاق المشغول، وهذا صحيح كي التاجر
 * يكتب السلاق بيدو (يستاهل يعرف). بصح كي الاسم يتولّد وحدو (فئة
 * جاهزة، منتج من تيليغرام) الخطأ ما يفيد والو — التاجر ما اختارش
 * السلاق أصلاً. هنا نتفادوه قبل ما يوقع.
 *
 * ⚠️ ماشي ذرّي: زوج كتابات في نفس اللحظة يقدرو يلقاو نفس الفراغ.
 * claimRoute ورا هذا يبقى هو الحارس الحقيقي (onlyIfNew) — هذي غير
 * تنقص فرصة الاصطدام، ما تلغيهاش.
 */
export async function availableSlug(kind, base, limit = 40) {
  const root = slugify(base) || 'item';
  for (let n = 1; n <= limit; n += 1) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    if (kind === 'campaign' && isReservedSlug(candidate)) continue;
    const taken = await resolveRoute(pathFor(kind, candidate));
    if (!taken) return candidate;
  }
  throw new Error(`Could not find a free slug for "${root}".`);
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
    /*
     * ⚠️ الحد هنا قبل ما نكمّلو الضرب، ماشي بعد: بلا هذا، لصق لائحة
     * طويلة في خانة القيم يبني مئات الآلاف من التركيبات في الذاكرة،
     * ومن بعد saveProduct يحاول يكتب بلوب مخزون لكل وحدة منها.
     */
    if (next.length > 300) {
      throw new Error('Too many variant combinations (max 300) — reduce the number of option values.');
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

/**
 * يثبّت شكل الصور: الـ id يبقى ثابت عبر إعادة الترتيب/الحذف (هو المرجع
 * اللي variant.mediaId يشدّ بيه)، وما يتولّدش id جديد غير للعنصر
 * الجديد بالكامل — وإلا كل حفظ يفصل الفاريانتات على صورهم.
 */
function normalizeMedia(value, previous = []) {
  if (!Array.isArray(value)) return [];
  const known = new Set(previous.map((m) => m?.id).filter(Boolean));
  return value
    .map((item) => {
      const src = String(item?.src ?? '').trim();
      if (!src) return null;
      return {
        id: known.has(item?.id) ? item.id : newId('pmd_'),
        src: src.slice(0, 300),
        alt: item?.alt ? String(item.alt).slice(0, 200) : null,
      };
    })
    .filter(Boolean)
    .slice(0, 24);
}

/** وسوم فريدة (بلا حساسية لحالة الحروف)، مقصوصة، بحد أقصى 30 */
function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set(); const out = [];
  for (const raw of value) {
    const tag = String(raw ?? '').trim().slice(0, 40);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); out.push(tag);
  }
  return out.slice(0, 30);
}

/**
 * `shipping` بالمفتاح ماشي بالقيمة: لازم نفرّقو بين "التاجر ما بدّلش
 * الحقل" و"التاجر مسحو قصدًا" (فرغ الخانة). ?? العادي يبلع الفرق —
 * نفس الخطأ القديم تاع compareAtPrice اللي ما يقدرش يتصفّر أبدًا.
 */
function normalizeShipping(input, existing) {
  const has = input && typeof input === 'object';
  return {
    weightGrams: has && 'weightGrams' in input
      ? (input.weightGrams == null || input.weightGrams === '' ? null : Math.max(0, Math.round(Number(input.weightGrams) || 0)))
      : (existing?.weightGrams ?? null),
    note: has && 'note' in input
      ? (input.note ? String(input.note).slice(0, 500) : null)
      : (existing?.note ?? null),
  };
}

export async function saveProduct(input) {
  const now = new Date().toISOString();
  const existing = input.id ? await getProduct(input.id) : null;

  const options = input.options ?? existing?.options ?? [];
  const slug = input.slug ? slugify(input.slug) : existing?.slug;
  if (!slug) throw new Error('The product needs a slug.');

  /*
   * ⚠️ Number('3900 دج') = NaN، وJSON.stringify يكتبو `null`.
   * السومة تولّي مفقودة والصفحة تعرض "NaN دج" — فنرفضو من هنا بدل
   * ما نخزّنو رقم مكسور.
   *
   * لازم قبل mergeVariants: فرق سومة الفاريانت لازم يتحبس بسومة
   * المنتج (شوف signedMoney) باش السومة النهائية ما تهبطش تحت الصفر.
   */
  const price = money(input.price ?? existing?.price ?? 0, 'Price');

  const media = normalizeMedia(input.media ?? existing?.media ?? [], existing?.media ?? []);
  /* نحافظو على priceDelta/mediaId/merchantSku/barcode تاع الفاريانتات
     القدام كي الخيارات ما تبدّلوش — وإلا كل حفظ يمسح التعديلات اليدوية.
     input.variants تجي قبل existing?.variants — الجدول اللي التاجر
     عدّل فيه دروك هو المصدر الصحيح، ماشي النسخة المخزّنة قبل الحفظ. */
  const variants = mergeVariants(buildVariants(options), input.variants ?? existing?.variants ?? [], new Set(media.map((m) => m.id)), price);

  const record = {
    id: existing?.id ?? newId('prd_'),
    /* يتعطى مرّة وحدة عند الإنشاء ويبقى — الحفظ اللاحق ما يبدّلوش،
       وإلا الرقم اللي كتبتيه في /restock يولّي يشير لسلعة أخرى */
    serial: existing?.serial ?? await nextProductSerial(),
    slug,
    name: input.name ?? existing?.name ?? '',
    shortDescription: String(input.shortDescription ?? existing?.shortDescription ?? '').slice(0, 300),
    description: String(input.description ?? existing?.description ?? '').slice(0, 5000),
    type: input.type ?? existing?.type ?? 'life',
    categoryId: input.categoryId ?? existing?.categoryId ?? null,
    tags: normalizeTags(input.tags ?? existing?.tags ?? []),
    featured: input.featured ?? existing?.featured ?? false,
    price,
    compareAtPrice: input.compareAtPrice == null ? (existing?.compareAtPrice ?? null)
      : money(input.compareAtPrice, 'Compare-at price'),
    /* واش تخلّص انت في السلعة — كانت في costs/current العامّة، ودروك
       على كل منتج وحدو، على خاطر كل منتج عندو تكلفة مختلفة. */
    unitCost: money(input.unitCost ?? existing?.unitCost ?? 0, 'Unit cost'),
    options,
    variants,
    media,
    /* يخدم غير كبذرة عند الحفظ (شوف seedVariantStock) — الحد الحي
       يتبدّل من جدول المخزون، ماشي من هنا */
    defaultStockThreshold: Math.max(0, Math.round(Number(input.defaultStockThreshold ?? existing?.defaultStockThreshold ?? DEFAULT_STOCK_THRESHOLD))),
    shipping: normalizeShipping(input.shipping, existing?.shipping),
    status: input.status ?? existing?.status ?? 'active',
    seo: {
      title: input.seo?.title ?? existing?.seo?.title ?? null,
      description: input.seo?.description ?? existing?.seo?.description ?? null,
      ogImage: input.seo?.ogImage ?? existing?.seo?.ogImage ?? null,
    },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const oldPath = existing ? pathFor('product', existing.slug) : null;
  const newPath = pathFor('product', record.slug);
  if (oldPath && oldPath !== newPath) await moveRoute(oldPath, newPath, 'product', record.id);
  else await claimRoute(newPath, 'product', record.id);

  await products().setJSON(record.id, record);

  /*
   * initialStock مؤقّت: يدخل هنا غير باش يبذر الكمية الأولى، ما يتخزّنش
   * في `record` (شوف تعليق الشكل فوق). منتج بخيارات يبذر threshold برك
   * — الكمية تتعمر يدويًا من جدول المخزون بعد أول حفظ.
   */
  const seedQty = record.options.length ? 0 : Math.max(0, Math.round(Number(input.initialStock) || 0));
  await Promise.all(record.variants.map((v) =>
    seedVariantStock(record.id, v.sku, { qty: seedQty, threshold: record.defaultStockThreshold })
      .catch(() => null)));

  return record;
}

/** يخلّي التعديلات اليدوية (سومة زايدة، صورة، SKU/باركود التاجر) كي الخيارات ما تبدّلوش */
function mergeVariants(fresh, previous, mediaIds, price) {
  const byKey = new Map(previous.map((v) => [v.sku, v]));
  return fresh.map((variant) => {
    const old = byKey.get(variant.sku);
    if (!old) return variant;
    return {
      ...variant,
      /* -price هو الحد: فرق أنقص من هذا يخلّي السومة النهائية سالبة */
      priceDelta: signedMoney(old.priceDelta, 'Variant price difference', -price),
      mediaId: mediaIds.has(old.mediaId) ? old.mediaId : null,
      merchantSku: shortText(old.merchantSku, 64),
      barcode: shortText(old.barcode, 64),
    };
  });
}

export const getProduct = (id) => products().get(id, { type: 'json' });

export async function listProducts() {
  const { blobs } = await products().list();
  const records = await Promise.all(blobs.map((b) => products().get(b.key, { type: 'json' })));
  return records.filter(Boolean);
}

/*
 * حذف نهائي: الرابط، مخزون كل فاريانت، والسجلّ.
 *
 * ⚠️ الحاجز (منتج عندو طلبات ما يتمسحش) ماشي هنا — هو في
 * api/admin-api.mjs، على خاطر store.mjs يستورد هذا الملف، ولو قرينا
 * الطلبات من هنا ندورو في حلقة استيراد.
 *
 * الرابط يتمسح ماشي يولّي تحويلة كيما في moveRoute: التحويلة معناها
 * "راح لبلاصة أخرى"، والمنتج هنا ما بقاش أصلاً — 404 أصدق من تحويلة
 * على صفحة ما كاينةش.
 */
export async function deleteProduct(id) {
  const existing = await getProduct(id);
  if (!existing) return false;

  await routes().delete(`route:${pathFor('product', existing.slug)}`).catch(() => null);
  await Promise.all((existing.variants ?? []).map((variant) =>
    variantStock().delete(stockKey(id, variant.sku)).catch(() => null)));
  await products().delete(id);
  return true;
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

/**
 * يبذر صف مخزون أوّلي وقت إنشاء المنتج — `onlyIfNew` يخلّيها ما
 * تلمسش صف موجود، وإلا كل حفظ لاحق يرجّع الكمية للصفر أو يمحي threshold
 * اللي التاجر بدّلو يدويًا من جدول المخزون.
 */
export async function seedVariantStock(productId, sku, { qty = 0, threshold = DEFAULT_STOCK_THRESHOLD } = {}) {
  const record = {
    productId, sku,
    qty: Math.max(0, Math.round(Number(qty) || 0)),
    threshold: Math.max(0, Math.round(Number(threshold) || 0)),
    lowStockAlerted: false,
    updatedAt: new Date().toISOString(),
  };
  const { modified } = await variantStock().setJSON(stockKey(productId, sku), record, { onlyIfNew: true });
  return modified ? record : null;
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

/** كل صفوف المخزون عبر كل المنتجات — أرخص من listStockFor لكل منتج
    (يديها N منتج × V فاريانت رحلة، هذي list() وحدة + gets بالتوازي). */
export async function listAllVariantStock() {
  const { blobs } = await variantStock().list();
  const records = await Promise.all(blobs.map((blob) => variantStock().get(blob.key, { type: 'json' })));
  return records.filter(Boolean);
}

/* ── الحملات ───────────────────────────────────────────────────────── */

export async function saveCampaign(input) {
  const now = new Date().toISOString();
  const existing = input.id ? await getCampaign(input.id) : null;

  const slug = input.slug ? slugify(input.slug) : existing?.slug;
  if (!slug) throw new Error('The campaign needs a slug.');
  if (isReservedSlug(slug)) throw new Error(`The slug "${slug}" is reserved. Choose another one.`);

  const record = {
    id: existing?.id ?? newId('cmp_'),
    slug,
    name: input.name ?? existing?.name ?? '',
    productId: input.productId ?? existing?.productId ?? null,
    template: input.template ?? existing?.template ?? 'qiti-default',
    theme: input.theme ?? existing?.theme ?? {},
    sections: input.sections ?? existing?.sections ?? [],
    /* العروض: باقات وعرض إضافي. حملة قديمة بلاهم تخرج بـ enabled:false
       ولائحة فارغة — العرض يتخطّاهم، والصفحة تبقى كيما كانت. */
    bundles: normalizeBundles(input.bundles, existing?.bundles),
    upsell: normalizeUpsell(input.upsell, existing?.upsell),
    status: input.status ?? existing?.status ?? 'draft',
    /* بيكسل تيك توك تاع هذه الصفحة. فارغ = نستعملو الافتراضي تاع
       الموقع. يتنظّف هنا ماشي وقت العرض برك: قيمة مكسّرة تتخزّن مرّة
       وتخرج في كل صفحة من بعد. */
    tiktokPixelId: sanitizePixelId(input.tiktokPixelId ?? existing?.tiktokPixelId) || null,
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
    name: name ?? `${source.name} (Copy)`,
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

/*
 * الإيموجي: حرف ولا حرفين برك. الحد ماشي تجميل — الحقل يتعرض في مربّع
 * ثابت في اللوحة، ونص طويل يخرج منّو ويكسّر الشبكة.
 *
 * ⚠️ الفئات القدام (من scripts/seed-demo-products.mjs) حطّو الإيموجي في
 * حقل `icon`، واللوحة كانت تعرض فيه أسماء أيقونات sprite ('i-pin'…).
 * حقلين لنفس البلاصة. دروك `emoji` هو الرسمي، و`icon` يبقى كيما هو
 * (ما نمسحوش بيانات) — بصح كي `emoji` خاوي ونلقاو `icon` ماشي اسم
 * sprite، معناها إيموجي قديم فنرقّيوه.
 */
function normalizeEmoji(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return [...text].slice(0, 2).join('');
}

const isSpriteName = (value) => String(value ?? '').startsWith('i-');

/* لون الفئة — hex برك. أي نص آخر يتردّ لـ null بدل ما يتخزّن ويتحقن
   في style="" في اللوحة. */
function normalizeColor(value) {
  const text = String(value ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toUpperCase() : null;
}

export async function saveCategory(input) {
  const now = new Date().toISOString();
  const existing = input.id ? await getCategory(input.id) : null;

  const slug = input.slug ? slugify(input.slug) : existing?.slug;
  if (!slug) throw new Error('The category needs a slug.');

  /* الترقية تشوف القيمة النهائية تاع `icon` ماشي المخزّنة برك — البذر
     (scripts/seed-demo-products.mjs) يبعث الإيموجي في `icon` على فئة
     جديدة، فما كانش `existing` باش نقراو منّو */
  const iconValue = input.icon ?? existing?.icon ?? null;

  const record = {
    id: existing?.id ?? newId('cat_'),
    slug,
    name: input.name ?? existing?.name ?? '',
    tagline: input.tagline ?? existing?.tagline ?? null,
    icon: iconValue,
    emoji: normalizeEmoji(
      input.emoji
      ?? existing?.emoji
      ?? (isSpriteName(iconValue) ? null : iconValue),
    ),
    color: normalizeColor(input.color ?? existing?.color),
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

/**
 * يمسح الفئة ويحرّر منتجاتها.
 *
 * ⚠️ المنتجات ما تتمسحش معاها — الفئة تنظيم، والمنتج سلعة. تمسح
 * "ملابس" ما يعنيش خسرت السلع. يولّيو بلا فئة ويبقاو في اللوحة.
 *
 * الكتابة مباشرة (setJSON) ماشي بـ saveProduct: هذاك يقرا
 * `input.categoryId ?? existing.categoryId` — فـ null يعدّي فوقو
 * ويرجّع الفئة القديمة، والمنتج يبقى مربوط بفئة ما كاينةش. وزيد،
 * saveProduct يعاود يحجز الرابط بلا فايدة.
 */
export async function deleteCategory(id) {
  const existing = await getCategory(id);
  if (!existing) return false;

  const now = new Date().toISOString();
  const all = await listProducts();
  await Promise.all(all
    .filter((product) => product.categoryId === id)
    .map((product) => products().setJSON(product.id, { ...product, categoryId: null, updatedAt: now })));

  await routes().delete(`route:${pathFor('category', existing.slug)}`).catch(() => null);
  await categories().delete(id);
  return true;
}
