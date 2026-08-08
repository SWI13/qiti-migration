/*
 * محرّك الثيم — كيفاش حملة تبدّل شكلها بلا ما تبدّل الـ HTML.
 *
 * الفكرة: الـ CSS تاعنا كامل يمرّ على tokens (274 استعمال لـ var(--…)).
 * يعني ثيم الحملة ماشي ستايل جديد — هو غير كتلة صغيرة تعاود تعرّف شي
 * 15 توكن، تتحط بعد styles.css في الـ head.
 *
 * نفس الـ HTML اللي يبيع طوق القطط يولّي streetwear بتبديل 4 قيم.
 *
 * ── قاعدة أمان مهمّة ────────────────────────────────────────────────
 * ما نقبلوش CSS حر أبداً. المستخدم (ولا الذكاء الاصطناعي) يختار من
 * قائمة محدودة: ألوان لازم تكون hex صحيح، والخط والزوايا من enum.
 * أي قيمة ما فهمناهاش تطيح ونرجعو للافتراضي — ما تدخلش للصفحة.
 *
 * ── الوضع الليلي في صفحات الحملات ───────────────────────────────────
 * كي الحملة عندها ثيم، الشكل يتقفل على `mood` تاعها وزر الليلي/النهاري
 * ما يبانش. علاش: تبديلات الحملة تتكتب في `:root` وتجي بعد
 * `[data-theme="dark"]` في الترتيب — بنفس الـ specificity، فتغلبها في
 * الزوج حالات. زر ما يبدّل والو أسوأ من زر ما كاينش.
 * المتجر الرئيسي (بلا ثيم حملة) يحتفظ بالزر عادي.
 */

/* الخطوط المسموح بيها — كل واحد بالعائلة تاع Google Fonts والستاك */
const FONTS = {
  tajawal: { family: 'Tajawal', weights: '400;500;700;800;900', stack: "'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif" },
  cairo:   { family: 'Cairo',   weights: '400;600;700;900',     stack: "'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif" },
  almarai: { family: 'Almarai', weights: '400;700;800',         stack: "'Almarai', 'Segoe UI', Tahoma, Arial, sans-serif" },
};

/* سلالم الزوايا — من الحاد (streetwear) للدائري (منتجات الأطفال والحيوانات) */
const RADII = {
  sharp: { sm: '2px',  md: '3px',  lg: '4px',  xl: '6px' },
  soft:  { sm: '10px', md: '16px', lg: '24px', xl: '32px' },   /* الافتراضي الحالي */
  round: { sm: '16px', md: '24px', lg: '36px', xl: '48px' },
};

export const FONT_KEYS = Object.keys(FONTS);
export const RADIUS_KEYS = Object.keys(RADII);
export const MOOD_KEYS = ['light', 'dark'];

const HEX = /^#[0-9a-fA-F]{6}$/;

/* ── تباين الألوان (WCAG) ──────────────────────────────────────────
 *
 * علاش هنا: الذكاء الاصطناعي يعرف يختار ألوان شابّة وما يعرفش يقرا.
 * بلا هذا الفحص، يقدر يعطيك برتقالي فاتح على أبيض — يبان مليح في
 * الوصف ويكون غير مقروء في التيليفون تحت الشمس.
 */
const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255)   /* أحمر */
       + 0.7152 * channel((n >> 8) & 255)    /* أخضر */
       + 0.0722 * channel(n & 255);          /* أزرق */
}

/** نسبة التباين بين لونين — 1 (نفس اللون) لـ 21 (أسود/أبيض) */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* ── التحقّق والتنظيف ──────────────────────────────────────────────── */

const hex = (value, fallback) => (HEX.test(String(value ?? '')) ? String(value).toUpperCase() : fallback);
const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

/**
 * ينظّف ثيم جاي من برّا (اللوحة ولا الذكاء الاصطناعي). ديما يرجع ثيم
 * صالح — القيم الغالطة تتبدّل بالافتراضي بدل ما ترمي خطأ، باش حملة
 * ما تتهرّسش على ود لون مكتوب غالط.
 */
export function sanitizeTheme(input = {}) {
  const mood = pick(input.mood, MOOD_KEYS, 'light');
  const isDark = mood === 'dark';

  return {
    mood,
    accent:     hex(input.accent, '#FF6B2C'),
    accentText: hex(input.accentText, isDark ? '#1A0E07' : '#FFFFFF'),
    bg:         hex(input.bg, isDark ? '#0C0B0A' : '#FFFFFF'),
    surface:    hex(input.surface, isDark ? '#161412' : '#FFFFFF'),
    text:       hex(input.text, isDark ? '#F6F2EE' : '#14110F'),
    font:       pick(input.font, FONT_KEYS, 'tajawal'),
    radius:     pick(input.radius, RADIUS_KEYS, 'soft'),
  };
}

