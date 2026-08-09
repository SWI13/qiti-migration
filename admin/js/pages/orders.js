/* ==========================================================================
   Qiti admin — الطلبات (قائمة + تفاصيل، قراءة برك)
   القبول/الرفض/التوصيل يبقاو من تيليغرام (شوف netlify/functions/
   telegram-webhook.mjs) — هذيك الشاشة فيها منطق المخزون والإشعارات
   والـ Meta events كامل. تكراره هنا يفتح باب لتصادم (مثلاً نقص مخزون
   مرّتين). اللوحة تعرض برك، وتوجّه المشغّل لتيليغرام كي يحتاج يقرّر.
   ========================================================================== */
import { state } from '../state.js';
import { esc } from '../dom.js';
import { fmtMoney } from '../format.js';
import { t } from '../i18n.js';
import { shell } from '../ui/shell.js';
import { stateBlock } from '../ui/state-block.js';

var root = document.getElementById('adminRoot');
var filter = { status: 'all', q: '' };

var STATUS_OPTIONS = [
  { value: 'all', label: 'orders.filterAll' },
  { value: 'pending', label: 'orders.statusPending' },
  { value: 'accepted', label: 'orders.statusAccepted' },
  { value: 'delivered', label: 'orders.statusDelivered' },
  { value: 'returned', label: 'orders.statusReturned' },
  { value: 'denied', label: 'orders.statusDenied' },
];

/* accepted+delivered/returned مخبّيين تحت status:'accepted' في التخزين —
   نبنيو "بكيت" واحد يجمع status وdeliveryStatus باش الفلتر يبقى بسيط سطر واحد */
function bucketOf(order) {
  if (order.status === 'accepted' && order.deliveryStatus) return order.deliveryStatus;
  return order.status;
}

