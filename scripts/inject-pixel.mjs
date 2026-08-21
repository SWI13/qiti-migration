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
 * مصدر الـ id واحد: lib/tiktok.mjs. زوج نسخ من الـ id في زوج بلايص
 * معناها نهار تبدّلو وحدة وتنسى الأخرى.
 */
import { tiktokPixelSnippet } from '../lib/tiktok.mjs';

export function injectTikTokPixel(html) {
  const snippet = tiktokPixelSnippet();
  /* مطفي (TIKTOK_PIXEL_ID فارغة) — الصفحة تخرج كيما هي */
  if (!snippet) return html;

  /* محقون من قبل (بناء مرّتين) — نسخة ثانية تعني كل زيارة تتحسب زوج مرّات */
  if (html.includes('window.__qitiTtq')) return html;

  if (html.includes('</head>')) return html.replace('</head>', `${snippet}\n</head>`);
  if (html.includes('</body>')) return html.replace('</body>', `${snippet}\n</body>`);
  return html + snippet;
}
