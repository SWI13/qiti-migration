/* ==========================================================================
   Qiti admin — بلوك حالة (فارغ/خطأ)
   بديل emptyState(message) القديم — أيقونة + عنوان + شرح + زر اختياري،
   بدل سطر نص جامد. نفس البلوك يخدم للفارغ وللخطأ (variant يبدّل اللون).
   ========================================================================== */
import { esc } from '../dom.js';

var ICON_PATHS = {
  empty: '<path d="M3 7l9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  error: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v5"/><path d="M12 17h.01"/>',
};

/**
 * stateBlock({ variant, title, body, actionLabel, actionHref, actionAct, actionId })
 * variant: 'empty' | 'error' — يحدّد الأيقونة واللون.
 */
export function stateBlock(opts) {
  opts = opts || {};
  var variant = opts.variant || 'empty';
  var path = ICON_PATHS[variant] || ICON_PATHS.empty;

  var action = '';
  if (opts.actionHref) {
    action = '<a class="btn btn--primary btn--xs state__action" href="' + esc(opts.actionHref) + '">' + esc(opts.actionLabel) + '</a>';
  } else if (opts.actionAct) {
    action = '<button type="button" class="btn btn--primary btn--xs state__action" data-act="' + esc(opts.actionAct) + '"' +
      (opts.actionId != null ? ' data-id="' + esc(opts.actionId) + '"' : '') + '>' + esc(opts.actionLabel) + '</button>';
  }

  return '<div class="state state--' + esc(variant) + '">' +
    '<svg class="ico state__icon" viewBox="0 0 24 24">' + path + '</svg>' +
    '<div class="state__title">' + esc(opts.title || '') + '</div>' +
    (opts.body ? '<div class="state__body">' + esc(opts.body) + '</div>' : '') +
    action +
  '</div>';
}
