/*
 * حقن جدول التوصيل في صفحة ستاتيك.
 *
 * علاش موجود: index.html ملف ثابت ما يمرّش على renderer، فما عندوش
 * منين ياخذ تسعيرة الولايات. بلا هذا الحقن، main.js يرجع للتسعيرة
 * الوحدة القديمة — الزبون يشوف 600 دج، والسيرفر يحسب سومة ولايتو،
 * والفرق يبان في وجه المُوصّل.
 *
 * مشترك بين البناء (scripts/build.mjs) وخادم التجريب
 * (scripts/dev-server.mjs) باش الزوج يعرضو نفس الأرقام.
 */
import { ratesScriptTag, RATES_SCRIPT_ID } from '../lib/shipping-rates.mjs';

export function injectShippingRates(html) {
  /* محقون من قبل (بناء مرّتين) — ما نزيدوش نسخة ثانية */
  if (html.includes(`id="${RATES_SCRIPT_ID}"`)) return html;
  if (!html.includes('</body>')) return html + ratesScriptTag();
  return html.replace('</body>', `${ratesScriptTag()}\n</body>`);
}
