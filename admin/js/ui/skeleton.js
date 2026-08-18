
function lines(n) {
  var out = '';
  for (var i = 0; i < n; i++) {
    out += '<div class="sk sk--line" style="width:' + (50 + (i % 3) * 15) + '%"></div>';
  }
  return out;
}

export function skeletonList(rows) {
  rows = rows || 5;
  var out = '';
  for (var i = 0; i < rows; i++) out += '<div class="sk sk--row"></div>';
  return '<div class="admin-card"><div class="row-list">' + out + '</div></div>';
}

export function skeletonDashboard() {
  var kpis = '';
  for (var i = 0; i < 4; i++) kpis += '<div class="sk sk--card"></div>';
  return '<div class="kpi-grid" style="margin-bottom:14px">' + kpis + '</div>' +
    '<div class="dash-grid">' +
      '<div class="sk sk--card" style="height:220px"></div>' +
      '<div class="sk sk--card" style="height:220px"></div>' +
    '</div>';
}

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

export function skeletonGrid(items) {
  items = items || 8;
  var out = '';
  for (var i = 0; i < items; i++) out += '<div class="sk sk--tile"></div>';
  return '<div class="media-grid">' + out + '</div>';
}
