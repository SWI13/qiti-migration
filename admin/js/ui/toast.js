import { t } from '../i18n.js';
import { icon } from './icon.js';

var DURATION = { success: 3200, info: 4000, error: 5600 };
var ICONS = { success: 'check', info: 'info', error: 'alert' };

function stackEl() {
  var node = document.querySelector('.toast-stack');
  if (!node) {
    node = document.createElement('div');
    node.className = 'toast-stack';
    node.setAttribute('aria-live', 'polite');
    node.setAttribute('aria-atomic', 'false');
    document.body.appendChild(node);
  }
  return node;
}

export function showToast(opts) {
  opts = opts || {};
  var variant = ICONS[opts.variant] ? opts.variant : 'success';
  var total = opts.duration == null ? DURATION[variant] : Number(opts.duration);

  var node = document.createElement('div');
  node.className = 'toast toast--' + variant;
  if (variant === 'error') node.setAttribute('role', 'alert');
  node.innerHTML =
    icon(ICONS[variant], 'toast__icon') +
    '<div class="toast__body">' +
      (opts.title ? '<div class="toast__title"></div>' : '') +
      '<div class="toast__msg"></div>' +
    '</div>' +
    '<button type="button" class="toast__close" data-toast-close>' + icon('close') + '</button>';

  if (opts.title) node.querySelector('.toast__title').textContent = opts.title;
  node.querySelector('.toast__msg').textContent = opts.message == null ? '' : opts.message;
  node.querySelector('.toast__close').setAttribute('aria-label', t('toast.dismiss'));

  stackEl().appendChild(node);

  requestAnimationFrame(function () { node.classList.add('is-visible'); });

  var timer = null;
  var startedAt = 0;
  var left = total;
  var closed = false;

  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    node.classList.remove('is-visible');
    setTimeout(function () { node.remove(); }, 220);
  }

  function resume() {
    if (!left || closed) return;
    startedAt = Date.now();
    timer = setTimeout(close, left);
  }

  function pause() {
    if (!left || closed) return;
    clearTimeout(timer);
    left -= Date.now() - startedAt;
    if (left < 400) left = 400;
  }

  node.addEventListener('mouseenter', pause);
  node.addEventListener('mouseleave', resume);
  node.addEventListener('focusin', pause);
  node.addEventListener('focusout', resume);
  node.addEventListener('click', function (event) {
    if (event.target.closest('[data-toast-close]')) close();
  });

  resume();
  return close;
}
