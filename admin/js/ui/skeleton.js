/* ==========================================================================
   Qiti admin — هياكل التحميل
   بدل السطر الجامد "راهي تحمّل…"، نبيّنو شكل الصفحة اللي جاية (سكيلتون)
   باش العين تحسّها أسرع حتى لو نفس الوقت الحقيقي. shimmer يتوقف تحت
   prefers-reduced-motion (شوف css/components.css).

   القاعدة: لكل شكل عرض في اللوحة (قائمة، محرّر، لوحة قيادة، جدول،
   شبكة صور) سكيلتون يشبهو. سكيلتون ما يشبهش اللي جاي بعدو أسوأ من بلا
   والو — العين تتعوّد على تخطيط وهمي وتعاود تبحث بلاصتها كي يبدّل.
   ========================================================================== */

/** يرجّع n خطوط بعروض متفاوتة — سطر واحد ثابت العرض يبان جدول ماشي نص */
function lines(n) {
  var out = '';
  for (var i = 0; i < n; i++) {
    out += '<div class="sk sk--line" style="width:' + (50 + (i % 3) * 15) + '%"></div>';
  }
  return out;
}

/** صفحة قائمة (حملات/منتجات/فئات) — عدّة سطور فارغة على شكل صف حقيقي */
export function skeletonList(rows) {
  rows = rows || 5;
  var out = '';
  for (var i = 0; i < rows; i++) out += '<div class="sk sk--row"></div>';
  return '<div class="admin-card"><div class="row-list">' + out + '</div></div>';
}

/** لوحة القيادة — صف بطاقات أرقام + بزوج رسوم */
export function skeletonDashboard() {
  var kpis = '';
  for (var i = 0; i < 4; i++) kpis += '<div class="sk sk--card"></div>';
  return '<div class="kpi-grid" style="margin-bottom:14px">' + kpis + '</div>' +
    '<div class="dash-grid">' +
      '<div class="sk sk--card" style="height:220px"></div>' +
      '<div class="sk sk--card" style="height:220px"></div>' +
    '</div>';
}

/** صفحة محرّر (حملة/منتج) — عمود فورم (كروت بخطوط) + عمود معاينة (كارت كبير) */
export function skeletonEditor() {
  return '<div class="editor-split">' +
    '<div class="editor-form">' +
      '<div class="admin-card admin-card--form">' + lines(3) + '</div>' +
      '<div class="admin-card admin-card--form">' + lines(5) + '</div>' +
      '<div class="admin-card admin-card--form">' + lines(4) + '</div>' +
    '</div>' +
    '<div class="preview-panel"><div class="sk sk--card"></div></div>' +
  '</div>';
}

/**
 * skeletonTable(rows, cols) — جدول (مخزون، فاريانتات، أي .data-table).
 * نبنيو <table> حقيقي ماشي divs باش عرض الأعمدة يجي من نفس الحساب اللي
 * يجي منّو في الجدول الحقيقي — وإلا الصفحة تقفز كي تتعمّر.
 */
export function skeletonTable(rows, cols) {
  rows = rows || 4;
  cols = cols || 4;
  var head = '';
  var body = '';
  var c;
  for (c = 0; c < cols; c++) head += '<th><div class="sk sk--cell" style="width:60%"></div></th>';
  for (var r = 0; r < rows; r++) {
    var cells = '';
    for (c = 0; c < cols; c++) cells += '<td><div class="sk sk--cell" style="width:' + (c === 0 ? 80 : 55) + '%"></div></td>';
    body += '<tr>' + cells + '</tr>';
  }
  return '<div class="admin-card admin-card--form"><div class="table-wrap">' +
    '<table class="data-table"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>' +
  '</div></div>';
}

/** skeletonGrid(items) — شبكة صور (صفحة الميديا، نافذة الاختيار) */
export function skeletonGrid(items) {
  items = items || 8;
  var out = '';
  for (var i = 0; i < items; i++) out += '<div class="sk sk--tile"></div>';
  return '<div class="media-grid">' + out + '</div>';
}
