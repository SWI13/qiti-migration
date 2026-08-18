import { state } from '../state.js';
import { api } from '../api.js';
import { esc, toast } from '../dom.js';
import { fmtMoney, fmtDay, fmtPct } from '../format.js';
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
    conversionSub += ' · ' + esc(t('dashboard.trackingSince', { date: fmtDay(k.trackingSince) }));
  }

  var revenueSub = (k.revenue === 0 && k.inTransit > 0)
    ? esc(t('dashboard.revenueWaiting', { n: k.inTransit }))
    : esc(t('dashboard.revenueHint'));

  var profitClass = k.profit < 0 ? ' kpi__value--down' : (k.profit > 0 ? ' kpi__value--up' : '');
  var profitValue = '<span class="kpi__value-inner' + profitClass + '">' + esc(fmtMoney(k.profit)) + '</span>';

  return '<div class="kpi-grid">' +
    kpiTile(t('dashboard.revenue'), esc(fmtMoney(k.revenue)), revenueSub, deltaHtml(k.revenue, k.revenuePrev)) +
    kpiTile(t('dashboard.profit'), profitValue, esc(t('dashboard.profitHint')), deltaHtml(k.profit, k.profitPrev)) +
    kpiTile(t('dashboard.orders'), esc(String(k.ordersPlaced)), esc(t('dashboard.ordersSub', { delivered: k.delivered, pending: k.pending }))) +
    kpiTile(t('dashboard.aov'), esc(fmtMoney(k.aov)), '') +
    kpiTile(t('dashboard.productsSold'), esc(String(k.unitsSold)), '') +
    kpiTile(t('dashboard.customers'), esc(String(k.customers)), '') +
    kpiTile(t('dashboard.conversion'), conversionValue, conversionSub) +
  '</div>';
}

function offersCard(summary) {
  var o = (summary.kpis || {}).offers;
  if (!o || (!o.bundleOrders && !o.upsellOffers)) return '';

  var rows = [];
  if (o.bundleOrders) {
    rows.push({
      name: t('dashboard.bundleOrders'),
      meta: t('dashboard.bundleUnits', { units: o.bundleUnits }),
      amount: fmtMoney(o.bundleRevenue),
    });
  }
  if (o.upsellOffers) {
    rows.push({
      name: t('dashboard.upsellConversion'),
      meta: t('dashboard.upsellAccepted', { accepted: o.upsellAccepted, offers: o.upsellOffers }),
      amount: o.upsellRate == null ? '—' : fmtPct(o.upsellRate),
    });
    rows.push({
      name: t('dashboard.upsellRevenue'),
      meta: t('dashboard.upsellPerOrder', { amount: fmtMoney(o.upsellPerOrder) }),
      amount: fmtMoney(o.upsellRevenue),
    });
  }

  var html = rows.map(function (row) {
    return '<div class="row-item row-item--order">' +
      '<div><div class="row-item__name">' + esc(row.name) + '</div>' +
      '<div class="row-item__meta">' + esc(row.meta) + '</div></div>' +
      '<div class="row-item__amount">' + esc(row.amount) + '</div>' +
    '</div>';
  }).join('');

  return rowListCard(t('dashboard.offersTitle'), html);
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
    labels: s.days.map(fmtDay),
    format: function (v) { return fmtMoney(v); },
    ariaLabel: t('dashboard.revenueChart') + ' / ' + t('dashboard.pipeline'),
  });
  return chartCard(t('dashboard.revenueChart'), html);
}

function ordersChartCard(summary) {
  var s = summary.series;
  var html = barChart({
    values: s.orders,
    labels: s.days.map(fmtDay),
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
    var stats = t('dashboard.campaignStats', { visits: c.visits, orders: c.orders, conv: conv });
    return '<a class="row-item row-item--order" href="#/campaigns/' + esc(c.id) + '">' +
      '<div><div class="row-item__name"><bdi>' + esc(c.name || t('campaigns.untitled')) + '</bdi></div>' +
      '<div class="row-item__meta">/' + esc(c.slug) + ' · ' + esc(stats) + '</div></div>' +
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

function rangeSelectHtml(busy) {
  return '<select id="dashboardRange" aria-label="' + esc(t('dashboard.rangeAriaLabel')) + '"' + (busy ? ' disabled' : '') + '>' +
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
      (offersCard(summary) ? '<div style="margin-top:14px">' + offersCard(summary) + '</div>' : '') +
      '<div style="margin-top:14px">' + recentOrdersCard(summary) + '</div>';
  }

  root.innerHTML = shell(t('dashboard.title'), rangeSelectHtml(false), body);

  document.getElementById('dashboardRange').addEventListener('change', async function (event) {
    var daysBefore = state.dashboardDays;
    state.dashboardDays = Number(event.target.value);
    root.innerHTML = shell(t('dashboard.title'), rangeSelectHtml(true), skeletonDashboard());
    try {
      var res = await api('dashboard.summary', { days: state.dashboardDays });
      state.dashboard = res.summary;
      renderDashboard();
    } catch (error) {
      state.dashboardDays = daysBefore;
      toast(error.message, true);
      renderDashboard();
    }
  });
}
