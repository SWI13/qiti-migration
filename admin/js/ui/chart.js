/* ==========================================================================
   Qiti admin — رسومات SVG يدوية (بلا مكتبة، بلا build step)
   ثلاث دوال صافية: تاخذ أرقام وترجّع HTML string جاهز للحقن. بلا state،
   بلا event listeners — لو الغلاف (dashboard.js) حاب تفاعل، يديره هو
   فوق النتيجة. viewBox ثابت (600×180 للعمودي، ارتفاع متغيّر للأفقي)
   باش preserveAspectRatio يقدر يكبّر وينقّص بلا ما يعوّج الخطوط.
   ========================================================================== */
import { esc } from '../dom.js';

var W = 600;
var H = 180;
var PAD_TOP = 10;
var PAD_BOTTOM = 24;   // مكان تسميات المحور السيني
var PAD_LEFT = 8;
var PAD_RIGHT = 8;
var PLOT_W = W - PAD_LEFT - PAD_RIGHT;
var PLOT_H = H - PAD_TOP - PAD_BOTTOM;

/** id فريد لكل gradient — تصادم اسمين فنفس الصفحة يخلّي وحدة تغلب البواقي كاملين */
function uid(prefix) {
  return (prefix || 'qc') + Math.random().toString(36).slice(2, 8);
}

/** أول/وسط/آخر برك — الشاشة صغيرة (موبايل)، حشو 30 تسمية يخليها ما تتقراش */
function axisIndexes(n) {
  if (n <= 1) return [0];
  if (n === 2) return [0, 1];
  return [0, Math.round((n - 1) / 2), n - 1];
}

function gridlinesSvg() {
  var html = '';
  for (var i = 0; i < 4; i++) {
    var y = PAD_TOP + PLOT_H * (i / 3);
    html += '<line x1="' + PAD_LEFT + '" y1="' + y.toFixed(2) + '" x2="' + (W - PAD_RIGHT) + '" y2="' + y.toFixed(2) +
      '" stroke="var(--border)" stroke-width="1" vector-effect="non-scaling-stroke"/>';
  }
  return html;
}

function xLabelsSvg(labels, xAt) {
  var idxs = axisIndexes(labels.length);
  return idxs.map(function (idx, k) {
    var anchor = k === 0 ? 'start' : (k === idxs.length - 1 ? 'end' : 'middle');
    return '<text x="' + xAt(idx).toFixed(2) + '" y="' + (H - 6) + '" text-anchor="' + anchor +
      '" font-size="10" fill="var(--text-faint)">' + esc(labels[idx] != null ? labels[idx] : '') + '</text>';
  }).join('');
}

/** الغلاف المشترك: dir=ltr مثبّتة (محور الوقت ما يتقلبش حتى لو الأدمن صار RTL) */
function wrapSvg(inner, viewBox, ariaLabel) {
  return '<div class="chart-wrap" style="direction:ltr">' +
    '<svg viewBox="' + viewBox + '" style="width:100%;height:auto" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + esc(ariaLabel || '') + '">' +
      '<title>' + esc(ariaLabel || '') + '</title>' +
      inner +
    '</svg>' +
  '</div>';
}

/** كلشي صفر أو مصفوفة خاوية → ماشي شارت، الطالب (caller) يبان له empty state روحو */
function allZero(values) {
  return !values.length || values.every(function (v) { return v === 0; });
}

/**
 * areaChart({ series, labels, format, ariaLabel })
 * series: [{ values: number[], tone: 'accent' | 'muted' }] — أول عنصر فالمصفوفة
 * هو المقدّمة (فوق بصريًا)، وباش يغلب البواقي لازم يترسم آخر حاجة فالـ DOM.
 */
export function areaChart(opts) {
  opts = opts || {};
  var series = opts.series || [];
  var labels = opts.labels || [];
  var format = typeof opts.format === 'function' ? opts.format : function (v) { return String(v); };
  var ariaLabel = opts.ariaLabel || '';

  if (!series.length) return '';
  var n = (series[0].values || []).length;
  if (!n) return '';
  var everySeriesZero = series.every(function (s) { return allZero(s.values || []); });
  if (everySeriesZero) return '';

  var allValues = [];
  series.forEach(function (s) { allValues = allValues.concat(s.values); });
  var min = Math.min.apply(null, allValues);
  var max = Math.max.apply(null, allValues);

  function xAt(i) { return n > 1 ? PAD_LEFT + i * (PLOT_W / (n - 1)) : PAD_LEFT + PLOT_W / 2; }
  function yAt(v) {
    if (max === min) return PAD_TOP + PLOT_H / 2;
    return PAD_TOP + PLOT_H - ((v - min) / (max - min)) * PLOT_H;
  }

  var defsHtml = '';
  var seriesHtml = '';
  /* نلوّح من آخر سلسلة للأولى: أول عنصر (index 0) لازم يطلع آخر شي فالـ
     DOM باش يترسم فوق البواقي بصريًا — هو المقدّمة، شوف توصيف الدالة */
  for (var si = series.length - 1; si >= 0; si--) {
    var s = series[si];
    var values = s.values || [];
    var color = s.tone === 'accent' ? 'var(--accent)' : 'var(--text-faint)';
    var gid = uid('qg');

    var linePath = values.map(function (v, i) {
      return (i === 0 ? 'M' : 'L') + xAt(i).toFixed(2) + ',' + yAt(v).toFixed(2);
    }).join(' ');
    var areaPath = linePath +
      ' L' + xAt(n - 1).toFixed(2) + ',' + (PAD_TOP + PLOT_H).toFixed(2) +
      ' L' + xAt(0).toFixed(2) + ',' + (PAD_TOP + PLOT_H).toFixed(2) + ' Z';

    defsHtml += '<linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + color + '" stop-opacity="' + (s.tone === 'accent' ? '0.22' : '0.14') + '"/>' +
      '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/>' +
    '</linearGradient>';

    var pointsHtml = values.map(function (v, i) {
      var title = (labels[i] != null ? labels[i] + ': ' : '') + format(v);
      return '<circle cx="' + xAt(i).toFixed(2) + '" cy="' + yAt(v).toFixed(2) + '" r="2.5" fill="' + color + '"><title>' + esc(title) + '</title></circle>';
    }).join('');

    seriesHtml += '<path d="' + areaPath + '" fill="url(#' + gid + ')" stroke="none"/>' +
      '<path d="' + linePath + '" fill="none" stroke="' + color + '" stroke-width="2" vector-effect="non-scaling-stroke"/>' +
      pointsHtml;
  }

  var inner = '<defs>' + defsHtml + '</defs>' + gridlinesSvg() + seriesHtml + xLabelsSvg(labels, xAt);
  return wrapSvg(inner, '0 0 ' + W + ' ' + H, ariaLabel);
}