function statusBadge(order) {
  var bucket = bucketOf(order);
  var labels = {
    pending: 'orders.statusPending', accepted: 'orders.statusAccepted',
    denied: 'orders.statusDenied', delivered: 'orders.statusDelivered', returned: 'orders.statusReturned',
  };
  return '<span class="badge badge--order-' + esc(bucket) + '">' + esc(t(labels[bucket] || bucket)) + '</span>';
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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

function orderRows() {
  return state.orders.filter(matchesFilter).map(function (order) {
    return '<div class="row-item row-item--order" data-act="view-order" data-id="' + esc(order.id) + '">' +
        '<div>' +
          '<div class="row-item__name">' + esc(order.name) + '</div>' +
          '<div class="row-item__meta">' + esc(order.phone) + ' · ' + esc(order.wilaya) +
            (order.commune ? ', ' + esc(order.commune) : '') + '</div>' +
        '</div>' +
        '<div class="row-item__amount">' + esc(fmtMoney(order.total)) +
          '<div class="row-item__meta">' + esc(fmtDate(order.createdAt)) + '</div>' +
        '</div>' +
        statusBadge(order) +
      '</div>';
  }).join('');
}

function renderRows() {
  var list = root.querySelector('.row-list');
  if (!list) return;
  list.innerHTML = orderRows() || stateBlock({
    variant: 'empty',
    title: state.orders.length ? t('orders.emptyFilteredTitle') : t('orders.emptyTitle'),
    body: state.orders.length ? t('orders.emptyFilteredBody') : t('orders.emptyBody'),
  });
}

export function renderOrderList() {
  var actions =
    '<input type="text" id="orderSearch" class="order-search" placeholder="' + esc(t('orders.searchPlaceholder')) + '" value="' + esc(filter.q) + '">' +
    '<select id="orderStatusFilter">' +
      STATUS_OPTIONS.map(function (opt) {
        return '<option value="' + opt.value + '"' + (filter.status === opt.value ? ' selected' : '') + '>' + esc(t(opt.label)) + '</option>';
      }).join('') +
    '</select>';

  root.innerHTML = shell(
    t('orders.title'),
    actions,
    '<div class="hint order-hint">' + esc(t('orders.readonlyHint')) + '</div>' +
    '<div class="admin-card"><div class="row-list">' +
      (orderRows() || stateBlock({
        variant: 'empty',
        title: t('orders.emptyTitle'),
        body: t('orders.emptyBody'),
      })) +
    '</div></div>',
  );

  document.getElementById('orderSearch').addEventListener('input', function (event) {
    filter.q = event.target.value.trim();
    renderRows();
  });
  document.getElementById('orderStatusFilter').addEventListener('change', function (event) {
    filter.status = event.target.value;
    renderRows();
  });
  root.querySelector('.row-list').addEventListener('click', function (event) {
    var item = event.target.closest('[data-act="view-order"]');
    if (!item) return;
    var order = state.orders.filter(function (o) { return o.id === item.getAttribute('data-id'); })[0];
    if (order) orderDetail(order);
  });
}

/* ── تفاصيل الطلب (نافذة، قراءة برك) ──────────────────────────────── */

function row(label, value) {
  if (value == null || value === '') return '';
  return '<dt>' + esc(label) + '</dt><dd>' + value + '</dd>';
}

function orderDetail(order) {
  var product = state.products.filter(function (p) { return p.id === order.productId; })[0];
  var variantLabel = order.variant && order.variant.options && Object.keys(order.variant.options).length
    ? Object.values(order.variant.options).join(' / ') : '';
  var history = order.customerHistory || {};
  var historyParts = [];
  if (history.delivered) historyParts.push(t('orders.historyDelivered', { n: history.delivered }));
  if (history.denied) historyParts.push(t('orders.historyDenied', { n: history.denied }));
  if (history.returned) historyParts.push(t('orders.historyReturned', { n: history.returned }));

  var body =
    '<div class="order-detail">' +
      '<h4>' + esc(t('orders.customer')) + '</h4>' +
      '<dl>' +
        row(t('orders.customer'), esc(order.name)) +
        row(t('orders.phone'), esc(order.phone)) +
        row(t('orders.location'), esc(order.wilaya) + (order.commune ? ', ' + esc(order.commune) : '')) +
        row(t('orders.shipping'), esc(order.shipping === 'desk' ? t('orders.shippingDesk') : t('orders.shippingHome'))) +
      '</dl>' +

      '<h4>' + esc(t('orders.product')) + '</h4>' +
      '<dl>' +
        row(t('orders.product'), esc((product && product.name) || order.productId || '—') + (variantLabel ? ' — ' + esc(variantLabel) : '')) +
        row(t('orders.quantity'), Number(order.qty || 1)) +
        row(t('orders.unitPrice'), order.unitPrice != null ? esc(fmtMoney(order.unitPrice)) : '') +
        row(t('orders.total'), esc(fmtMoney(order.total))) +
        row(t('orders.channel'), esc(order.channel || '')) +
        row(t('orders.placedAt'), esc(fmtDate(order.createdAt))) +
      '</dl>' +

      '<h4>' + esc(t('orders.decision')) + '</h4>' +
      '<dl>' +
        row(t('orders.decision'), statusBadge(order)) +
        (order.actor && order.decidedAt ? row(t('orders.decision'), esc(t('orders.decidedBy', { who: order.actor, when: fmtDate(order.decidedAt) }))) : '') +
        row(t('orders.deniedReason'), order.reason ? esc(order.reason) : '') +
        (order.confirmedAt ? row('', esc(t('orders.confirmedByPhone', { who: order.confirmedBy || '', when: fmtDate(order.confirmedAt) }))) : '') +
        (order.deliveryActor && order.deliveryDecidedAt ? row(t('orders.delivery'), esc(order.deliveryActor) + ' · ' + esc(fmtDate(order.deliveryDecidedAt))) : '') +
        (order.returnReceivedAt ? row(t('orders.returnReceivedAt'), esc(fmtDate(order.returnReceivedAt)) + (order.returnReceivedActor ? ' · ' + esc(order.returnReceivedActor) : '')) : '') +
      '</dl>' +

      '<h4>' + esc(t('orders.customerHistory')) + '</h4>' +
      '<dl>' +
        row(t('orders.customerHistory'), historyParts.length ? esc(historyParts.join(' · ')) : esc(t('orders.historyNone'))) +
        (order.blocked ? row('', '<span class="badge badge--order-denied">' + esc(t('orders.blockedFlag')) + '</span>') : '') +
      '</dl>' +
    '</div>';

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal">' +
    '<h3>' + esc(t('orders.detailTitle')) + '</h3>' +
    body +
    '<div class="modal__foot"><button class="btn btn--outline btn--xs" data-close>' + esc(t('common.back')) + '</button></div>' +
  '</div>';

  document.body.appendChild(overlay);
  overlay.addEventListener('click', function (event) {
    if (event.target === overlay || event.target.hasAttribute('data-close')) overlay.remove();
  });
}
