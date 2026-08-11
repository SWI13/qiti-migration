/* ==========================================================================
   Qiti admin — الطلبات (قائمة + تفاصيل، قراءة برك)
   القبول/الرفض/التوصيل يبقاو من تيليغرام (شوف api/
   telegram-webhook.mjs) — هذيك الشاشة فيها منطق المخزون والإشعارات
   والـ Meta events كامل. تكراره هنا يفتح باب لتصادم (مثلاً نقص مخزون
   مرّتين). اللوحة تعرض برك، وتوجّه المشغّل لتيليغرام كي يحتاج يقرّر.
   ========================================================================== */
import { state } from '../state.js';
import { esc } from '../dom.js';
import { fmtMoney, fmtDateTime } from '../format.js';
import { t } from '../i18n.js';
import { shell } from '../ui/shell.js';
import { dataTable } from '../ui/table.js';
import { mountModal } from '../ui/dialog.js';

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

/* accepted+delivered/returned مخبّيين تحت status:'accepted' في التخزين —
   نبنيو "بكيت" واحد يجمع status وdeliveryStatus باش الفلتر يبقى بسيط سطر واحد */
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

/*
 * الـ lead يتلبّس شكل الطلب باش يدخل في نفس الجدول (نفس الأعمدة، نفس
 * الترتيب، نفس البحث) — بلا ما نكتبو جدول ثاني كامل.
 *
 * ⚠️ `total` هنا هو اللي كان في السلّة، ماشي فلوس. علاش الصفّ يبان
 * بحالة "Lead" وعلاش التفاصيل تقولها صراحةً: رقم في عمود المجموع بلا
 * تفسير يتقرا كأنّو مدخول، ومنو يتبنى قرار غالط.
 *
 * المحوّلين (converted) ما يبانوش: راهم طلبات حقيقية في اللائحة خلاص،
 * وتكرارهم يخلّي نفس الزبون مرّتين. والمشطوبين قرّرتي فيهم.
 */
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
        /* آخر حركة، ماشي أوّل وحدة — الترتيب لازم يوري اللي راه سخون دروك */
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

/* مفتاح الترتيب يقرا من الطلب مباشرة — status يترتّب على البكيت (بلا
   قرار/موصّل مدموجين) باش "Denied" و"Returned" ما يبقاوش مخلوطين تحت
   نفس الحرف اللي في state.status الخام */
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

/* اسم الزبون يولّي زر — يفتح تفاصيل الطلب. زر حقيقي (ماشي role="button"
   يدوي) يعطينا الكيبورد (Enter/Space) مجّاناً بلا سطر JS زايد. */
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

/* الفلتر يعيش على مستوى الموديول ويعيش بعد التنقّل — فحتى أوّل رندر
   يقدر يلقى القائمة خاوية بسبب بحث قديم، ماشي بسبب غياب الطلبات */
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

/* قائمة بلا نهاية على شبكة ضعيفة = زحليق بلا نهاية. orders.list ما فيهش
   فلتر سيرفر (شوف admin-api.mjs) — الفلترة/الترتيب من جهة اللوحة، وهنا
   نقصّو النتيجة لصفحات 20 بلا ما نبدّلو الطلب من السيرفر */
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

  /* مستمع مفوَّض واحد على الكارت — يمسك رأس الترتيب (dataTable)، أزرار
     الصفحات، وزر فتح التفاصيل. الكارت روحو ما يتبدّلش (innerHTML تاعو
     برك اللي يتبدّل)، فالتسجيل مرّة وحدة يكفي. */
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

/* ── تفاصيل الطلب (نافذة، قراءة برك) ──────────────────────────────── */

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
    '</dl>';

  var decisionDl =
    '<dl>' +
      row(t('orders.decision'), statusBadge(order)) +
      (order.actor && order.decidedAt ? row(t('orders.decision'), esc(t('orders.decidedBy', { who: order.actor, when: fmtDateTime(order.decidedAt) }))) : '') +
      row(t('orders.deniedReason'), order.reason ? esc(order.reason) : '') +
      (order.confirmedAt ? row('', esc(t('orders.confirmedByPhone', { who: order.confirmedBy || '', when: fmtDateTime(order.confirmedAt) }))) : '') +
      (order.deliveryActor && order.deliveryDecidedAt ? row(t('orders.delivery'), esc(order.deliveryActor) + ' · ' + esc(fmtDateTime(order.deliveryDecidedAt))) : '') +
      (order.returnReceivedAt ? row(t('orders.returnReceivedAt'), esc(fmtDateTime(order.returnReceivedAt)) + (order.returnReceivedActor ? ' · ' + esc(order.returnReceivedActor) : '')) : '') +
    '</dl>';

  var productDl =
    '<dl>' +
      row(t('orders.product'), esc((product && product.name) || order.productId || '—') + (variantLabel ? ' — ' + esc(variantLabel) : '')) +
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
    '<div class="modal__foot"><button class="btn btn--outline btn--xs" data-close>' + esc(t('common.back')) + '</button></div>' +
  '</div>';

  mountModal(overlay);
}

/* ── تفاصيل "ما كملش" ─────────────────────────────────────────────
 *
 * نافذة مستقلّة، ماشي نافذة الطلب بحقول فارغة. نصف الحقول ثمّة ما
 * عندهاش معنى هنا (قرار، توصيل، سومة الوحدة)، و`dl` معمّرة بـ "—"
 * تخلّي القارئ يخمّم واش تخرّب بدل ما يقرا الحقيقة: هذا واحد عمّر
 * رقمو وحبس.
 */
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