/**
 * barChart({ values, labels, format, ariaLabel })
 * سلسلة وحدة، أعمدة عمودية.
 */
export function barChart(opts) {
  opts = opts || {};
  var values = opts.values || [];
  var labels = opts.labels || [];
  var format = typeof opts.format === 'function' ? opts.format : function (v) { return String(v); };
  var ariaLabel = opts.ariaLabel || '';

  if (allZero(values)) return '';

  var n = values.length;
  var max = Math.max.apply(null, values);
  if (max <= 0) max = 1; // احتياط من القسمة على صفر (قيم سالبة كلها مثلاً)

  var slot = PLOT_W / n;
  var barW = Math.max(slot * 0.55, 3);
  function xCenter(i) { return PAD_LEFT + slot * i + slot / 2; }
  function xAt(i) { return xCenter(i); } // باش xLabelsSvg تقدر تستعملها كيفكيف

  var barsHtml = values.map(function (v, i) {
    var h = Math.max(0, (v / max) * PLOT_H);
    var y = PAD_TOP + PLOT_H - h;
    var title = (labels[i] != null ? labels[i] + ': ' : '') + format(v);
    return '<rect x="' + (xCenter(i) - barW / 2).toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + barW.toFixed(2) +
      '" height="' + h.toFixed(2) + '" rx="2" fill="var(--accent)"><title>' + esc(title) + '</title></rect>';
  }).join('');

  var inner = gridlinesSvg() + barsHtml + xLabelsSvg(labels, xAt);
  return wrapSvg(inner, '0 0 ' + W + ' ' + H, ariaLabel);
}

/**
 * hbarChart({ items, format, ariaLabel })
 * items: [{ label, value }] — لائحة مرتّبة (مثلاً المبيعات حسب الفئة)،
 * أعمدة أفقية. viewBox يطول مع عدد العناصر بدل ما يتزنق فـ 180px ثابتة.
 */
export function hbarChart(opts) {
  opts = opts || {};
  var items = opts.items || [];
  var format = typeof opts.format === 'function' ? opts.format : function (v) { return String(v); };
  var ariaLabel = opts.ariaLabel || '';

  var values = items.map(function (it) { return Number(it.value) || 0; });
  if (allZero(values)) return '';

  var rowH = 28;
  var height = rowH * items.length + 8;
  var labelW = 150;
  var valueW = 50;
  var gap = 8;
  var barX0 = labelW;
  var barMaxW = W - labelW - valueW - gap * 2;
  var max = Math.max.apply(null, values);
  if (max <= 0) max = 1;

  var rowsHtml = items.map(function (item, i) {
    var v = values[i];
    var midY = 4 + i * rowH + rowH / 2;
    var barW = Math.max(0, (v / max) * barMaxW);
    var title = esc((item.label || '') + ': ' + format(v));
    return '<g>' +
      '<text x="0" y="' + midY.toFixed(2) + '" dominant-baseline="middle" font-size="12" font-weight="600" fill="var(--text)">' + esc(item.label || '') + '</text>' +
      '<rect x="' + barX0 + '" y="' + (midY - 7).toFixed(2) + '" width="' + barMaxW.toFixed(2) + '" height="14" rx="3" fill="var(--border)"/>' +
      '<rect x="' + barX0 + '" y="' + (midY - 7).toFixed(2) + '" width="' + barW.toFixed(2) + '" height="14" rx="3" fill="var(--accent)"><title>' + title + '</title></rect>' +
      '<text x="' + W + '" y="' + midY.toFixed(2) + '" dominant-baseline="middle" text-anchor="end" font-size="11" fill="var(--text-muted)">' + esc(format(v)) + '</text>' +
    '</g>';
  }).join('');

  return wrapSvg(rowsHtml, '0 0 ' + W + ' ' + height, ariaLabel);
}
