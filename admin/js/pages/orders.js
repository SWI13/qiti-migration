import { state } from '../state.js';
import { esc } from '../dom.js';
import { fmtMoney, fmtDateTime } from '../format.js';
import { t } from '../i18n.js';
import { shell } from '../ui/shell.js';
import { dataTable } from '../ui/table.js';
import { mountModal } from '../ui/dialog.js';
import { orderTimeline } from './logs.js';

var root = document.getElementById('adminRoot');
var filter = { status: 'all', q: '' };
var sort = { key: 'createdAt', dir: 'desc' };
var page = 1;
var PAGE_SIZE = 20;

var STATUS_OPTIONS = [
  { value: 'all', label: 'orders.filterAll' },
  { value: 'lead', label: 'orders.statusLead' },
  { value: 'pending', label: 'orders.statusPending' },
  { value: 'accepted', label: 'orders.statusAccepted' },
  { value: 'delivered', label: 'orders.statusDelivered' },
  { value: 'returned', label: 'orders.statusReturned' },
  { value: 'denied', label: 'orders.statusDenied' },
];

/* أسماء نتائج المكالمة — نفس النصوص تاع صفّ المكالمات، باش السطر
   اللي تقراه هنا يقول نفس الكلمة اللي نقرت عليها تمّة */
var CALL_OUTCOME_KEY = {
  reached: 'queue.outcomeReached',
  'no-answer': 'queue.outcomeNoAnswer',
  busy: 'queue.outcomeBusy',
  off: 'queue.outcomeOff',
  callback: 'queue.outcomeCallback',
  wrong: 'queue.outcomeWrong',
};

function bucketOf(order) {
  if (order.isLead) return 'lead';
  if (order.status === 'accepted' && order.deliveryStatus) return order.deliveryStatus;
  return order.status;
}

function statusBadge(order) {
  var bucket = bucketOf(order);
  var labels = {
    lead: 'orders.statusLead',
    pending: 'orders.statusPending', accepted: 'orders.statusAccepted',
    denied: 'orders.statusDenied', delivered: 'orders.statusDelivered', returned: 'orders.statusReturned',
  };
  return '<span class="badge badge--order-' + esc(bucket) + '">' + esc(t(labels[bucket] || bucket)) + '</span>';
}

function leadRows() {
  return (state.leads || [])
    .filter(function (lead) { return lead.status === 'open'; })
    .map(function (lead) {
      return {
        id: 'lead:' + lead.phone,
        isLead: true,
        lead: lead,
        status: 'lead',
        name: lead.name || '',
        phone: lead.phone,
        wilaya: lead.wilaya || '',
        commune: lead.commune || '',
        total: lead.cartTotal || 0,
        qty: lead.qty || 1,
        shipping: lead.shipping,
        productId: lead.productId,
        createdAt: lead.updatedAt || lead.createdAt,
      };
    });
}

function allRows() {
  return state.orders.concat(leadRows());
}

function matchesFilter(order) {
  if (filter.status !== 'all' && bucketOf(order) !== filter.status) return false;
  if (filter.q) {
    var q = filter.q.toLowerCase();
    var name = (order.name || '').toLowerCase();
    var phone = order.phone || '';
    if (name.indexOf(q) === -1 && phone.indexOf(filter.q) === -1) return false;
  }
  return true;
}

function sortValue(order, key) {
  if (key === 'total') return Number(order.total) || 0;
  if (key === 'name') return (order.name || '').toLowerCase();
  if (key === 'status') return bucketOf(order);
  return order.createdAt || '';
}

