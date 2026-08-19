/*
 * الطوق: من عدّاد عام لمنتج حقيقي.
 *
 * ── المشكلة ─────────────────────────────────────────────────────────
 * index.html هي أوّل صفحة هبوط في هاذ المشروع — كانت قبل ما يوجد
 * الكاتالوغ أصلاً. الطلبات اللي تجي منها ما فيهاش `productId`، فالمخزون
 * تاعها سكن في عدّاد عام واحد (`stock/current` في store.mjs) ماشي في
 * صفّ مخزون تاع منتج.
 *
 * النتيجة اللي يعيشها المشغّل: تكتب /restock 20 في تيليغرام، الرقم
 * يطلع، وتحلّ اللوحة… ما تلقى لا الطوق ولا الكمية. ماشي عطب — الكمية
 * موجودة، بصح في بلاصة ما عندهاش منتج تتعلّق بيه، واللوحة تعرض
 * المنتجات. ومن ساعة ما يتصنع أوّل منتج في الكاتالوغ، /restock يبدّل
 * وجهتو للفاريانتات، والعدّاد العام يبقى معلّق: رقم حيّ في التقارير،
 * ما تقدر لا تشوفو لا تبدّلو من اللوحة.
 *
 * ── الحلّ ───────────────────────────────────────────────────────────
 * هجرة تصرا مرّة وحدة: منتج حقيقي اسمو "Qiti Collar"، والكمية اللي في
 * العدّاد العام تتحوّل لصفّ المخزون تاعو، والعدّاد يرجع صفر. من بعدها
 * الطوق منتج كيف كل المنتجات — يبان في اللوحة، عندو رقم تسلسلي، ومخزونو
 * ينقص كي تقبل طلب.
 *
 * ⚠️ المنتج يتصنع `draft` بقصد: الصفحة اللي تبيع الطوق راهي index.html
 * وما تبدّلت في والو. لو كان `active`، يولّى عندو صفحة ثانية في
 * /p/qiti-collar تبيع نفس السلعة — زوج صفحات لنفس الطوق، وواحدة منهم
 * ما حد يعرفها. بدّلها لـ active من اللوحة نهار ما تحبّ تحيّد
 * الصفحة الستاتيك.
 *
 * ⚠️ والسومة تبقى تتحسب بالطريق القديم للطلبات الجايّة من index.html:
 * السومة مكتوبة في الـ HTML الستاتيك (PRODUCT_PRICE)، فلو نحسبو
 * بسومة المنتج ونتي تبدّلها من اللوحة، الصفحة توري رقم والمُوصّل يجبى
 * رقم آخر. المنتج هنا يخدم للمخزون والتقارير — شوف api/order.mjs.
 */
import { getStore } from './blobs.mjs';
import { getStock, setStock, getCosts } from './store.mjs';
import {
  listProducts, saveProduct, getProduct, seedVariantStock, setVariantStock,
  getVariantStock, assignMissingSerials, availableSlug, SIMPLE_SKU,
} from './catalog.mjs';
import { PRODUCT_PRICE } from './message.mjs';

const META = 'catalog-meta';
const meta = () => getStore(META);
/* علامة الهجرة، وفيها الـ id — نفس المفتاح يخدم كجواب لـ
   "أشمن منتج يخصّ الصفحة الستاتيك؟" في api/order.mjs */
const LEGACY_KEY = 'legacy-product';

export const LEGACY_SLUG = 'qiti-collar';
export const LEGACY_NAME = 'Qiti Collar';

/** الـ id تاع منتج الصفحة الستاتيك، ولا null إذا الهجرة ما صراتش */
export async function legacyProductId() {
  const record = await meta().get(LEGACY_KEY, { type: 'json' }).catch(() => null);
  return record?.productId ?? null;
}

/**
 * يلقى المنتج اللي يخصّ الصفحة الستاتيك، ولا null.
 *
 * يتحقّق بلي المنتج ما زال موجود: العلامة تقدر تشير لمنتج تمسح من
 * اللوحة، ووقتها أحسن نرجّعو null من نشدّو id ميّت ونعلّقو بيه طلبات.
 */
export async function legacyProduct() {
  const id = await legacyProductId();
  if (!id) return null;
  return getProduct(id).catch(() => null);
}

