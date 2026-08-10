/*
 * من يقدر يشغّل تقرير مجدول.
 *
 * ⚠️ تبدّل مع الهجرة لـ Vercel، وعن قصد.
 *
 * على Netlify، التقرير المجدول كان ينادى بلا request أصلاً، فالكود كان
 * يقول: "ماكانش ?key= ⇒ راهو الـ cron ⇒ خلّيه يعدّي". على Vercel الـ
 * cron ينادي عبر HTTP عادي على /api/daily-report، ونفس الرابط مفتوح
 * للعالم كامل — يعني أي واحد يحلّ الرابط بلا مفتاح كان يطلق التقرير
 * ويقصف التيليغرام. "ماكانش مفتاح" ما بقاتش تعني "راهو الـ cron".
 *
 * دروك لازم واحد من الزوج:
 *   Authorization: Bearer <CRON_SECRET>   — Vercel يحطّها وحدو في نداء
 *                                           الـ cron كي تكون CRON_SECRET
 *                                           مضبوطة في متغيّرات البيئة.
 *   ?key=<TELEGRAM_WEBHOOK_SECRET>        — التشغيل اليدوي بالـ curl.
 *
 * بلا CRON_SECRET مضبوطة، نداء الـ cron يطيح بـ 403 — فشل مغلق: تقرير
 * ناقص يتلاحظ، ورابط مفتوح لا.
 */

/** مقارنة بطول ثابت — ما تسرّبش قدّاش من حرف كان صحيح */
function safeEqual(a, b) {
  const left = String(a ?? '');
  const right = String(b ?? '');
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export function authorized(request) {
  const url = request?.url ? new URL(request.url) : null;

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const header = request?.headers?.get?.('authorization') ?? '';
    if (safeEqual(header, `Bearer ${cronSecret}`)) return true;
  }

  const manualSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const provided = url?.searchParams.get('key');
  if (manualSecret && provided != null && safeEqual(provided, manualSecret)) return true;

  return false;
}
