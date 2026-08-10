/*
 * رابط الموقع الرسمي.
 *
 * 🔒 ما ياخذوش من الطلب أبداً. تسجيل ويبهوك تيليغرام يبني الرابط من
 * هنا — لو قريناه من `Host`، أي واحد يبعث `Host: evil.com` يحوّل
 * الويبهوك لعندو وتيليغرام يبعثلو الـ secret في الهيدر. ثغرة حقيقية.
 *
 * الترتيب مقصود:
 *   SITE_URL                        نضبطوها بيدنا — الدومين الحقيقي
 *                                   (qiti.com). تغلب كلشي.
 *   VERCEL_PROJECT_PRODUCTION_URL   دومين الإنتاج الثابت تاع المشروع.
 *   VERCEL_URL                      رابط النشر الواحد — يتبدّل مع كل
 *                                   deploy، فما ينفعش للويبهوك، بصح
 *                                   خير من والو في المعاينات.
 *   URL / DEPLOY_URL                إرث Netlify — يبقاو باش أي بيئة
 *                                   قديمة ما تنهارش فجأة.
 */
export function siteUrl() {
  const explicit = process.env.SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;

  const deployment = process.env.VERCEL_URL;
  if (deployment) return `https://${deployment}`;

  const legacy = process.env.URL ?? process.env.DEPLOY_URL;
  return legacy ? legacy.replace(/\/$/, '') : null;
}
