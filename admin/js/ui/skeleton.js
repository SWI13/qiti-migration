/* ==========================================================================
   Qiti admin — هياكل التحميل
   بدل السطر الجامد "راهي تحمّل…"، نبيّنو شكل الصفحة اللي جاية (سكيلتون)
   باش العين تحسّها أسرع حتى لو نفس الوقت الحقيقي. shimmer يتوقف تحت
   prefers-reduced-motion (شوف css/components.css).
   ========================================================================== */

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
  var lines = function (n) {
    var out = '';
    for (var i = 0; i < n; i++) out += '<div class="sk sk--line" style="width:' + (50 + (i % 3) * 15) + '%"></div>';
    return out;
  };
  return '<div class="editor-split">' +
    '<div class="editor-form">' +
      '<div class="admin-card" style="padding:18px;margin-bottom:16px">' + lines(3) + '</div>' +
      '<div class="admin-card" style="padding:18px;margin-bottom:16px">' + lines(5) + '</div>' +
      '<div class="admin-card" style="padding:18px">' + lines(4) + '</div>' +
    '</div>' +
    '<div class="preview-panel"><div class="sk sk--card"></div></div>' +
  '</div>';
}
