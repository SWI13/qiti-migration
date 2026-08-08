/*
 * مصدر الطلب (attribution) — منين جا الزبون: أشمن إعلان، أشمن منصّة.
 *
 * الفكرة: بلا هذا، تصرف في الإعلانات وما تعرفش أشمن إعلان جابلك زبائن
 * يخلّصو فعلاً. وهذي الحاجة **ما تتعوّضش لور** — إذا الطلب جا بلا ما
 * نسجّلو منين جا، راح للأبد. علاش لازم يكون موجود قبل أوّل دينار إعلان.
 *
 * الصفحة تقرا الـ params من الرابط (الإعلان يزيدهم وحدو) وتبعثهم مع
 * الطلب. كلش هنا ما نثقو فيه — جاي من المتصفّح، فنحدّدو الطول ونحيّدو
 * أي حاجة ماشي نص عادي.
 */

/** الحد الأقصى لطول أي قيمة — باش حتى واحد ما يبعث نص طويل يهرّس الرسالة */
const MAX_VALUE_LENGTH = 120;

/** الحقول اللي نقبلوهم برك. أي حاجة أخرى تجي من الكليان تتحيّد. */
export const ATTRIBUTION_FIELDS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'fbclid', 'ttclid',
];

const clean = (value) => {
  if (typeof value !== 'string') return null;
  /* نحيّدو أحرف التحكّم والأسطر — هذي القيم تدخل في رسالة تيليغرام */
  const trimmed = Array.from(value)
    .filter((ch) => { const code = ch.codePointAt(0); return code > 31 && code !== 127; })
    .join('')
    .trim();
  return trimmed ? trimmed.slice(0, MAX_VALUE_LENGTH) : null;
};

/**
 * ينظّف اللي جا من الفورم ويرجّع object نظيف (ولا null إذا ما كان والو).
 * `landedAt` = وقتاش الزبون حلّ الصفحة أوّل مرّة — يلزم لبناء `fbc`
 * تاع ميتا (الصيغة: fb.1.<timestamp>.<fbclid>).
 */
export function sanitizeAttribution(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const result = {};
  for (const field of ATTRIBUTION_FIELDS) {
    const value = clean(raw[field]);
    if (value) result[field] = value;
  }

  const landedAt = Number(raw.landedAt);
  if (Number.isFinite(landedAt) && landedAt > 0) result.landedAt = landedAt;

  return Object.keys(result).length ? result : null;
}

/**
 * اسم القناة بالعربية للرسالة — نستنتجوه من الـ click id قبل الـ utm،
 * على خاطر الـ click id ديما صحيح (المنصّة روحها تزيدو) بصح الـ utm
 * يقدر يكون مكتوب بالغلط في إعداد الإعلان.
 */
export function channelLabel(attribution) {
  if (!attribution) return 'مباشر / ما نعرفوش';
  if (attribution.fbclid) return 'فيسبوك/انستغرام (إعلان)';
  if (attribution.ttclid) return 'تيك توك (إعلان)';
  if (attribution.utm_source) {
    const medium = attribution.utm_medium ? ` (${attribution.utm_medium})` : '';
    return `${attribution.utm_source}${medium}`;
  }
  return 'مباشر / ما نعرفوش';
}

/**
 * مفتاح ثابت للتجميع في التقارير — ماشي للعرض. نحبّو "facebook" وحدة
 * ماشي عشرة أسماء مختلفة، باش إحصائيات RTO لكل قناة تكون صحيحة.
 */
export function channelKey(attribution) {
  if (!attribution) return 'direct';
  if (attribution.fbclid) return 'meta';
  if (attribution.ttclid) return 'tiktok';
  if (attribution.utm_source) return attribution.utm_source.toLowerCase();
  return 'direct';
}

/** اسم الحملة إذا كان — يبان في الرسالة باش تعرف أشمن إعلان بالضبط */
export const campaignLabel = (attribution) =>
  attribution?.utm_campaign ?? attribution?.utm_content ?? null;
