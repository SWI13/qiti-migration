/*
 * أدوات بناء الـ HTML.
 *
 * ── القاعدة الوحيدة اللي ما تتكسرش ─────────────────────────────────
 * نخزّنو النص خام، ونهربوه وقت العرض (نفس قاعدة esc في message.mjs).
 * نصوص الحملة يكتبها المستخدم — ولا يولّدها الذكاء الاصطناعي — يعني
 * لازم نعاملوها كيما نعاملو نص الزبون: ما نثقو فيها.
 *
 * علاش هذا يهم بزاف هنا: كي نزيدو "ولّد التصميم" بالذكاء الاصطناعي،
 * وصف منتج فيه <script> يولّي نص بايّن في الصفحة، ماشي كود يخدم.
 * الهروب في مكان واحد = الحماية ما تنساش.
 */

/** يهرب النص باش يدخل في محتوى العنصر */
export const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * يهرب النص باش يدخل في قيمة خاصية (attribute).
 * زيادة على فوق: الڨيمات والأقواس المزدوجة، وإلا يخرج من الخاصية
 * ويزيد وحدة جديدة (onerror= مثلاً).
 */
export const escAttr = (value) =>
  esc(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * روابط: نقبلو غير http/https والمسارات الداخلية.
 * `javascript:` في href يخدم حتى لو النص مهروب — الهروب ما يكفيش هنا.
 */
export function safeUrl(value, fallback = '#') {
  const url = String(value ?? '').trim();
  if (!url) return fallback;
  if (/^https?:\/\//i.test(url)) return escAttr(url);
  /*
   * ⚠️ `//evil.com/x` يبان مسار داخلي وهو ماشي: المتصفّح يقراه
   * "نفس البروتوكول + موقع برّاني". لازم نرفضوه قبل فحص المسارات،
   * وإلا صورة ولا سكريبت من موقع آخر يدخل من الباب اللي دايرينو
   * باش نسدّوه.
   */
  if (url.startsWith('//')) return fallback;
  if (/^[/#]/.test(url)) return escAttr(url);
  return fallback;
}

/** يبني خصائص من كائن، ويطيّح اللي قيمتو null/undefined/false */
export const attrs = (map = {}) =>
  Object.entries(map)
    .filter(([, v]) => v !== null && v !== undefined && v !== false && v !== '')
    .map(([k, v]) => (v === true ? k : `${k}="${escAttr(v)}"`))
    .join(' ');

/** يجمع قائمة أجزاء HTML ويطيّح الفوارغ — باش الأقسام الاختيارية تختفي نظيف */
export const join = (parts) => parts.filter(Boolean).join('\n');

/** قائمة عناصر → HTML، مع تجاهل العناصر الفارغة */
export const mapJoin = (items, fn) => (Array.isArray(items) ? items.filter(Boolean).map(fn).join('\n') : '');

/** رقم بصيغة الدينار — نفس dz() في message.mjs */
export const dz = (n) => `${Number(n ?? 0).toLocaleString('en-US')} دج`;

/** يهرب النص باش يدخل في سكريبت كـ string literal — نفس منطق productJsonLd */
export const jsLit = (v) => JSON.stringify(String(v)).replace(/</g, '\\u003c');