function sortRows(rows) {
  var key = sort.key;
  var dir = sort.dir === 'asc' ? 1 : -1;
  return rows.slice().sort(function (a, b) {
    var av = sortValue(a, key);
    var bv = sortValue(b, key);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

function visibleOrders() {
  return sortRows(allRows().filter(matchesFilter));
}

function customerCell(order) {
  return '<button type="button" class="dt-link" data-act="view-order" data-id="' + esc(order.id) + '">' +
      '<span class="dt-link__name">' + esc(order.name || '—') + '</span>' +
      '<span class="row-item__meta">' + esc(order.phone) + ' · ' + esc(order.wilaya) +
        (order.commune ? ', ' + esc(order.commune) : '') + '</span>' +
    '</button>';
}

function orderColumns() {
  return [
    { key: 'createdAt', label: t('orders.colDate'), sortable: true,
      render: function (row) { return esc(fmtDateTime(row.createdAt)); } },
    { key: 'name', label: t('orders.customer'), sortable: true, render: customerCell },
    { key: 'total', label: t('orders.total'), sortable: true, numeric: true,
      render: function (row) { return esc(fmtMoney(row.total)); } },
    { key: 'status', label: t('orders.colStatus'), sortable: true, render: statusBadge },
  ];
}

function emptyOpts() {
  var filtered = allRows().length > 0;
  return {
    variant: 'empty',
    title: filtered ? t('orders.emptyFilteredTitle') : t('orders.emptyTitle'),
    body: filtered ? t('orders.emptyFilteredBody') : t('orders.emptyBody'),
  };
}

function paginationHtml(total, totalPages) {
  if (totalPages <= 1) return '';
  var from = (page - 1) * PAGE_SIZE + 1;
  var to = Math.min(page * PAGE_SIZE, total);
  return '<div class="pagination">' +
    '<span class="pagination__summary">' + esc(t('orders.paginationSummary', { from: from, to: to, n: total })) + '</span>' +
    '<div class="pagination__nav">' +
      '<button type="button" class="btn btn--outline btn--xs" data-act="orders-page" data-page="' + (page - 1) + '"' +
        (page <= 1 ? ' disabled' : '') + '>' + esc(t('orders.pagePrev')) + '</button>' +
      '<span class="pagination__page">' + page + ' / ' + totalPages + '</span>' +
      '<button type="button" class="btn btn--outline btn--xs" data-act="orders-page" data-page="' + (page + 1) + '"' +
        (page >= totalPages ? ' disabled' : '') + '>' + esc(t('orders.pageNext')) + '</button>' +
    '</div>' +
  '</div>';
}

function listRegionHtml() {
  var all = visibleOrders();
  var totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  if (page > totalPages) page = totalPages;
  var start = (page - 1) * PAGE_SIZE;
  var rows = all.slice(start, start + PAGE_SIZE);

  return dataTable({
    columns: orderColumns(),
    rows: rows,
    sort: sort,
    onSortAct: 'orders-sort',
    empty: emptyOpts(),
  }) + paginationHtml(all.length, totalPages);
}

export function renderOrderList() {
  var actions =
    '<input type="text" id="orderSearch" class="order-search" placeholder="' + esc(t('orders.searchPlaceholder')) +
      '" aria-label="' + esc(t('orders.searchPlaceholder')) + '" value="' + esc(filter.q) + '">' +
    '<select id="orderStatusFilter" aria-label="' + esc(t('orders.filterAriaLabel')) + '">' +
      STATUS_OPTIONS.map(function (opt) {
        return '<option value="' + opt.value + '"' + (filter.status === opt.value ? ' selected' : '') + '>' + esc(t(opt.label)) + '</option>';
      }).join('') +
    '</select>';

  root.innerHTML = shell(
    t('orders.title'),
    actions,
    '<div class="hint order-hint">' + esc(t('orders.readonlyHint')) + '</div>' +
    '<div class="admin-card admin-card--form" id="ordersCard">' + listRegionHtml() + '</div>',
  );

  var card = document.getElementById('ordersCard');
  function refresh() { card.innerHTML = listRegionHtml(); }

  document.getElementById('orderSearch').addEventListener('input', function (event) {
    filter.q = event.target.value.trim();
    page = 1;
    refresh();
  });
  document.getElementById('orderStatusFilter').addEventListener('change', function (event) {
    filter.status = event.target.value;
    page = 1;
    refresh();
  });

  card.addEventListener('click', function (event) {
    var sortBtn = event.target.closest('[data-act="orders-sort"]');
    if (sortBtn) {
      sort = { key: sortBtn.getAttribute('data-sort-key'), dir: sortBtn.getAttribute('data-sort-dir') };
      page = 1;
      refresh();
      return;
    }
    var pageBtn = event.target.closest('[data-act="orders-page"]');
    if (pageBtn) {
      page = Number(pageBtn.getAttribute('data-page')) || 1;
      refresh();
      return;
    }
    var link = event.target.closest('[data-act="view-order"]');
    if (link) {
      var row = allRows().filter(function (o) { return o.id === link.getAttribute('data-id'); })[0];
      if (row) orderDetail(row);
    }
  });
}

function row(label, value) {
  if (value == null || value === '') return '';
  return '<dt>' + esc(label) + '</dt><dd>' + value + '</dd>';
}

function orderDetail(order) {
  if (order.isLead) return leadDetail(order.lead, order);
  var product = state.products.filter(function (p) { return p.id === order.productId; })[0];
  var variantLabel = order.variant && order.variant.options && Object.keys(order.variant.options).length
    ? Object.values(order.variant.options).join(' / ') : '';
  var history = order.customerHistory || {};
  var historyParts = [];
  if (history.delivered) historyParts.push(t('orders.historyDelivered', { n: history.delivered }));
  if (history.denied) historyParts.push(t('orders.historyDenied', { n: history.denied }));
  if (history.returned) historyParts.push(t('orders.historyReturned', { n: history.returned }));

  var customerDl =
    '<dl>' +
      row(t('orders.customer'), esc(order.name)) +
      row(t('orders.phone'), esc(order.phone)) +
      row(t('orders.location'), esc(order.wilaya) + (order.commune ? ', ' + esc(order.commune) : '')) +
      row(t('orders.shipping'), esc(order.shipping === 'desk' ? t('orders.shippingDesk') : t('orders.shippingHome'))) +
      row(t('orders.shippingFee'), order.shippingFee == null ? '' : esc(fmtMoney(order.shippingFee))) +
    '</dl>';

  /* سجلّ المكالمات كامل — الصفّ يوري آخر وحدة برك، وهنا تشوف الرحلة
     كاملة: علاش هذا الطلب تأخّر، وواش دار اللي كان قبلك */
  var calls = Array.isArray(order.calls) ? order.calls : [];
  var callsRow = calls.length
    ? row(t('orders.callAttempts'), calls.map(function (call) {
      return esc(t('orders.callAttempt', {
        when: fmtDateTime(call.at),
        outcome: CALL_OUTCOME_KEY[call.outcome] ? t(CALL_OUTCOME_KEY[call.outcome]) : call.outcome,
        note: call.note ? ' — “' + call.note + '”' : '',
      }));
    }).join('<br>'))
    : '';

  var decisionDl =
    '<dl>' +
      row(t('orders.decision'), statusBadge(order)) +
      callsRow +
      (order.actor && order.decidedAt ? row(t('orders.decision'), esc(t('orders.decidedBy', { who: order.actor, when: fmtDateTime(order.decidedAt) }))) : '') +
      row(t('orders.deniedReason'), order.reason ? esc(order.reason) : '') +
      (order.confirmedAt ? row('', esc(t('orders.confirmedByPhone', { who: order.confirmedBy || '', when: fmtDateTime(order.confirmedAt) }))) : '') +
      (order.deliveryActor && order.deliveryDecidedAt ? row(t('orders.delivery'), esc(order.deliveryActor) + ' · ' + esc(fmtDateTime(order.deliveryDecidedAt))) : '') +
      (order.returnReceivedAt ? row(t('orders.returnReceivedAt'), esc(fmtDateTime(order.returnReceivedAt)) + (order.returnReceivedActor ? ' · ' + esc(order.returnReceivedActor) : '')) : '') +
    '</dl>';

  var lines = Array.isArray(order.lines) ? order.lines : [];
  var bundleRows = lines.filter(function (line) { return line.kind === 'bundle'; }).map(function (line) {
    var items = (line.items || []).map(function (item) {
      return esc((item.name || item.productId) + ' ×' + (item.qty * (line.qty || 1)));
    }).join('<br>');
    return row(t('orders.bundle'),
      '<b>' + esc((line.name || '') + ' ×' + (line.qty || 1)) + '</b> — ' + esc(fmtMoney(line.lineTotal || 0)) +
      (items ? '<div class="row-item__meta">' + items + '</div>' : ''));
  }).join('');

  var upsell = lines.filter(function (line) { return line.kind === 'upsell'; })[0];
  var upsellRow = upsell
    ? row(t('orders.upsell'), esc((upsell.name || '') + ' ×' + (upsell.qty || 1)) + ' — ' + esc(fmtMoney(upsell.lineTotal || 0)))
    : '';

  var productDl =
    '<dl>' +
      (bundleRows ? '' : row(t('orders.product'), esc((product && product.name) || order.productId || '—') + (variantLabel ? ' — ' + esc(variantLabel) : ''))) +
      bundleRows +
      upsellRow +
      row(t('orders.quantity'), Number(order.qty || 1)) +
      row(t('orders.unitPrice'), order.unitPrice != null ? esc(fmtMoney(order.unitPrice)) : '') +
      row(t('orders.total'), esc(fmtMoney(order.total))) +
      row(t('orders.channel'), esc(order.channel || '')) +
      row(t('orders.placedAt'), esc(fmtDateTime(order.createdAt))) +
    '</dl>';

  var historyDl =
    '<dl>' +
      row(t('orders.customerHistory'), historyParts.length ? esc(historyParts.join(' · ')) : esc(t('orders.historyNone'))) +
      (order.blocked ? row('', '<span class="badge badge--order-denied">' + esc(t('orders.blockedFlag')) + '</span>') : '') +
    '</dl>';

  var body =
    '<div class="order-detail">' +
      '<div class="order-detail__cols">' +
        '<div>' +
          '<h4>' + esc(t('orders.customer')) + '</h4>' + customerDl +
          '<h4>' + esc(t('orders.decision')) + '</h4>' + decisionDl +
        '</div>' +
        '<div>' +
          '<h4>' + esc(t('orders.product')) + '</h4>' + productDl +
          '<h4>' + esc(t('orders.customerHistory')) + '</h4>' + historyDl +
        '</div>' +
      '</div>' +
    '</div>';

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal">' +
    '<h3>' + esc(t('orders.detailTitle')) + '</h3>' +
    body +
    '<div class="modal__foot">' +
      '<button class="btn btn--outline btn--xs" data-act="order-timeline">' + esc(t('logs.timelineOpen')) + '</button>' +
      '<button class="btn btn--outline btn--xs" data-close>' + esc(t('common.back')) + '</button>' +
    '</div>' +
  '</div>';

  /*
   * ⚠️ الخطّ الزمني يتجيب عند النقرة، ماشي مع الطلب: أغلب فتحات
   * النافذة هي "شكون الزبون وواش طلب"، وجيبان السجلّ في كل وحدة
   * معناه نداء زايد على كل نقرة في اللائحة.
   */
  overlay.addEventListener('click', function (event) {
    if (event.target.closest('[data-act="order-timeline"]')) orderTimeline(order.id);
  });

  mountModal(overlay);
}

function leadDetail(lead, listRow) {
  var product = state.products.filter(function (p) { return p.id === lead.productId; })[0];
  var filled = ['name', 'phone', 'wilaya', 'commune'].filter(function (field) {
    return String(lead[field] || '').trim();
  }).length;

  var body =
    '<div class="order-detail">' +
      '<div class="hint">' + esc(t('orders.leadHint')) + '</div>' +
      '<div class="order-detail__cols">' +
        '<div>' +
          '<h4>' + esc(t('orders.customer')) + '</h4>' +
          '<dl>' +
            row(t('orders.customer'), lead.name ? esc(lead.name) : '—') +
            row(t('orders.phone'), esc(lead.phone)) +
            row(t('orders.location'), lead.wilaya
              ? esc(lead.wilaya) + (lead.commune ? ', ' + esc(lead.commune) : '')
              : '—') +
            row(t('orders.leadFilled'), filled + ' / 4') +
          '</dl>' +
        '</div>' +
        '<div>' +
          '<h4>' + esc(t('orders.product')) + '</h4>' +
          '<dl>' +
            row(t('orders.product'), esc((product && product.name) || lead.productName || '—')) +
            row(t('orders.quantity'), Number(lead.qty || 1)) +
            row(t('orders.leadCart'), lead.cartTotal ? esc(fmtMoney(lead.cartTotal)) : '—') +
            row(t('orders.channel'), esc(lead.channelLabel || lead.channel || '')) +
            row(t('orders.placedAt'), esc(fmtDateTime(lead.createdAt))) +
            row(t('orders.leadLastSeen'), esc(fmtDateTime(listRow.createdAt))) +
            (lead.contactedAt
              ? row(t('orders.leadCalled'), esc(fmtDateTime(lead.contactedAt)) +
                  (lead.contactedBy ? ' · ' + esc(lead.contactedBy) : ''))
              : '') +
          '</dl>' +
        '</div>' +
      '</div>' +
    '</div>';

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal">' +
    '<h3>' + esc(t('orders.leadTitle')) + '</h3>' +
    body +
    '<div class="modal__foot"><button class="btn btn--outline btn--xs" data-close>' + esc(t('common.back')) + '</button></div>' +
  '</div>';

  mountModal(overlay);
}
