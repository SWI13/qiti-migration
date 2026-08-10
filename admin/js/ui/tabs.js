/* ==========================================================================
   Qiti admin — تبويبات
   الاثنين مع بعض (القائمة + الألواح) في مناداة وحدة قصدًا: التبويب
   الصحيح يحتاج id يربط الزر باللوح (aria-controls/aria-labelledby)، ولو
   خلّينا الطالب يبني الألواح بيدو، الربط هذاك ينكسر أوّل مرّة واحد ينسى
   سابقة الـ id. هنا نضمنوه.

   نموذج الكيبورد (WAI-ARIA): سهم يمين/يسار يتنقّل بين التبويبات،
   Home/End للأوّل/الأخير، وTab وحدو يخرج من القائمة لمحتوى اللوح —
   ولهذا التبويب غير المختار عندو tabindex="-1".
   ========================================================================== */
import { esc } from '../dom.js';
import { icon } from './icon.js';

/**
 * tabsHtml({ id, tabs, active }) → HTML
 *   id:     سابقة فريدة في الصفحة (مثلاً 'prodTabs')
 *   tabs:   [{ key, label, icon, panel }] — panel هو HTML اللوح (اختياري)
 *   active: key تاع التبويب المفتوح؛ إذا ما كانش، الأوّل
 */
export function tabsHtml(opts) {
  opts = opts || {};
  var id = opts.id || 'tabs';
  var tabs = opts.tabs || [];
  if (!tabs.length) return '';

  var activeKey = opts.active;
  var known = tabs.filter(function (tab) { return tab.key === activeKey; }).length;
  if (!known) activeKey = tabs[0].key;

  var list = tabs.map(function (tab) {
    var on = tab.key === activeKey;
    return '<button type="button" class="tabs__tab" role="tab"' +
      ' id="' + esc(id) + '-tab-' + esc(tab.key) + '"' +
      ' aria-controls="' + esc(id) + '-panel-' + esc(tab.key) + '"' +
      ' aria-selected="' + (on ? 'true' : 'false') + '"' +
      ' tabindex="' + (on ? '0' : '-1') + '"' +
      ' data-tab="' + esc(tab.key) + '">' +
      (tab.icon ? icon(tab.icon) : '') +
      '<span>' + esc(tab.label) + '</span>' +
    '</button>';
  }).join('');

  var panels = tabs.map(function (tab) {
    var on = tab.key === activeKey;
    return '<div class="tabs__panel" role="tabpanel"' +
      ' id="' + esc(id) + '-panel-' + esc(tab.key) + '"' +
      ' aria-labelledby="' + esc(id) + '-tab-' + esc(tab.key) + '"' +
      ' data-tab-panel="' + esc(tab.key) + '"' +
      /* tabindex=0 على اللوح: إذا ما فيهش عنصر قابل للفوكس، اللي يخدم
         بالكيبورد ما عندو وين يروح بعد التبويب */
      ' tabindex="0"' + (on ? '' : ' hidden') + '>' +
      (tab.panel || '') +
    '</div>';
  }).join('');

  return '<div class="tabs" data-tabs="' + esc(id) + '">' +
    '<div class="tabs__list" role="tablist">' + list + '</div>' +
    panels +
  '</div>';
}

/** يبدّل الحالة على DOM موجود — يستعملها الضغط والسهم الزوج */
function activate(root, key, focus) {
  var tabsEls = root.querySelectorAll('[data-tab]');
  Array.prototype.forEach.call(tabsEls, function (btn) {
    var on = btn.getAttribute('data-tab') === key;
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
    btn.tabIndex = on ? 0 : -1;
    if (on && focus) btn.focus();
  });
  Array.prototype.forEach.call(root.querySelectorAll('[data-tab-panel]'), function (panel) {
    panel.hidden = panel.getAttribute('data-tab-panel') !== key;
  });
}

/**
 * bindTabs(rootEl, onChange)
 * يوصّل كل .tabs اللي جوّا rootEl. onChange(key, tabsId) اختيارية —
 * تتنادى بعد ما التبديل يصير (يعني الـ DOM ولّى صحيح).
 * ⚠️ لازم تتنادى بعد كل رندر يعاود يبني الـ HTML (innerHTML يمسح
 * المستمعين) — نفس نمط bindThemeContrast في pages/campaigns.js.
 */
export function bindTabs(rootEl, onChange) {
  if (!rootEl) return;
  Array.prototype.forEach.call(rootEl.querySelectorAll('.tabs'), function (root) {
    var list = root.querySelector('.tabs__list');
    if (!list) return;

    function change(key, focus) {
      activate(root, key, focus);
      if (onChange) onChange(key, root.getAttribute('data-tabs'));
    }

    list.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-tab]');
      if (btn) change(btn.getAttribute('data-tab'), false);
    });

    list.addEventListener('keydown', function (event) {
      var keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
      if (keys.indexOf(event.key) === -1) return;
      var btns = Array.prototype.slice.call(root.querySelectorAll('[data-tab]'));
      var at = btns.indexOf(event.target.closest('[data-tab]'));
      if (at === -1) return;
      event.preventDefault();

      var next = at;
      if (event.key === 'ArrowRight') next = (at + 1) % btns.length;
      else if (event.key === 'ArrowLeft') next = (at - 1 + btns.length) % btns.length;
      else if (event.key === 'Home') next = 0;
      else next = btns.length - 1;

      change(btns[next].getAttribute('data-tab'), true);
    });
  });
}
