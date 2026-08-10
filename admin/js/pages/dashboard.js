/* ==========================================================================
   Qiti admin — لوحة القيادة
   ملخّص واحد (dashboard.summary) يعمّر كل الصفحة: KPIs + رسوم + جداول.
   تبديل المدى (7/30/90) يعاود يجيب الملخّص ويعاود يبني الشاسي كامل —
   نفس نمط route() (بلا تحديث جزئي)، بلا ما يلمس location.hash: هذا
   تفضيل عرض، ماشي بلاصة.
   ========================================================================== */
import { state } from '../state.js';
import { api } from '../api.js';
import { esc, toast } from '../dom.js';
import { fmtMoney } from '../format.js';
import { t } from '../i18n.js';
import { shell } from '../ui/shell.js';
import { skeletonDashboard } from '../ui/skeleton.js';
import { stateBlock } from '../ui/state-block.js';
import { areaChart, barChart, hbarChart } from '../ui/chart.js';

var root = document.getElementById('adminRoot');

var RANGE_OPTIONS = [
  { value: 7, label: 'dashboard.range7' },
  { value: 30, label: 'dashboard.range30' },
  { value: 90, label: 'dashboard.range90' },
];

function fmtDate(day) {
  if (!day) return '';
  return new Date(day + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtPct(n) {
  return (n * 100).toFixed(1) + '%';
}

/* نسبة التغيير ديار كل مرّة تكون عندها نقطة انطلاق (prev > 0) — على صفر
   النسبة المئوية ما عندهاش معنى، أحسن نخبّيوها بدل رقم غالط (∞ ولا NaN) */
function deltaHtml(current, prev) {
  if (!prev) return '';
  var pct = Math.round(((current - prev) / prev) * 100);
  if (pct === 0) return '';
  var up = pct > 0;
  return '<div class="kpi__delta kpi__delta--' + (up ? 'up' : 'down') + '">' +
    (up ? '▲' : '▼') + ' ' + Math.abs(pct) + '%</div>';
}

function kpiTile(label, valueHtml, subHtml, deltaHtmlStr) {
  return '<div class="admin-card kpi">' +
    '<div class="kpi__label">' + esc(label) + '</div>' +
    '<div class="kpi__value">' + valueHtml + '</div>' +
    (deltaHtmlStr || '') +
    (subHtml ? '<div class="kpi__sub">' + subHtml + '</div>' : '') +
  '</div>';
}

function kpiGrid(summary) {
  var k = summary.kpis;
  var conversionValue = k.conversionRate == null ? '—' : esc(fmtPct(k.conversionRate));
  var conversionSub = k.conversionRate == null
    ? esc(t('dashboard.noVisitData'))
    : esc(k.visits + ' ' + t('dashboard.visits').toLowerCase());
  if (k.trackingSince && k.trackingSince > summary.window.startDay) {
    conversionSub += ' · ' + esc(t('dashboard.trackingSince', { date: fmtDate(k.trackingSince) }));
  }

  return '<div class="kpi-grid">' +
    kpiTile(t('dashboard.revenue'), esc(fmtMoney(k.revenue)), esc(t('dashboard.revenueHint')), deltaHtml(k.revenue, k.revenuePrev)) +
    kpiTile(t('dashboard.orders'), esc(String(k.ordersPlaced)), esc(k.delivered + ' delivered · ' + k.pending + ' pending')) +
    kpiTile(t('dashboard.aov'), esc(fmtMoney(k.aov)), '') +
    kpiTile(t('dashboard.productsSold'), esc(String(k.unitsSold)), '') +
    kpiTile(t('dashboard.customers'), esc(String(k.customers)), '') +
    kpiTile(t('dashboard.conversion'), conversionValue, conversionSub) +
  '</div>';
}

function chartCard(title, chartHtml) {
  return '<div class="admin-card chart-card">' +
    '<div class="chart-card__head"><h3>' + esc(title) + '</h3></div>' +
    (chartHtml || stateBlock({ variant: 'empty', title: t('dashboard.noDataTitle') })) +
  '</div>';
}

function revenueChartCard(summary) {
  var s = summary.series;
  var html = areaChart({
    series: [
      { values: s.revenue, tone: 'accent' },
      { values: s.pipeline, tone: 'muted' },
    ],
    labels: s.days.map(fmtDate),
    format: function (v) { return fmtMoney(v); },
    ariaLabel: t('dashboard.revenueChart') + ' / ' + t('dashboard.pipeline'),
  });
  return chartCard(t('dashboard.revenueChart'), html);
}

function ordersChartCard(summary) {
  var s = summary.series;
  var html = barChart({
    values: s.orders,
    labels: s.days.map(fmtDate),
    format: function (v) { return String(v); },
    ariaLabel: t('dashboard.ordersChart'),
  });
  return chartCard(t('dashboard.ordersChart'), html);
}

function categoryChartCard(summary) {
  var items = (summary.byCategory || []).slice(0, 8).map(function (c) {
    return { label: c.name || t('dashboard.uncategorized'), value: c.revenue };
  });
  var html = hbarChart({ items: items, format: function (v) { return fmtMoney(v); }, ariaLabel: t('dashboard.byCategory') });
  return chartCard(t('dashboard.byCategory'), html);
}

function rowListCard(title, rowsHtml, actionsHtml) {
  return '<div class="admin-card chart-card">' +
    '<div class="chart-card__head"><h3>' + esc(title) + '</h3>' + (actionsHtml || '') + '</div>' +
    '<div class="row-list">' + (rowsHtml || stateBlock({ variant: 'empty', title: t('dashboard.noDataTitle') })) + '</div>' +
  '</div>';
}

function viewAllLink(href) {
  return '<a class="btn btn--outline btn--xs" href="' + esc(href) + '">' + esc(t('dashboard.viewAll')) + '</a>';
}

function topProductsCard(summary) {
  var rows = (summary.topProducts || []).map(function (p) {
    return '<div class="row-item">' +
      '<div><div class="row-item__name">' + esc(p.name || t('dashboard.legacyProduct')) + '</div>' +
      '<div class="row-item__meta">' + esc(t('dashboard.units', { n: p.units })) + '</div></div>' +
      '<div class="row-item__amount">' + esc(fmtMoney(p.revenue)) + '</div>' +
    '</div>';
  }).join('');
  return rowListCard(t('dashboard.topProducts'), rows);
}

function campaignsCard(summary) {
  var rows = (summary.campaigns || []).map(function (c) {
    var conv = c.conversionRate == null ? '—' : fmtPct(c.conversionRate);
    return '<a class="row-item row-item--order" href="#/campaigns/' + esc(c.id) + '">' +
      '<div><div class="row-item__name"><bdi>' + esc(c.name || t('campaigns.untitled')) + '</bdi></div>' +
      '<div class="row-item__meta">/' + esc(c.slug) + ' · ' + esc(String(c.visits)) + ' visits · ' +
        esc(String(c.orders)) + ' orders · ' + esc(conv) + '</div></div>' +
      '<div class="row-item__amount">' + esc(fmtMoney(c.revenue)) + '</div>' +
    '</a>';
  }).join('');
  return rowListCard(t('dashboard.activeCampaigns'), rows, viewAllLink('#/campaigns'));
}

function lowStockCard(summary) {
  var rows = (summary.lowStock || []).map(function (row) {
    var name = row.productName || t('dashboard.legacyStock');
    var label = row.variantLabel ? ' — ' + esc(row.variantLabel) : '';
    var href = row.productId ? '#/products/' + esc(row.productId) : '#/products';
    return '<a class="row-item row-item--order" href="' + href + '">' +
      '<div><div class="row-item__name">' + esc(name) + label + '</div></div>' +
      '<div class="row-item__amount stock-low">' + esc(row.qty) + ' / ' + esc(row.threshold) + '</div>' +
    '</a>';
  }).join('');
  return rowListCard(t('dashboard.lowStock'), rows);
}

function recentOrdersCard(summary) {
  var rows = (summary.recentOrders || []).map(function (o) {
    return '<a class="row-item row-item--order" href="#/orders">' +
      '<div><div class="row-item__name">' + esc(o.name || '') + '</div>' +
      '<div class="row-item__meta">' + esc(o.phone || '') + (o.wilaya ? ' · ' + esc(o.wilaya) : '') + '</div></div>' +
      '<div class="row-item__amount">' + esc(fmtMoney(o.total)) + '</div>' +
    '</a>';
  }).join('');
  return rowListCard(t('dashboard.recentOrders'), rows, viewAllLink('#/orders'));
}

function rangeSelectHtml() {
  return '<select id="dashboardRange">' +
    RANGE_OPTIONS.map(function (opt) {
      return '<option value="' + opt.value + '"' + (state.dashboardDays === opt.value ? ' selected' : '') + '>' +
        esc(t(opt.label)) + '</option>';
    }).join('') +
  '</select>';
}

export function renderDashboard() {
  var summary = state.dashboard;
  if (!summary) return;

  var body;
  if (summary.kpis.ordersPlaced === 0 && summary.kpis.visits === 0) {
    body = '<div class="admin-card">' + stateBlock({
      variant: 'empty', title: t('dashboard.emptyTitle'), body: t('dashboard.emptyBody'),
    }) + '</div>';
  } else {
    body = kpiGrid(summary) +
      '<div class="dash-grid" style="margin-top:14px">' + revenueChartCard(summary) + ordersChartCard(summary) + '</div>' +
      '<div class="dash-grid" style="margin-top:14px">' + categoryChartCard(summary) + topProductsCard(summary) + '</div>' +
      '<div class="dash-grid" style="margin-top:14px">' + campaignsCard(summary) + lowStockCard(summary) + '</div>' +
      '<div style="margin-top:14px">' + recentOrdersCard(summary) + '</div>';
  }

  root.innerHTML = shell(t('dashboard.title'), rangeSelectHtml(), body);

  document.getElementById('dashboardRange').addEventListener('change', async function (event) {
    state.dashboardDays = Number(event.target.value);
    root.innerHTML = shell(t('dashboard.title'), rangeSelectHtml(), skeletonDashboard());
    try {
      var res = await api('dashboard.summary', { days: state.dashboardDays });
      state.dashboard = res.summary;
      renderDashboard();
    } catch (error) {
      toast(error.message, true);
    }
  });
}
