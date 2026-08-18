import { esc } from '../dom.js';
import { t } from '../i18n.js';
import { icon } from './icon.js';
import { stateBlock } from './state-block.js';

function alignClass(col) {
  if (col.align === 'end' || col.numeric) return ' is-num';
  if (col.align === 'center') return ' is-center';
  return '';
}

function headCell(col, sort, onSortAct) {
  var label = esc(col.label == null ? '' : col.label);
  var cls = alignClass(col).trim();

  if (!col.sortable || !onSortAct) {
    return '<th scope="col"' + (cls ? ' class="' + cls + '"' : '') + '>' + label + '</th>';
  }

  var active = sort && sort.key === col.key;
  var dir = active && sort.dir === 'asc' ? 'desc' : 'asc';
  var ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  var iconName = active ? (sort.dir === 'asc' ? 'sort-asc' : 'sort-desc') : 'sort';

  return '<th scope="col" class="is-sortable' + alignClass(col) + '" aria-sort="' + ariaSort + '">' +
    '<button type="button" data-act="' + esc(onSortAct) + '"' +
      ' data-sort-key="' + esc(col.key) + '" data-sort-dir="' + dir + '"' +
      ' title="' + esc(t(dir === 'asc' ? 'table.sortAsc' : 'table.sortDesc')) + '">' +
      '<span>' + label + '</span>' + icon(iconName, 'data-table__sort-ico') +
    '</button>' +
  '</th>';
}

export function dataTable(opts) {
  opts = opts || {};
  var columns = opts.columns || [];
  var rows = opts.rows || [];

  if (!rows.length) {
    return stateBlock(opts.empty || { variant: 'empty', title: t('state.emptyTitle') });
  }

  var head = columns.map(function (col) { return headCell(col, opts.sort, opts.onSortAct); }).join('');

  var body = rows.map(function (row, index) {
    return '<tr>' + columns.map(function (col) {
      var cls = alignClass(col).trim();
      var html = typeof col.render === 'function'
        ? col.render(row, index)
        : esc(row[col.key] == null ? '' : row[col.key]);
      return '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + html + '</td>';
    }).join('') + '</tr>';
  }).join('');

  return '<div class="table-wrap' + (opts.tall ? ' table-wrap--tall' : '') + '">' +
    '<table class="data-table">' +
      '<thead><tr>' + head + '</tr></thead>' +
      '<tbody>' + body + '</tbody>' +
    '</table>' +
  '</div>';
}
