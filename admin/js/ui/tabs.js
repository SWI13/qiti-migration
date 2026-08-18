import { esc } from '../dom.js';
import { icon } from './icon.js';

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
      ' tabindex="0"' + (on ? '' : ' hidden') + '>' +
      (tab.panel || '') +
    '</div>';
  }).join('');

  return '<div class="tabs" data-tabs="' + esc(id) + '">' +
    '<div class="tabs__list" role="tablist">' + list + '</div>' +
    panels +
  '</div>';
}

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
