/* ==========================================================================
   Qiti admin — جدول بيانات
   راسم واحد لكل جدول في اللوحة (.data-table). يرجّع نص HTML — بلا
   state، بلا مستمعين: رأس الترتيب يخرج بـ data-act/data-sort-key،
   والمستمع المفوَّض الموجود في app.js هو اللي يلتقطو. نفس النمط تاع
   باقي اللوحة: البناء يعطي string، والتفاعل يمرّ على data-act.

   الموبايل: زحليق أفقي (شوف tokens.css على علاش ماشي صفوف مكدّسة).
   ========================================================================== */
import { esc } from '../dom.js';
import { t } from '../i18n.js';
import { icon } from './icon.js';
import { stateBlock } from './state-block.js';

/** صنف المحاذاة: numeric يعني رقم (يمين + أرقام بعرض واحد) */
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
  var dir = active && sort.dir === 'asc' ? 'desc' : 'asc';   // الضغطة الجاية تقلب
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

/**
 * dataTable({ columns, rows, sort, onSortAct, empty, tall }) → HTML
 *
 *   columns: [{
 *     key,        اسم الخاصية في الصف (وهو ثاني مفتاح الترتيب)
 *     label,      عنوان العمود (نص جاهز، متُرجم من الطالب)
 *     align,      'start' (افتراضي) | 'end' | 'center'
 *     numeric,    true = محاذاة يمين + أرقام بعرض ثابت (يغني على align)
 *     sortable,   true = الرأس يولّي زر
 *     render(row, index)   يرجّع HTML الخلية. ⚠️ الطالب مسؤول على
 *                 التهريب (esc) جوّاها. بلا render، القيمة تتقرا من
 *                 row[key] وتتهرّب هنا.
 *   }]
 *   rows:      مصفوفة كائنات
 *   sort:      { key, dir: 'asc' | 'desc' } — الحالة الحالية برك، الترتيب
 *              الفعلي يديرو الطالب على rows قبل ما يعيّط
 *   onSortAct: قيمة data-act اللي تخرج على رؤوس الترتيب (مثلاً 'sort-products')
 *   empty:     خيارات stateBlock كي rows تكون خاوية
 *   tall:      true = الغلاف يحدّد طولو ويولّي الرأس ملزوق
 */
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