/**
 * يفحص واش الثيم مقروء. يرجع قائمة ملاحظات، كل وحدة بدرجة:
 *
 *   error — الصفحة ما تتقراش. نرفضو الثيم (بوابة الذكاء الاصطناعي §10).
 *   warn  — ماشي مثالي، بصح قرار علامة مشروع. نبيّنو ونخلّيو القرار للمستخدم.
 *
 * ⚠️ علاش الفرق موجود: البرتقالي تاع Qiti روحو (#FF6B2C) مع كتابة بيضا
 * يعطي 2.84:1 — تحت العتبة. لو درنا كلش رفض، الشكل الحالي تاع الموقع
 * روحو يتّرفض، وكل حملة تطلع بتنبيه — والتنبيه اللي يطلع ديما ما يتقراش.
 * فالقاعدة: نرفضو غير النص على الخلفية (هذا اللي يعمي الصفحة فعلاً)،
 * والباقي ملاحظة.
 */
export function themeWarnings(theme) {
  const t = sanitizeTheme(theme);
  const notes = [];

  const check = (level, a, b, min, label) => {
    const ratio = contrastRatio(a, b);
    if (ratio < min) {
      notes.push({ level, ratio, message: `${label}: التباين ${ratio.toFixed(2)}:1، المستحسن ${min}:1.` });
    }
  };

  /* هذا وحدو يرفض: نص ما يتقراش = صفحة خاسرة */
  check('error', t.text, t.bg, 4.5, 'النص على الخلفية');
  /* كتابة الأزرار كبيرة وثخينة، فعتبتها 3:1 ماشي 4.5:1 */
  check('warn', t.accentText, t.accent, 3, 'كتابة الزر على لون الزر');
  check('warn', t.accent, t.bg, 3, 'لون العلامة على الخلفية');

  return notes;
}

/** واش هذا الثيم مرفوض؟ (خطأ واحد يكفي) */
export const themeIsUsable = (theme) => !themeWarnings(theme).some((n) => n.level === 'error');

/* ── التوليد ───────────────────────────────────────────────────────── */

/**
 * الكتلة اللي تتحط في الـ head بعد styles.css.
 * ترجع CSS برك (بلا وسم style) — الرندرر هو اللي يلفّها.
 */
export function themeCss(theme) {
  const t = sanitizeTheme(theme);
  const r = RADII[t.radius];
  const font = FONTS[t.font];

  /* الوضع الداكن يحتاج أسطح وحدود مبنية على الخلفية، ماشي ثوابت */
  const isDark = t.mood === 'dark';
  const border = isDark ? 'rgba(255,255,255,.10)' : 'rgba(20,17,15,.09)';
  const borderStrong = isDark ? 'rgba(255,255,255,.18)' : 'rgba(20,17,15,.16)';

  return `:root{
--font:${font.stack};
--accent:${t.accent};
--accent-hover:${t.accent};
--accent-text:${t.accentText};
--accent-soft:${t.accent}1F;
--bg:${t.bg};
--bg-alt:${t.surface};
--bg-gray:${t.surface};
--surface:${t.surface};
--surface-2:${t.surface};
--text:${t.text};
--text-muted:${t.text}A6;
--text-faint:${t.text}80;
--border:${border};
--border-strong:${borderStrong};
--r-sm:${r.sm};--r-md:${r.md};--r-lg:${r.lg};--r-xl:${r.xl};
--btn-dark-bg:${t.text};--btn-dark-bg-hover:${t.text}E0;--btn-dark-text:${t.bg};
--btn-light-bg:${t.surface};--btn-light-text:${t.text};
--surface-deep:${t.surface};
--cta-bg-1:${t.accent}26;--cta-bg-2:${t.accent}0D;--cta-bg-3:${t.bg};
--cta-glow:${t.accent}1A;
}`;
}

/** وسم الخط اللي يلزم الصفحة — يتبدّل حسب ثيم الحملة */
export function fontLinkFor(theme) {
  const font = FONTS[sanitizeTheme(theme).font];
  return `https://fonts.googleapis.com/css2?family=${font.family}:wght@${font.weights}&display=swap`;
}

/** الثيم الافتراضي — هو بالضبط شكل Qiti الحالي */
export const DEFAULT_THEME = sanitizeTheme({ mood: 'light' });
