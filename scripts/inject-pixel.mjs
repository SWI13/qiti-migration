/*
 * حقن بيكسل تيك توك في الصفحة الستاتيك.
 *
 * علاش موجود: index.html ما يمرّش على renderer (lib/render/layout.mjs
 * هو اللي يحقن البيكسل في صفحات الحملات والمنتجات). بلا هذا، الصفحة
 * الرئيسية — وهي بالضبط الصفحة اللي تهبط عليها الإعلانات — تكون
 * الوحيدة بلا تتبّع، والحملة تخدم عمياء.
 *
 * الحقن يصرا في البناء برك (scripts/build.mjs)، ماشي في خادم التجريب:
 * تصفّح محلّي ما يلزمش يزيد زيارات كاذبة لبيانات الإنتاج.
 *
 * ⚠️ اللي يتحقن هو **وسم يجيب الكود**، ماشي الكود روحو بالـ id مكتوب
 * فيه. الـ id تاع الصفحة الرئيسية يتبدّل من اللوحة، ولو كان محروق في
 * الملف الستاتيك، كل تبديل في اللوحة يطلب نشر جديد — واللوحة تولّي
 * تبيّن رقم والصفحة تبعث لرقم آخر.
 */
import { tiktokPixelLoaderTag, PIXEL_SCRIPT_URL } from '../lib/tiktok.mjs';

export function injectTikTokPixel(html) {
  const tag = tiktokPixelLoaderTag();

  /* محقون من قبل (بناء مرّتين) — نسخة ثانية تعني كل زيارة تتحسب زوج مرّات */
  if (html.includes(PIXEL_SCRIPT_URL)) return html;

  if (html.includes('</head>')) return html.replace('</head>', `${tag}\n</head>`);
  if (html.includes('</body>')) return html.replace('</body>', `${tag}\n</body>`);
  return html + tag;
}
