import { getPath } from '../dom.js';
import { t } from '../i18n.js';
import { icon } from './icon.js';
import { confirmDialog } from './dialog.js';

var SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isEmpty(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function checkOne(value, rule) {
  if (rule.required && isEmpty(value)) return rule.message || t('validation.required');
  if (isEmpty(value)) return null;

  if (rule.maxLength != null && String(value).length > rule.maxLength) {
    return rule.message || t('validation.maxLength', { max: rule.maxLength });
  }
  if (rule.positiveNumber && !(Number(value) > 0)) {
    return rule.message || t('validation.positiveNumber');
  }
  if (rule.min != null && !(Number(value) >= rule.min)) {
    return rule.message || t('validation.min', { min: rule.min });
  }
  if (rule.max != null && !(Number(value) <= rule.max)) {
    return rule.message || t('validation.max', { max: rule.max });
  }
  if (rule.slug && !SLUG_RE.test(String(value))) {
    return rule.message || t('validation.slug');
  }
  if (rule.pattern) {
    var re = rule.pattern instanceof RegExp ? rule.pattern : new RegExp(rule.pattern);
    if (!re.test(String(value))) return rule.message || t('validation.pattern');
  }
  return null;
}

export function validate(values, rules) {
  var errors = {};
  var ok = true;
  Object.keys(rules || {}).forEach(function (path) {
    var message = checkOne(getPath(values, path), rules[path] || {});
    if (message) { errors[path] = message; ok = false; }
  });
  return { ok: ok, errors: errors };
}

function fieldOf(input) {
  return input.closest('.field') || input.parentElement;
}

export function clearErrors(rootEl) {
  if (!rootEl) return;
  Array.prototype.forEach.call(rootEl.querySelectorAll('.field__error'), function (node) { node.remove(); });
  Array.prototype.forEach.call(rootEl.querySelectorAll('.field--invalid'), function (node) {
    node.classList.remove('field--invalid');
  });
  Array.prototype.forEach.call(rootEl.querySelectorAll('[aria-invalid="true"]'), function (node) {
    node.removeAttribute('aria-invalid');
    node.removeAttribute('aria-describedby');
  });
}

export function showErrors(rootEl, errors) {
  clearErrors(rootEl);
  if (!rootEl || !errors) return 0;

  var first = null;
  var marked = 0;

  Object.keys(errors).forEach(function (path) {
    var input = rootEl.querySelector('[data-path="' + path + '"]');
    if (!input) return;
    var field = fieldOf(input);
    if (!field) return;

    var errId = 'err_' + path.replace(/[^\w]/g, '_');
    field.classList.add('field--invalid');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errId);

    var note = document.createElement('div');
    note.className = 'field__error';
    note.id = errId;
    note.innerHTML = icon('alert') + '<span></span>';
    note.querySelector('span').textContent = errors[path];
    field.appendChild(note);

    marked++;
    if (!first) first = input;
  });

  if (first) {
    first.focus({ preventScroll: true });
    first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  return marked;
}

var cleanJson = null;
var readCurrent = null;

function snap(value) {
  try { return JSON.stringify(value); } catch (error) { return null; }
}

export function markClean(snapshot, getCurrent) {
  cleanJson = snap(snapshot);
  if (typeof getCurrent === 'function') readCurrent = getCurrent;
}

export function clearDirty() {
  cleanJson = null;
  readCurrent = null;
}

export function isDirty(current) {
  if (cleanJson == null) return false;
  var value = arguments.length ? current : (readCurrent ? readCurrent() : null);
  return snap(value) !== cleanJson;
}

export function confirmDiscard(current) {
  if (!(arguments.length ? isDirty(current) : isDirty())) return Promise.resolve(true);
  return confirmDialog({
    title: t('unsaved.title'),
    body: t('unsaved.body'),
    confirmLabel: t('unsaved.discard'),
    danger: true,
  });
}

window.addEventListener('beforeunload', function (event) {
  if (!readCurrent || !isDirty()) return;
  event.preventDefault();
  event.returnValue = '';
});