/**
 * الهجرة روحها. ترجع { product, migrated, movedQty } — `migrated` تقول
 * واش هذي المرّة اللي صرا فيها الشغل فعلاً.
 *
 * تتنادى من كل بلاصة يقدر يبدا منها المشغّل (اللوحة، /stock، /restock،
 * تقرير آخر النهار) على خاطر ما كاينش "خطوة نشر" في هاذ المشروع —
 * الكود يتنشر وحدو، والهجرة لازم تلقى روحها. النداء المتكرّر رخيص:
 * قراية مفتاح وحدة كي تكون مدارة خلاص.
 */
export async function ensureLegacyProduct() {
  const existingId = await legacyProductId();
  if (existingId) {
    const product = await getProduct(existingId).catch(() => null);
    if (product) return { product, migrated: false, movedQty: 0 };
    /* المنتج تمسح — نعاودو من الأوّل بدل ما نبقاو نشيرو لحاجة ما كاينةش */
  }

  /*
   * منتج بنفس السلاق يقدر يكون تصنع بيدين المشغّل قبل هاذ الهجرة.
   * نتبنّاوه بدل ما نصنعو ثاني بنفس الاسم — نسختين تاع نفس الطوق
   * معناها مخزونين، وواحد منهم غالط ديما.
   */
  const all = await listProducts().catch(() => []);
  const adopted = all.find((product) => product.slug === LEGACY_SLUG)
    ?? all.find((product) => String(product.name ?? '').trim().toLowerCase() === LEGACY_NAME.toLowerCase());

  const legacy = await getStock();
  const costs = await getCosts().catch(() => null);
  const product = adopted ?? await saveProduct({
    name: LEGACY_NAME,
    slug: await availableSlug('product', LEGACY_SLUG),
    type: 'pet',
    /* نفس السومة المكتوبة في الصفحة الستاتيك — بلا هذا، أوّل مرّة
       تنشرها كصفحة منتج توري سومة غير اللي كان يشوفها الزبون */
    price: PRODUCT_PRICE,
    unitCost: costs?.productCost ?? 0,
    shortDescription: 'طوق Qiti الذكي بـ GPS — الصفحة الرئيسية.',
    /* الكمية وحدّ التنبيه يجيو من العدّاد العام مباشرةً: saveProduct
       يبذر صفّ المخزون وحدو عند الإنشاء، فلو نحطّو الكمية من بعد
       نولّيو نكتبو مرّتين على نفس الصفّ */
    initialStock: legacy.qty,
    defaultStockThreshold: legacy.threshold,
    /* شوف الملاحظة فوق: الصفحة الستاتيك هي اللي تبيع، وهذا السجلّ
       للمخزون والتقارير. بدّلها لـ active كي تحبّ صفحة منتج حقيقية. */
    status: 'draft',
  });

  /*
   * المنتج الجديد خذا الكمية وقت الإنشاء. المتبنّى لا — عندو مخزونو
   * هو، والكمية اللي في العدّاد العام تتزاد عليه بدل ما ترمى: السلعة
   * راهي في المحل فعلاً، وواحد عدّها مرّة في كل بلاصة.
   */
  let movedQty = adopted ? 0 : legacy.qty;
  if (adopted && legacy.qty > 0) {
    const current = await getVariantStock(product.id, SIMPLE_SKU);
    await setVariantStock(product.id, SIMPLE_SKU, current.qty + legacy.qty);
    movedQty = legacy.qty;
  }

  /* منتج تصنع قبل ما توجد الهجرة يقدر يكون بلا صفّ مخزون أصلاً */
  if (adopted) {
    await seedVariantStock(product.id, SIMPLE_SKU, { threshold: legacy.threshold }).catch(() => null);
  }

  /*
   * العدّاد العام يرجع صفر ماشي يتمسح: stock-view.mjs ما توريهش كي
   * يكون صفر، فيختفي من /stock ومن التقرير وحدو. وresetStock() تمسح
   * حتى حدّ التنبيه، وهذا اللي كان يخلّيه يرجع للافتراضي بلا ما يطلبو
   * حتى واحد.
   */
  if (legacy.qty > 0) await setStock(0, legacy.threshold);

  /* الأرقام التسلسلية للمنتجات القدام — نفس الهجرة، نفس المرّة */
  await assignMissingSerials().catch((error) =>
    console.error('Serial backfill failed:', error.message));

  const fresh = await getProduct(product.id).catch(() => product);
  await meta().setJSON(LEGACY_KEY, {
    productId: product.id,
    migratedAt: new Date().toISOString(),
    movedQty,
  });

  return { product: fresh ?? product, migrated: true, movedQty };
}
