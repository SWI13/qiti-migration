import { state } from '../state.js';
import { esc } from '../dom.js';
import { t } from '../i18n.js';
import { icon } from './icon.js';

export var NAV = [
  { view: 'dashboard', group: null, label: 'nav.dashboard', icon: 'dashboard' },
  /* الصفّ فوق الطلبات قصداً: هذي البلاصة اللي تخدم منها كل صباح،
     ولائحة الطلبات هي الأرشيف اللي تعاود ليه كي تحتاج */
  { view: 'queue', group: null, label: 'nav.queue', icon: 'queue', badge: 'queueDue' },
  { view: 'orders', group: null, label: 'nav.orders', icon: 'orders', badge: 'pendingOrders' },
  { view: 'campaigns', group: 'content', label: 'nav.campaigns', icon: 'campaigns' },
  { view: 'media', group: 'content', label: 'nav.media', icon: 'media' },
  { view: 'products', group: 'store', label: 'nav.products', icon: 'products' },
  { view: 'categories', group: 'store', label: 'nav.categories', icon: 'categories' },
  /* السجلّ آخر واحد: ما تمشيش ليه كل يوم، تمشي ليه كي تسأل
     "شكون دار هذي؟" — فما يستاهلش يكون فوق الشغل اليومي */
  { view: 'logs', group: 'store', label: 'nav.logs', icon: 'logs' },
];

var GROUPS = [
  { key: null, label: null },
  { key: 'content', label: 'nav.group.content' },
  { key: 'store', label: 'nav.group.store' },
];

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
          icon(item.icon, 'nav-link__icon') +
          '<span class="nav-link__text sidebar-label">' + esc(t(item.label)) + '</span>' +
          (count > 0 ? '<span class="nav-link__badge sidebar-label">' + (count > 99 ? '99+' : count) + '</span>' : '') +
        '</a>';
      }).join('') +
    '</div>';
  }).join('');
}

export function shell(title, actions, body) {
  var collapsed = localStorage.getItem('qiti-admin-collapsed') === '1';
  var collapseLabel = t(collapsed ? 'nav.expand' : 'nav.collapse');

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
        '<button type="button" class="admin__collapse-toggle admin__theme-toggle" data-act="toggle-theme" aria-label="' + esc(t('nav.themeToggle')) + '">' +
          icon('moon', 'theme-ico theme-ico--to-dark') +
          icon('sun', 'theme-ico theme-ico--to-light') +
          '<span class="sidebar-label">' +
            '<span class="theme-swap--to-dark">' + esc(t('nav.themeDark')) + '</span>' +
            '<span class="theme-swap--to-light">' + esc(t('nav.themeLight')) + '</span>' +
          '</span>' +
        '</button>' +
        '<button type="button" class="admin__collapse-toggle" data-act="toggle-nav-collapsed" aria-label="' + esc(collapseLabel) + '">' +
          icon('sidebar') +
          '<span class="sidebar-label">' + esc(collapseLabel) + '</span>' +
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
