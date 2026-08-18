import { esc } from '../dom.js';
import { t } from '../i18n.js';
import { ICONS } from '../section-fields.js';
import { state } from '../state.js';

export function fieldHtml(def, value, path) {
  var id = 'f_' + path.replace(/\./g, '_');
  var hint = def.hint ? '<div class="hint">' + esc(def.hint) + '</div>' : '';

  if (def.type === 'bool') {
    return '<div class="field checkbox-row">' +
      '<input type="checkbox" id="' + id + '" data-path="' + esc(path) + '" data-kind="bool"' +
        (value ? ' checked' : '') + '>' +
      '<label for="' + id + '">' + esc(def.label) + '</label></div>';
  }

  var label = '<label for="' + id + '">' + esc(def.label) + '</label>';

  if (def.type === 'area') {
    return '<div class="field">' + label +
      '<textarea id="' + id + '" data-path="' + esc(path) + '" dir="auto">' + esc(value) + '</textarea>' + hint + '</div>';
  }

  if (def.type === 'number') {
    return '<div class="field">' + label +
      '<input type="number" id="' + id + '" data-path="' + esc(path) + '" data-kind="number" value="' +
      esc(value == null ? '' : value) + '">' + hint + '</div>';
  }

  if (def.type === 'lines') {
    var text = Array.isArray(value) ? value.join('\n') : '';
    return '<div class="field">' + label +
      '<textarea id="' + id + '" data-path="' + esc(path) + '" data-kind="lines" dir="auto">' + esc(text) + '</textarea>' +
      hint + '</div>';
  }

  if (def.type === 'icon') {
    return '<div class="field">' + label +
      '<select id="' + id + '" data-path="' + esc(path) + '">' +
        '<option value="">' + esc(t('common.none')) + '</option>' +
        ICONS.map(function (name) {
          return '<option value="' + name + '"' + (value === name ? ' selected' : '') + '>' + name + '</option>';
        }).join('') +
      '</select>' + hint + '</div>';
  }

  if (def.type === 'select') {
    return '<div class="field">' + label +
      '<select id="' + id + '" data-path="' + esc(path) + '">' +
        def.options.map(function (option) {
          return '<option dir="auto" value="' + esc(option.value) + '"' +
            (String(value) === String(option.value) ? ' selected' : '') + '>' + esc(option.label) + '</option>';
        }).join('') +
      '</select>' + hint + '</div>';
  }

  if (def.type === 'item') {
    var refs = [];
    (state.products || []).forEach(function (product) {
      var variants = product.variants && product.variants.length
        ? product.variants
        : [{ sku: 'default', options: {} }];
      variants.forEach(function (variant) {
        var names = Object.keys(variant.options || {}).map(function (key) {
          return variant.options[key];
        });
        refs.push({
          value: product.id + ':' + variant.sku,
          label: product.name + (names.length ? ' — ' + names.join(' / ') : ''),
        });
      });
    });

    return '<div class="field">' + label +
      '<select id="' + id + '" data-path="' + esc(path) + '">' +
        '<option value="">' + esc(t('common.none')) + '</option>' +
        refs.map(function (ref) {
          return '<option dir="auto" value="' + esc(ref.value) + '"' +
            (String(value) === ref.value ? ' selected' : '') + '>' + esc(ref.label) + '</option>';
        }).join('') +
      '</select>' + hint + '</div>';
  }

  if (def.type === 'image') {
    return '<div class="field">' + label +
      '<div class="image-field">' +
        '<img class="image-field__thumb" src="' + (value ? esc(value) : '') + '" alt="">' +
        '<input type="text" id="' + id + '" data-path="' + esc(path) + '" value="' + esc(value) + '" placeholder="/media/…">' +
        '<button type="button" class="btn btn--outline btn--xs" data-act="pick" data-path="' + esc(path) + '">' + esc(t('common.choose')) + '</button>' +
      '</div>' + hint + '</div>';
  }

  if (def.type === 'list') {
    var items = Array.isArray(value) ? value : [];
    return '<div class="field">' +
      '<div class="label">' + esc(def.label) + '</div>' +
      '<div class="group-list">' +
        items.map(function (item, index) {
          var itemPath = path + '.' + index;
          return '<div class="group-item">' +
            '<div class="group-item__head">' +
              '<button type="button" class="mini-btn" data-act="move" data-path="' + esc(path) + '" data-index="' + index + '" data-dir="-1" title="' + esc(t('common.moveUp')) + '">↑</button>' +
              '<button type="button" class="mini-btn" data-act="move" data-path="' + esc(path) + '" data-index="' + index + '" data-dir="1" title="' + esc(t('common.moveDown')) + '">↓</button>' +
              '<button type="button" class="mini-btn mini-btn--danger" data-act="del-item" data-path="' + esc(itemPath) + '" title="' + esc(t('common.delete')) + '">✕</button>' +
            '</div>' +
            def.fields.map(function (sub) {
              return fieldHtml(sub, (item || {})[sub.key], itemPath + '.' + sub.key);
            }).join('') +
          '</div>';
        }).join('') +
      '</div>' +
      '<button type="button" class="btn btn--outline btn--xs" data-act="add-item" data-path="' + esc(path) + '">' + esc(t('common.add')) + '</button>' +
      hint + '</div>';
  }

  if (def.type === 'readout') {
    return '<div class="field">' + label +
      '<output id="' + id + '" class="readout" data-readout="' + esc(def.key) + '">' + esc(value) + '</output>' +
      hint + '</div>';
  }

  return '<div class="field">' + label +
    '<input type="text" id="' + id + '" data-path="' + esc(path) + '" value="' + esc(value) + '" dir="auto">' + hint + '</div>';
}
