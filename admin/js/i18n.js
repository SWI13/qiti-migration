/* ==========================================================================
   Qiti admin — i18n خفيف
   ماشي framework i18n كامل — قاموس مسطّح + استبدال {var}. تاجر وحيد،
   لغة وحدة (إنجليزية) لشاسي اللوحة. مفتاح ناقص يرجع كيما هو (ماشي
   نص افتراضي، ماشي فارغ) باش الثقب يبان واضح بالعين وقت التطوير.

   القاموس مقسّم على js/strings/*.en.js حسب الصفحة. علاش: قاموس واحد
   مسطّح كان يولّي بلاصة تصادم كي أكثر من واحد يخدم في نفس الوقت — كل
   واحد يزيد مفتاح في آخر نفس الملف. دروك كل صفحة عندها ملفها.

   ⚠️ زيد ملف جديد؟ لازم تزيدو في import وفي Object.assign تحت — بلا
   هذا مفاتيحو يرجعو كيما هوما.
   ========================================================================== */
import { COMMON_EN } from './strings/common.en.js';
import { NAV_EN } from './strings/nav.en.js';
import { LOGIN_EN } from './strings/login.en.js';
import { CAMPAIGNS_EN } from './strings/campaigns.en.js';
import { PRODUCTS_EN } from './strings/products.en.js';
import { CATEGORIES_EN } from './strings/categories.en.js';
import { MEDIA_EN } from './strings/media.en.js';
import { ORDERS_EN } from './strings/orders.en.js';
import { DASHBOARD_EN } from './strings/dashboard.en.js';
import { STATE_EN } from './strings/state.en.js';

/* الترتيب ما عندوش معنى — المفاتيح كلها بسابقة مختلفة، فما ثمّاش
   تغطية بين الملفات. لو صار تصادم بالغلط، الأخير يغلب. */
var STRINGS_EN = Object.assign(
  {},
  COMMON_EN, NAV_EN, LOGIN_EN,
  CAMPAIGNS_EN, PRODUCTS_EN, CATEGORIES_EN, MEDIA_EN,
  ORDERS_EN, DASHBOARD_EN, STATE_EN,
);

export function t(key, vars) {
  var str = STRINGS_EN[key];
  if (str == null) return key;
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, function (match, name) {
    return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match;
  });
}
