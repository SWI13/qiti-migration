import { esc } from '../dom.js';
import { t } from '../i18n.js';
import { icon } from './icon.js';

var seq = 0;

function itemHtml(item) {
  if (item.sep) return '<div class="menu__sep" role="separator"></div>';

  var cls = 'menu__item' + (item.danger ? ' menu__item--danger' : '');
  var inner = (item.icon ? icon(item.icon) : '') + '<span>' + esc(item.label) + '</span>';

  if (item.href) {
    return '<a class="' + cls + '" role="menuitem" href="' + esc(item.href) + '"' +
      (item.external ? ' target="_blank" rel="noopener"' : '') + '>' + inner + '</a>';
  }
  return '<button type="button" class="' + cls + '" role="menuitem"' +
    ' data-act="' + esc(item.act) + '"' +
    (item.id != null ? ' data-id="' + esc(item.id) + '"' : '') +
    '>' + inner + '</button>';
}

export function menuHtml(opts) {
  opts = opts || {};
  var id = opts.id || ('qmenu' + (++seq));
  var label = opts.label || t('common.more');
  var items = (opts.items || []).map(itemHtml).join('');

  return '<div class="menu" data-menu="' + esc(id) + '">' +
    '<button type="button" class="' + esc(opts.btnClass || 'mini-btn') + ' menu__btn"' +
      ' data-menu-btn aria-haspopup="menu" aria-expanded="false"' +
      ' aria-controls="' + esc(id) + '-popup" aria-label="' + esc(label) + '">' +
      icon(opts.btnIcon || 'more') +
    '</button>' +
    '<div class="menu__popup" id="' + esc(id) + '-popup" role="menu" aria-label="' + esc(label) + '">' +
      items +
    '</div>' +
  '</div>';
}

function closeAll(except) {
  Array.prototype.forEach.call(document.querySelectorAll('.menu.is-open'), function (menu) {
    if (menu === except) return;
    menu.classList.remove('is-open');
    unplace(menu);
    var btn = menu.querySelector('[data-menu-btn]');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
}

function itemsOf(menu) {
  return Array.prototype.slice.call(menu.querySelectorAll('.menu__item'));
}

var GAP = 6;
var EDGE = 8;

function place(menu) {
  var btn = menu.querySelector('[data-menu-btn]');
  var popup = menu.querySelector('.menu__popup');
  if (!btn || !popup) return;

  popup.style.position = 'fixed';
  popup.style.top = '0px';
  popup.style.left = '0px';

  var rect = btn.getBoundingClientRect();
  var width = popup.offsetWidth;
  var height = popup.offsetHeight;

  var roomBelow = window.innerHeight - rect.bottom;
  var top = (roomBelow >= height + GAP || rect.top < height + GAP)
    ? rect.bottom + GAP
    : rect.top - height - GAP;

  var left = Math.min(
    Math.max(EDGE, rect.right - width),
    Math.max(EDGE, window.innerWidth - width - EDGE),
  );

  popup.style.top = Math.max(EDGE, top) + 'px';
  popup.style.left = left + 'px';
}

function unplace(menu) {
  var popup = menu.querySelector('.menu__popup');
  if (!popup) return;
  popup.style.position = '';
  popup.style.top = '';
  popup.style.left = '';
}

document.addEventListener('click', function (event) {
  var btn = event.target.closest('[data-menu-btn]');
  if (btn) {
    var menu = btn.closest('.menu');
    var opening = !menu.classList.contains('is-open');
    closeAll(menu);
    menu.classList.toggle('is-open', opening);
    btn.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (opening) {
      place(menu);
      var first = itemsOf(menu)[0];
      if (first) first.focus();
    } else {
      unplace(menu);
    }
    return;
  }
  closeAll(null);
});

document.addEventListener('keydown', function (event) {
  var menu = document.querySelector('.menu.is-open');
  if (!menu) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    closeAll(null);
    var btn = menu.querySelector('[data-menu-btn]');
    if (btn) btn.focus();
    return;
  }

  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  var items = itemsOf(menu);
  if (!items.length) return;
  event.preventDefault();
  var at = items.indexOf(document.activeElement);
  var next = event.key === 'ArrowDown'
    ? (at + 1) % items.length
    : (at <= 0 ? items.length - 1 : at - 1);
  items[next].focus();
});

function closeOnShift() { closeAll(null); }
window.addEventListener('scroll', closeOnShift, true);
window.addEventListener('resize', closeOnShift);

document.addEventListener('focusin', function (event) {
  if (!document.querySelector('.menu.is-open')) return;
  if (event.target.closest('.menu.is-open')) return;
  closeAll(null);
});
