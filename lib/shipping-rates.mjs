/*
 * تسعيرة التوصيل حسب الولاية — شركة التوصيل DHD.
 *
 * ── علاش ملف وحدو ──────────────────────────────────────────────────
 * قبل، التوصيل كان رقم واحد لكل الجزائر: `SHIPPING = { home: 600,
 * desk: 400 }` في message.mjs. هذا يخدم غير كي تكون تبيع في ولاية ولا
 * زوج — كي توصّل لـ 58 ولاية، تمنراست ما تسواش قد بومرداس، وأي رقم
 * واحد يخسّرك في البعيد ولا يهرّب الزبون في القريب.
 *
 * ── القاعدة ─────────────────────────────────────────────────────────
 * كل رقم يتخلّص يجي من هنا. الصفحة تعرضو، السيرفر يعاود يحسبو، والطلب
 * يخزّن `shippingFee` وقت ما يتسجّل — فتبديل التسعيرة غداً ما يمسّش
 * الطلبيات القدام (شوف shippingFeeOf في message.mjs).
 *
 * ── شكل الجدول ──────────────────────────────────────────────────────
 * مفتاح = رقم الولاية الرسمي (1-58، شوف wilayas.mjs)، ماشي الاسم —
 * الاسم يتكتب بأكثر من صيغة ("الجزائر" / "الجزائر العاصمة") وأي فرق
 * حرف واحد يطيّح السطر على التسعيرة التلقائية بلا ما تنتبه.
 *
 *   { home: 800, desk: 450 }   توصيل للدار + مكتب
 *   { home: 1400, desk: null } الولاية بلا مكتب DHD — الزبون ما
 *                              يقدرش يختار "مكتب"، والفورم يعمي الخيار
 *
 * الولاية اللي ما هيش في الجدول تاخذ DEFAULT_RATE. هذا مقصود: تسعيرة
 * ناقصة تبيع بالسومة العادية، ما تكسرش الطلب.
 */
import { WILAYAS, wilayaId } from './wilayas.mjs';

/* التسعيرة اللي كانت وحدة للكل — بقات كـ fallback للولايات اللي مازال
   ما وصلاتناش تسعيرتها من DHD */
export const DEFAULT_RATE = { home: 600, desk: 400 };

/*
 * ⚠️ فارغ حتى توصل قائمة DHD الحقيقية. كل ما هو ناقص يخدم بـ
 * DEFAULT_RATE، فالمتجر يبيع عادي في هذي الأثناء.
 */
export const RATES = {
  // 1: { home: 1000, desk: 600 },   // أدرار
};

/** رقم الولاية من اسمها ولا من رقمها — يرجع null إذا ما تعرفش */
function idOf(wilaya) {
  if (typeof wilaya === 'number') return Number.isInteger(wilaya) && wilaya >= 1 && wilaya <= WILAYAS.length ? wilaya : null;
  return wilayaId(wilaya);
}

/** تسعيرة ولاية كاملة { home, desk } — DEFAULT_RATE إذا ما كانتش مسجّلة */
export function rateFor(wilaya) {
  const id = idOf(wilaya);
  return (id && RATES[id]) || DEFAULT_RATE;
}

/** واش كاين مكتب DHD في هذي الولاية */
export const deskAvailable = (wilaya) => rateFor(wilaya).desk != null;

/*
 * سومة التوصيل اللي تتخلّص. ولاية بلا مكتب + طلب "مكتب" = سومة الدار،
 * ماشي صفر ولا خطأ — الطلب يوصل للدار وهي الحقيقة اللي يلزم تتخلّص.
 */
export function shippingFee(wilaya, mode) {
  const rate = rateFor(wilaya);
  return mode === 'desk' ? (rate.desk ?? rate.home) : rate.home;
}

/*
 * الجدول كامل للمتصفّح والعرض — [{ id, name, home, desk }] بترتيب الرقم.
 * نبنيوه من WILAYAS باش الصفحة ديما تعرض 58 ولاية حتى لو الجدول ناقص.
 */
export const rateTable = () => WILAYAS.map((name, index) => {
  const id = index + 1;
  const rate = rateFor(id);
  return { id, name, home: rate.home, desk: rate.desk ?? null };
});

/*
 * الحمولة اللي تمشي للصفحة — الجدول الخام برك (58 سطر صغار، أقل من
 * 2 كيلو). المتصفّح يحسب بيه العرض، والسيرفر يعاود يحسب بنفس الملف.
 */
export const ratesPayload = () => ({ default: DEFAULT_RATE, table: rateTable() });

/*
 * وسم <script> بالجدول، باش الصفحة تقراه.
 *
 * ⚠️ نفس الوسم بالضبط في الزوج تاع الطرق: الصفحات المعروضة من الخادم
 * (render.mjs) تكتبو مع باقي الصفحة، والصفحة الستاتيك (index.html)
 * تاخذو محقون في scripts/build.mjs. طريق واحد في main.js — بلا نسخة
 * ثانية من 58 ولاية في المتصفّح.
 *
 * JSON في وسم مغلق ماشي متغيّر عام: المتصفّح ما ينفّذوش ككود، ونهربو
 * `<` باش نص فيه "</script>" ما يخرجش من الوسم.
 */
export const RATES_SCRIPT_ID = 'qiti-shipping-rates';

export const ratesScriptTag = () =>
  `<script type="application/json" id="${RATES_SCRIPT_ID}">${
    JSON.stringify(ratesPayload()).replace(/</g, '\u003c')
  }</script>`;
