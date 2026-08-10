/* ==========================================================================
   Qiti admin — الهيكل العام (شريط جانبي + هيدر)
   NAV تسكن هنا ماشي في router.js: router.js يستورد الصفحات (pages/*)
   وpages/* يستوردو shell() — لو NAV كانت في router.js، shell.js يلزمها
   تستورد من router.js وندورو في حلقة (router → pages → shell → router).
   router.js يعيد تصديرها (`export { NAV }`) باش تبقى ملقاة من بلاصة
   وحدة منطقياً، بصح المصدر الحقيقي هنا.
   ========================================================================== */
import { state } from '../state.js';
import { esc } from '../dom.js';
import { t } from '../i18n.js';

export var NAV = [
  { view: 'dashboard', group: null, label: 'nav.dashboard', icon: 'dashboard' },
  { view: 'orders', group: null, label: 'nav.orders', icon: 'orders', badge: 'pendingOrders' },
  { view: 'campaigns', group: 'content', label: 'nav.campaigns', icon: 'campaigns' },
  { view: 'media', group: 'content', label: 'nav.media', icon: 'media' },
  { view: 'products', group: 'store', label: 'nav.products', icon: 'products' },
  { view: 'categories', group: 'store', label: 'nav.categories', icon: 'categories' },
];

var GROUPS = [
  { key: null, label: null },
  { key: 'content', label: 'nav.group.content' },
  { key: 'store', label: 'nav.group.store' },
];

/* أيقونات خط (نفس روح .ico في styles.css) — كل صفحة عندها شكل مميّز
   بدل المربّع الموحّد القديم، تفرّق بالعين بلا ما تقرا النص. */
var ICON_PATHS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  orders: '<path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.8h7.2a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>',
  campaigns: '<path d="M3 10v4a1 1 0 0 0 1 1h2l7 4V5L6 9H4a1 1 0 0 0-1 1Z"/><path d="M17.5 8.5a4 4 0 0 1 0 7"/>',
  media: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5.5-5.5L11 15l-2.5-2.5L3 18"/>',
  products: '<path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  categories: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
};

function navIcon(name) {
  return '<svg class="ico nav-link__icon" viewBox="0 0 24 24" aria-hidden="true">' + (ICON_PATHS[name] || '') + '</svg>';
}

function navHtml() {
  return GROUPS.map(function (group) {
    var items = NAV.filter(function (item) { return item.group === group.key; });
    if (!items.length) return '';
    return '<div class="nav-group">' +
      (group.label ? '<div class="nav-group__label sidebar-label">' + esc(t(group.label)) + '</div>' : '') +
      items.map(function (item) {
        var count = item.badge ? Number(state[item.badge] || 0) : 0;
        return '<a class="nav-link' + (state.view === item.view ? ' is-active' : '') +
          '" href="#/' + item.view + '">' +
          navIcon(item.icon) +
          '<span class="nav-link__text sidebar-label">' + esc(t(item.label)) + '</span>' +
          (count > 0 ? '<span class="nav-link__badge sidebar-label">' + (count > 99 ? '99+' : count) + '</span>' : '') +
        '</a>';
      }).join('') +
    '</div>';
  }).join('');
}

export function shell(title, actions, body) {
  return '<button type="button" class="admin__nav-toggle" data-act="toggle-nav" aria-label="' + esc(t('nav.toggle')) + '" aria-expanded="false">' +
      '<span class="admin__nav-toggle-bar"></span><span class="admin__nav-toggle-bar"></span><span class="admin__nav-toggle-bar"></span>' +
    '</button>' +
    '<div class="admin__scrim" data-act="close-nav"></div>' +
    '<aside class="admin__sidebar">' +
      '<div class="admin__brand">' +
        '<span>' + esc(t('nav.brand')) + '</span>' +
        '<span class="admin__brand-suffix sidebar-label">' + esc(t('nav.brandSuffix')) + '</span>' +
      '</div>' +
      '<nav class="admin__nav">' + navHtml() + '</nav>' +
      '<div class="admin__sidebar-foot">' +
        '<button type="button" class="admin__collapse-toggle" data-act="toggle-nav-collapsed" aria-label="' + esc(t('nav.collapse')) + '">' +
          '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v16"/><path d="m15 8-4 4 4 4"/><rect x="3" y="4" width="18" height="16" rx="2"/></svg>' +
          '<span class="sidebar-label">' + esc(t('nav.collapse')) + '</span>' +
        '</button>' +
        '<button class="btn btn--outline btn--xs" data-act="logout">' + esc(t('nav.logout')) + '</button>' +
      '</div>' +
    '</aside>' +
    '<main class="admin__main">' +
      '<header class="admin__header">' +
        '<h1 class="admin__title">' + esc(title) + '</h1>' +
        '<div class="admin__actions">' + (actions || '') + '</div>' +
      '</header>' +
      body +
    '</main>';
}
