import { esc } from '../dom.js';
import { t } from '../i18n.js';
import { icon } from './icon.js';

var VARIANT_ICON = { empty: 'empty', error: 'error' };

function actionHtml(label, href, act, id, className) {
  if (!label) return '';
  var classes = 'btn btn--xs state__action ' + className;
  if (href) {
    return '<a class="' + classes + '" href="' + esc(href) + '">' + esc(label) + '</a>';
  }
  if (act) {
    return '<button type="button" class="' + classes + '" data-act="' + esc(act) + '"' +
      (id != null ? ' data-id="' + esc(id) + '"' : '') + '>' + esc(label) + '</button>';
  }
  return '';
}

export function stateBlock(opts) {
  opts = opts || {};
  var variant = opts.variant || 'empty';
  var loading = variant === 'loading';
  var title = opts.title || (loading ? t('state.loading') : '');

  var primary = actionHtml(opts.actionLabel, opts.actionHref, opts.actionAct, opts.actionId, 'btn--primary');
  var secondary = actionHtml(opts.secondaryLabel, opts.secondaryHref, opts.secondaryAct, opts.secondaryId, 'btn--outline');
  var actions = (primary || secondary) ? '<div class="state__actions">' + primary + secondary + '</div>' : '';

  return '<div class="state state--' + esc(variant) + '"' + (loading ? ' role="status"' : '') + '>' +
    (loading ? '<div class="state__spinner"></div>' : icon(VARIANT_ICON[variant] || 'empty', 'state__icon')) +
    '<div class="state__title">' + esc(title) + '</div>' +
    (opts.body ? '<div class="state__body">' + esc(opts.body) + '</div>' : '') +
    actions +
  '</div>';
}
