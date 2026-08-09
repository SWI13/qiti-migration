/* ==========================================================================
   Qiti admin — i18n خفيف
   ماشي framework i18n كامل — قاموس مسطّح + استبدال {var}. تاجر وحيد،
   لغة وحدة (إنجليزية) لشاسي اللوحة. مفتاح ناقص يرجع كيما هو (ماشي
   نص افتراضي، ماشي فارغ) باش الثقب يبان واضح بالعين وقت التطوير.
   ========================================================================== */
import { STRINGS_EN } from './strings.en.js';

export function t(key, vars) {
  var str = STRINGS_EN[key];
  if (str == null) return key;
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, function (match, name) {
    return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match;
  });
}
