/* ==========================================================================
   Qiti admin — تنسيق الأرقام
   هذا للشاسي الإداري برك (أرقام لاتينية، en-US). ماشي نفس dz() تاع
   netlify/lib/message.mjs اللي يبعث لتيليغرام وللمتجر بصيغة عربية —
   ما نلمسوهاش، هذا ملف موازي لسياق مختلف كامل.
   ========================================================================== */

/** 3900 → "3,900 DZD" */
export function fmtMoney(n) {
  return Number(n || 0).toLocaleString('en-US') + ' DZD';
}

/*
 * الوقت: جوج دوال ماشي وحدة، والفرق مقصود.
 * fmtDateTime تاخذ لحظة كاملة (ISO بالساعة) — طلب وصل 09:14.
 * fmtDay تاخذ نهار برك ("2026-08-10") — نقطة في محور لوحة القيادة.
 * دمجهم في وحدة كان يعني ولا ساعة كاذبة على نهار، ولا نهار بلا ساعة
 * على طلب — وجوجهم غلط.
 */

/** ISO كامل → "Aug 10, 09:14". فارغ → "—" */
export function fmtDateTime(iso) {
  if (!iso) return '—';
  var date = new Date(iso);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* T00:00:00 لازمة: "2026-08-10" وحدها تتقرا UTC، وفي توقيت سالب تولّي
   نهار 9 — محور اللوحة كامل يزحلق نهار للور */
/** "2026-08-10" → "Aug 10". فارغ → "—" */
export function fmtDay(day) {
  if (!day) return '—';
  var date = new Date(day + 'T00:00:00');
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** 0.033 → "3.3%" — النسبة تجي كسر ماشي مضروبة في 100 */
export function fmtPct(n) {
  return (Number(n || 0) * 100).toFixed(1) + '%';
}
