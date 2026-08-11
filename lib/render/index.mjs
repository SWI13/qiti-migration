/*
 * محرّك عرض صفحات الحملات.
 *
 *   معطيات الحملة → قالب → ثيم → أقسام → HTML
 *
 * علاش عرض عند الطلب (function) ماشي بناء مسبق (build): باش النشر
 * يكون فوري بلا deploy، وباش المعاينة المباشرة في اللوحة تخدم بنفس
 * هذا الكود بالضبط — معاينة تخدم بكود آخر تكذب عليك يوم من الأيام.
 * الـ CDN يخبّي النتيجة، فالزائر ما يستنّاش الفنكشن.
 *
 * ── عقد القسم ──────────────────────────────────────────────────────
 * كل ملف في sections/ يصدّر فنكشن وحيد:
 *
 *   export default function (ctx) → string (HTML)
 *
 *   ctx = {
 *     data,       نصوص وصور هذا القسم (من campaign.sections[].data)
 *     product,    المنتج كامل — للسومة والخيارات والمخزون
 *     campaign,   الحملة (للرابط، الاسم، الخ)
 *     theme,      الثيم منظّف
 *     priceView,  { amount, compareAt, currency } محسوبة في الخادم
 *   }
 *
 * قواعد:
 *   • كل نص من data يمرّ على esc()، وكل رابط على safeUrl().
 *   • معلومة ناقصة → رجّع '' (بلوك فارغ أوحش من بلوك ما كانش).
 *   • القسم ما يقراش من التخزين وما يعرفش على الأقسام الأخرى.
 *
 * شوف sections/hero.mjs — هو المرجع.
 */
import { sanitizeTheme } from '../theme.mjs';
import { variantPrice, SIMPLE_SKU } from '../catalog.mjs';

import hero from './sections/hero.mjs';
import trust from './sections/trust.mjs';
import features from './sections/features.mjs';
import how from './sections/how.mjs';
import lifestyle from './sections/lifestyle.mjs';
import gallery from './sections/gallery.mjs';
import reviews from './sections/reviews.mjs';
import faq from './sections/faq.mjs';
import cta from './sections/cta.mjs';
import order from './sections/order.mjs';

/*
 * سجلّ الأقسام. المفتاح هو `type` اللي يتخزّن في الحملة.
 *
 * الأقسام اللي مازال ما تكتبوش يتجاهلو بلا ما تطيح الصفحة — حملة
 * ناقصة قسم أحسن من صفحة بيضا.
 */
export const SECTIONS = {
  hero,
  trust,
  features,
  how,
  lifestyle,
  gallery,
  reviews,
  faq,
  cta,
  /* الوحيد اللي فيه فلوس — يقرا السومة والخيارات من المنتج، ماشي من الحملة */
  order,
};

/*
 * ترتيب الأقسام الافتراضي حسب نوع المنتج.
 *
 * ماشي كود مختلف — نفس السجلّ، ترتيب مختلف. المنتج يبيع بطريقة
 * مختلفة حسب نوعو:
 *
 *  pet       — الفائدة العاطفية تجي قبل المواصفات. هذا هو ترتيب الطوق
 *              الحالي بالضبط: الثقة (نجوم + أرقام) توري بلي المنتج
 *              حقيقي، ومن بعد الفورم **دغيا في المرتبة 3** — اللي راه
 *              مقتنع يطلب ساعتها، واللي باقي يقرا يكمّل تحت والزر
 *              العائم يرجّعو للفورم كي يحتاجو.
 *  clothing  — الصور والمقاسات هما القرار. "كيفاش يخدم" ما عندها معنى
 *              في حوايج، والفورم يطلع لفوق على خاطر القرار يتّخذ بسرعة.
 *  auto      — الهمّ الأول "واش يدخل في كرهبتي؟" — التوافق والتركيب.
 */
export const DEFAULT_SECTIONS = {
  pet:      ['hero', 'trust', 'order', 'features', 'how', 'lifestyle', 'gallery', 'reviews', 'faq', 'cta'],
  clothing: ['hero', 'gallery', 'order', 'features', 'lifestyle', 'reviews', 'faq', 'cta'],
  auto:     ['hero', 'features', 'gallery', 'how', 'order', 'reviews', 'faq', 'cta'],
  tech:     ['hero', 'trust', 'features', 'how', 'order', 'gallery', 'reviews', 'faq', 'cta'],
  life:     ['hero', 'trust', 'features', 'order', 'gallery', 'reviews', 'faq', 'cta'],
};

/** قائمة أقسام فارغة جاهزة لنوع منتج — تستعملها اللوحة كي تنشئ حملة */
export const blankSectionsFor = (type = 'life') =>
  (DEFAULT_SECTIONS[type] ?? DEFAULT_SECTIONS.life).map((sectionType, index) => ({
    type: sectionType,
    enabled: true,
    order: index + 1,
    data: {},
  }));

/**
 * السومة المعروضة — تتحسب في الخادم من المنتج، عمرها ما تجي من
 * نصوص الحملة. لو خلّينا الحملة تكتب السومة بيدها، تبدّل سومة المنتج
 * وتنسى تبدّلها في الصفحة، والزبون يشوف سومة والفورم يحسب وحدة أخرى.
 */
export function priceViewFor(product) {
  if (!product) return null;
  const base = product.variants?.find((v) => v.sku === SIMPLE_SKU) ?? product.variants?.[0] ?? null;
  const amount = base ? variantPrice(product, base) : (product.price ?? 0);
  return {
    amount,
    compareAt: product.compareAtPrice ?? null,
    /* أرخص فاريانت — كي تكون مقاسات بسوم مختلفة نعرضو "يبدا من" */
    from: (product.variants ?? []).some((v) => (v.priceDelta ?? 0) !== 0),
  };
}

/**
 * يعرض أقسام الحملة بالترتيب.
 * يرجع نص HTML تاع المحتوى برك — الغلاف (head/nav/footer) في layout.mjs.
 */
export function renderSections(campaign, product, { preview = false } = {}) {
  const theme = sanitizeTheme(campaign?.theme);
  const priceView = priceViewFor(product);

  return (campaign?.sections ?? [])
    .filter((section) => section?.enabled !== false)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((section) => {
      const render = SECTIONS[section.type];
      if (!render) {
        console.warn(`Unknown section type "${section.type}" in campaign ${campaign?.id}`);
        return '';
      }
      try {
        return render({ data: section.data ?? {}, product, campaign, theme, priceView, preview });
      } catch (error) {
        /* قسم واحد يطيح ما يوقّفش الصفحة كاملة — الباقي يتعرض عادي */
        console.error(`Section "${section.type}" failed in campaign ${campaign?.id}:`, error.message);
        return '';
      }
    })
    .filter(Boolean)
    .join('\n');
}
