/*
 * صفحة السجلّ — واش صرا، شكون دارو، ومنين.
 *
 * ⚠️ الصفحة تفلتر في السيرفر ماشي في المتصفّح: السجلّ يقدر يوصل
 * لآلاف السطور، وجيبانهم كامل باش نفلتروهم هنا معناه ميغابايت على
 * شبكة الجزائر في كل مرّة يبدّل فيها الفلتر. `logs.list` ترجّع
 * الصفحة المطلوبة برك، ومعاها قائمة الأفعال الموجودة فعلاً باش
 * القائمة المنسدلة تكون حقيقية بلا نداء ثاني.
 */
import { state } from '../state.js';
import { api } from '../api.js';
import { esc } from '../dom.js';
import { fmtDateTime } from '../format.js';
import { t } from '../i18n.js';
import { shell } from '../ui/shell.js';
import { dataTable } from '../ui/table.js';
import { stateBlock } from '../ui/state-block.js';
import { mountModal } from '../ui/dialog.js';

var root = document.getElementById('adminRoot');

var PAGE_SIZE = 25;

var SOURCE_LABEL = {
  admin: 'logs.sourceAdmin',
  telegram: 'logs.sourceTelegram',
  system: 'logs.sourceSystem',
  storefront: 'logs.sourceStorefront',
  cron: 'logs.sourceCron',
};

var RANGE_OPTIONS = [
  { value: 'today', label: 'logs.rangeToday' },
  { value: '7', label: 'logs.range7' },
  { value: '30', label: 'logs.range30' },
  { value: 'all', label: 'logs.rangeAll' },
];

/* الفلاتر تعيش هنا بين الرندرات — نفس منطق صفحة الطلبات */
var filter = { q: '', source: '', status: '', action: '', range: '7' };
var page = 1;

function rangeStart(value) {
  if (value === 'all') return null;
  var now = new Date();
  if (value === 'today') {
    var midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return midnight.toISOString();
  }
  var days = Number(value) || 7;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function activeFilterCount() {
  var n = 0;
  if (filter.q) n += 1;
  if (filter.source) n += 1;
  if (filter.status) n += 1;
  if (filter.action) n += 1;
  if (filter.range !== '7') n += 1;
  return n;
}

/*
 * الرقم يتقنّع في العرض: التخزين يحتفظ بيه كامل (نفس اللي تشوفو في
 * صفحة الطلبات)، بصح شاشة السجلّ تبقى محلولة قدّام ناس، وما كاينش
 * سبب تفرّج أرقام الزبائن كاملة على واحد راه يقلّب على حدث.
 */
function maskPhone(phone) {
  var value = String(phone == null ? '' : phone).trim();
  if (value.length < 7) return value;
  return value.slice(0, 4) + '***' + value.slice(-3);
}

export async function loadLogs(opts) {
  /* ⚠️ الفلاتر تمشي تحت `filters` — `action` في جذر الجسم هو اسم
     أكشن اللوحة، والخلط بيناتهم يرجّع صفر سطر ديما */
  var payload = {
    filters: {
      q: filter.q || undefined,
      source: filter.source || undefined,
      status: filter.status || undefined,
      action: filter.action || undefined,
      from: rangeStart(filter.range) || undefined,
      page: page,
      limit: PAGE_SIZE,
    },
  };

  /*
   * ⚠️ الملخّص يتجدّد كي تدخل للصفحة، ماشي مع كل تبديل فلتر: هو
   * عدّادات النهار، ما عندوش علاقة بالفلتر — وجيبانو في كل حرف
   * تكتبو في البحث رحلة زايدة على والو. بصح خزنو للأبد يخلّي
   * "أحداث اليوم" واقفة على رقم البارح.
   */
  var wantsSummary = !state.logsSummary || !opts || opts.summary !== false;

  var results = await Promise.all([
    api('logs.list', payload),
    wantsSummary ? api('logs.summary') : Promise.resolve({ summary: state.logsSummary }),
  ]);

  state.logs = results[0];
  state.logsSummary = results[1].summary;
}

/* ── بطاقات فوق ─────────────────────────────────────────────────── */

function statTile(label, value, sub) {
  return '<div class="admin-card kpi">' +
    '<div class="kpi__label">' + esc(label) + '</div>' +
    '<div class="kpi__value">' + esc(String(value)) + '</div>' +
    (sub ? '<div class="kpi__sub">' + esc(sub) + '</div>' : '') +
  '</div>';
}

function summaryHtml() {
  var summary = state.logsSummary;
  if (!summary) return '';
  var today = summary.today || {};
  var yesterday = summary.yesterday || {};

  var critical = (summary.critical || []).length
    ? '<div class="admin-card admin-card--form logs-critical">' +
        '<h4>' + esc(t('logs.criticalTitle')) + '</h4>' +
        '<ul class="logs-critical__list">' +
          summary.critical.map(function (event) {
            return '<li>' +
              '<button type="button" class="dt-link" data-act="log-open" data-id="' + esc(event.id) + '">' +
                '<span class="dt-link__name">' + esc(event.action) + '</span>' +
                '<span class="row-item__meta">' + esc(fmtDateTime(event.at)) +
                  (event.error ? ' · ' + esc(event.error) : '') + '</span>' +
              '</button>' +
            '</li>';
          }).join('') +
        '</ul>' +
      '</div>'
    : '';

  return '<div class="kpi-grid">' +
      statTile(t('logs.statEvents'), today.total || 0, t('logs.statYesterday', { n: yesterday.total || 0 })) +
      statTile(t('logs.statFailed'), today.failed || 0, t('logs.statYesterday', { n: yesterday.failed || 0 })) +
      statTile(t('logs.statAdmin'), today.admin || 0, '') +
      statTile(t('logs.statTelegram'), today.telegram || 0, '') +
    '</div>' + critical;
}

/* ── الجدول ──────────────────────────────────────────────────────── */

function sourceBadge(row) {
  var key = SOURCE_LABEL[row.source] || null;
  return '<span class="badge badge--source-' + esc(row.source) + '">' +
    esc(key ? t(key) : row.source) + '</span>';
}

function resultBadge(row) {
  var failed = row.status === 'failed';
  return '<span class="badge badge--order-' + (failed ? 'denied' : 'delivered') + '">' +
    esc(t(failed ? 'logs.statusFailed' : 'logs.statusSuccess')) + '</span>';
}

function entityCell(row) {
  if (!row.entityType) return '—';
  return '<span class="row-item__meta">' + esc(row.entityType) +
    (row.entityId ? ' · ' + esc(row.entityId) : '') + '</span>';
}

function orderCell(row) {
  if (!row.orderId) return '—';
  return '<button type="button" class="dt-link" data-act="log-timeline" data-order="' + esc(row.orderId) + '">' +
    '<span class="dt-link__name">' + esc(row.orderId) + '</span></button>';
}

function columns() {
  return [
    { key: 'at', label: t('logs.colTime'), render: function (row) { return esc(fmtDateTime(row.at)); } },
    { key: 'actorName', label: t('logs.colActor'), render: function (row) { return esc(row.actorName || '—'); } },
    { key: 'source', label: t('logs.colSource'), render: sourceBadge },
    { key: 'action', label: t('logs.colAction'),
      render: function (row) {
        return '<span class="log-action">' + esc(row.action) + '</span>' +
          (row.description ? '<span class="row-item__meta">' + esc(row.description) + '</span>' : '');
      } },
    { key: 'entityType', label: t('logs.colEntity'), render: entityCell },
    { key: 'orderId', label: t('logs.colOrder'), render: orderCell },
    { key: 'status', label: t('logs.colResult'), render: resultBadge },
    { key: 'details', label: t('logs.colDetails'), align: 'end',
      render: function (row) {
        return '<button type="button" class="btn btn--outline btn--xs" data-act="log-open" data-id="' +
          esc(row.id) + '">' + esc(t('logs.view')) + '</button>';
      } },
  ];
}

function paginationHtml() {
  var data = state.logs || {};
  var total = data.total || 0;
  var pages = data.pages || 1;
  if (pages <= 1) return '';

  var from = (data.page - 1) * (data.limit || PAGE_SIZE) + 1;
  var to = Math.min(data.page * (data.limit || PAGE_SIZE), total);

  return '<div class="pagination">' +
    '<span class="pagination__summary">' + esc(t('logs.paginationSummary', { from: from, to: to, n: total })) + '</span>' +
    '<div class="pagination__nav">' +
      '<button type="button" class="btn btn--outline btn--xs" data-act="logs-page" data-page="' + (data.page - 1) + '"' +
        (data.page <= 1 ? ' disabled' : '') + '>' + esc(t('logs.pagePrev')) + '</button>' +
      '<span class="pagination__page">' + data.page + ' / ' + pages + '</span>' +
      '<button type="button" class="btn btn--outline btn--xs" data-act="logs-page" data-page="' + (data.page + 1) + '"' +
        (data.page >= pages ? ' disabled' : '') + '>' + esc(t('logs.pageNext')) + '</button>' +
    '</div>' +
  '</div>';
}

function tableHtml() {
  var data = state.logs || { rows: [] };
  var filtered = activeFilterCount() > 0;

  return dataTable({
    columns: columns(),
    rows: data.rows || [],
    empty: {
      variant: 'empty',
      title: t(filtered ? 'logs.emptyFilteredTitle' : 'logs.emptyTitle'),
      body: t(filtered ? 'logs.emptyFilteredBody' : 'logs.emptyBody'),
    },
  }) +
  (data.truncated ? '<div class="hint">' + esc(t('logs.truncated', { n: data.total })) + '</div>' : '') +
  paginationHtml();
}

function selectHtml(id, label, value, options) {
  return '<select id="' + id + '" aria-label="' + esc(label) + '">' +
    options.map(function (opt) {
      return '<option value="' + esc(opt.value) + '"' + (value === opt.value ? ' selected' : '') + '>' +
        esc(opt.label) + '</option>';
    }).join('') +
  '</select>';
}

function filtersHtml() {
  var data = state.logs || {};
  var sourceOptions = [{ value: '', label: t('logs.allSources') }].concat(
    Object.keys(SOURCE_LABEL).map(function (key) { return { value: key, label: t(SOURCE_LABEL[key]) }; }),
  );
  var statusOptions = [
    { value: '', label: t('logs.allResults') },
    { value: 'success', label: t('logs.statusSuccess') },
    { value: 'failed', label: t('logs.statusFailed') },
  ];
  var actionOptions = [{ value: '', label: t('logs.allActions') }].concat(
    (data.actions || []).map(function (action) { return { value: action, label: action }; }),
  );
  var rangeOptions = RANGE_OPTIONS.map(function (opt) {
    return { value: opt.value, label: t(opt.label) };
  });

  return '<input type="text" id="logSearch" class="order-search" placeholder="' +
      esc(t('logs.searchPlaceholder')) + '" aria-label="' + esc(t('logs.searchPlaceholder')) +
      '" value="' + esc(filter.q) + '">' +
    selectHtml('logSource', t('logs.filterSource'), filter.source, sourceOptions) +
    selectHtml('logStatus', t('logs.filterStatus'), filter.status, statusOptions) +
    selectHtml('logAction', t('logs.filterAction'), filter.action, actionOptions) +
    selectHtml('logRange', t('logs.filterRange'), filter.range, rangeOptions) +
    (activeFilterCount()
      ? '<button type="button" class="btn btn--outline btn--xs" data-act="logs-clear">' +
        esc(t('logs.clearFilters')) + '</button>'
      : '');
}

export function renderLogs() {
  root.innerHTML = shell(
    t('logs.title'),
    filtersHtml(),
    '<div class="hint">' + esc(t('logs.retentionNote')) + '</div>' +
    summaryHtml() +
    '<div class="admin-card admin-card--form" id="logsCard">' + tableHtml() + '</div>',
  );

  bind();
}

/* الجدول وحدو يتبدّل — الفلاتر تبقى في بلاصتها والتركيز ما يضيعش */
async function refresh(resetPage) {
  if (resetPage) page = 1;
  var card = document.getElementById('logsCard');
  if (card) card.setAttribute('aria-busy', 'true');

  try {
    await loadLogs({ summary: false });
  } catch (error) {
    if (card) {
      card.innerHTML = stateBlock({ variant: 'error', title: t('state.errorTitle'), body: error.message });
    }
    return;
  }

  renderLogs();
}

function debounce(fn, ms) {
  var timer = null;
  return function () {
    var args = arguments;
    var self = this;
    window.clearTimeout(timer);
    timer = window.setTimeout(function () { fn.apply(self, args); }, ms);
  };
}

function bind() {
  var search = document.getElementById('logSearch');
  if (search) {
    search.addEventListener('input', debounce(function (event) {
      filter.q = event.target.value.trim();
      refresh(true).then(function () {
        var next = document.getElementById('logSearch');
        if (next) {
          next.focus();
          next.setSelectionRange(next.value.length, next.value.length);
        }
      });
    }, 350));
  }

  [['logSource', 'source'], ['logStatus', 'status'], ['logAction', 'action'], ['logRange', 'range']]
    .forEach(function (pair) {
      var node = document.getElementById(pair[0]);
      if (!node) return;
      node.addEventListener('change', function (event) {
        filter[pair[1]] = event.target.value;
        refresh(true);
      });
    });

  /* ⚠️ نحيّدو القديم قبل: الصفحة تتعاود ترسم في كل فلتر، ومستمع
     يتزاد في كل رندر يخلّي نقرة وحدة تفتح ثلاث نوافذ. */
  document.removeEventListener('click', onClick);
  document.addEventListener('click', onClick);
}

/* ⚠️ مستمع واحد على المستند: الصفحة تتعاود ترسم كاملة في كل فلتر،
   فمستمع على البطاقة يتكرّر مع كل رندر. `renderLogs` تنادي bind()
   كل مرّة، علاش نحيّدو القديم قبل ما نزيدو الجديد. */
function onClick(event) {
  var openBtn = event.target.closest('[data-act="log-open"]');
  if (openBtn) {
    var row = findRow(openBtn.getAttribute('data-id'));
    if (row) eventDetail(row);
    return;
  }

  var timelineBtn = event.target.closest('[data-act="log-timeline"]');
  if (timelineBtn) {
    orderTimeline(timelineBtn.getAttribute('data-order'));
    return;
  }

  var pageBtn = event.target.closest('[data-act="logs-page"]');
  if (pageBtn) {
    page = Number(pageBtn.getAttribute('data-page')) || 1;
    refresh(false);
    return;
  }

  var clearBtn = event.target.closest('[data-act="logs-clear"]');
  if (clearBtn) {
    filter = { q: '', source: '', status: '', action: '', range: '7' };
    refresh(true);
  }
}

function findRow(id) {
  var rows = (state.logs && state.logs.rows) || [];
  var found = rows.filter(function (row) { return row.id === id; })[0];
  if (found) return found;
  var critical = (state.logsSummary && state.logsSummary.critical) || [];
  return critical.filter(function (row) { return row.id === id; })[0] || null;
}

/* ── التفاصيل ────────────────────────────────────────────────────── */

function row(label, value) {
  if (value == null || value === '') return '';
  return '<dt>' + esc(label) + '</dt><dd>' + value + '</dd>';
}

function valueHtml(value) {
  if (value == null) return '<span class="row-item__meta">—</span>';
  if (typeof value === 'object') return '<code>' + esc(JSON.stringify(value)) + '</code>';
  return esc(String(value));
}

function changesHtml(event) {
  var before = event.oldValues || {};
  var after = event.newValues || {};
  var keys = Object.keys(before).concat(Object.keys(after)).filter(function (key, index, all) {
    return all.indexOf(key) === index;
  });

  if (!keys.length) return '<div class="hint">' + esc(t('logs.noChanges')) + '</div>';

  return '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th scope="col">' + esc(t('logs.changeField')) + '</th>' +
      '<th scope="col">' + esc(t('logs.changeBefore')) + '</th>' +
      '<th scope="col">' + esc(t('logs.changeAfter')) + '</th>' +
    '</tr></thead><tbody>' +
    keys.map(function (key) {
      return '<tr><td>' + esc(key) + '</td>' +
        '<td>' + valueHtml(before[key]) + '</td>' +
        '<td>' + valueHtml(after[key]) + '</td></tr>';
    }).join('') +
  '</tbody></table></div>';
}

function eventDetail(event) {
  var sourceKey = SOURCE_LABEL[event.source];

  var body =
    '<div class="order-detail">' +
      '<div class="order-detail__cols">' +
        '<div>' +
          '<dl>' +
            row(t('logs.fieldWhen'), esc(fmtDateTime(event.at))) +
            row(t('logs.fieldActor'), esc(event.actorName || '—') +
              (event.actorType ? ' <span class="row-item__meta">' + esc(event.actorType) + '</span>' : '')) +
            row(t('logs.fieldSource'), esc(sourceKey ? t(sourceKey) : event.source)) +
            row(t('logs.fieldAction'), '<code>' + esc(event.action) + '</code>') +
            row(t('logs.fieldResult'), resultBadge(event)) +
            row(t('logs.fieldDescription'), esc(event.description || '')) +
            row(t('logs.fieldError'), event.error ? '<span class="log-error">' + esc(event.error) + '</span>' : '') +
          '</dl>' +
        '</div>' +
        '<div>' +
          '<dl>' +
            row(t('logs.fieldEntity'), event.entityType
              ? esc(event.entityType) + (event.entityId ? ' · <code>' + esc(event.entityId) + '</code>' : '')
              : '') +
            row(t('logs.fieldOrder'), event.orderId
              ? '<button type="button" class="dt-link" data-act="log-timeline" data-order="' + esc(event.orderId) +
                '"><span class="dt-link__name">' + esc(event.orderId) + '</span></button>'
              : '') +
            row(t('logs.fieldProduct'), esc(event.productId || '')) +
            row(t('logs.fieldCustomer'), event.customerPhone ? esc(maskPhone(event.customerPhone)) : '') +
            row(t('logs.fieldRequestId'), event.requestId ? '<code>' + esc(event.requestId) + '</code>' : '') +
            row(t('logs.fieldIp'), esc(event.ip || '')) +
            row(t('logs.fieldUserAgent'), esc(event.userAgent || '')) +
            row(t('logs.fieldChat'), esc(event.telegramChatId || '')) +
            row(t('logs.fieldMessage'), esc(event.telegramMessageId || '')) +
            row(t('logs.fieldUpdate'), esc(event.telegramUpdateId || '')) +
            row(t('logs.fieldMetadata'), event.metadata ? '<code>' + esc(JSON.stringify(event.metadata)) + '</code>' : '') +
          '</dl>' +
        '</div>' +
      '</div>' +
      '<h4>' + esc(t('logs.changesTitle')) + '</h4>' +
      changesHtml(event) +
    '</div>';

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal modal--wide">' +
    '<h3>' + esc(t('logs.detailTitle')) + '</h3>' +
    body +
    '<div class="modal__foot">' +
      (event.orderId
        ? '<button class="btn btn--outline btn--xs" data-act="log-timeline" data-order="' + esc(event.orderId) + '">' +
          esc(t('logs.timelineOpen')) + '</button>'
        : '') +
      '<button class="btn btn--outline btn--xs" data-close>' + esc(t('common.back')) + '</button>' +
    '</div>' +
  '</div>';

  mountModal(overlay);
}

/* ── الخطّ الزمني تاع طلب ─────────────────────────────────────────── */

export function timelineHtml(events) {
  if (!events || !events.length) return '<div class="hint">' + esc(t('logs.timelineEmpty')) + '</div>';

  return '<ol class="log-timeline">' +
    events.map(function (event) {
      return '<li class="log-timeline__item' + (event.status === 'failed' ? ' is-failed' : '') + '">' +
        '<div class="log-timeline__when">' + esc(fmtDateTime(event.at)) + '</div>' +
        '<div class="log-timeline__what">' +
          '<b>' + esc(event.description || event.action) + '</b>' +
          '<span class="row-item__meta">' + esc(event.action) + ' · ' +
            esc(SOURCE_LABEL[event.source] ? t(SOURCE_LABEL[event.source]) : event.source) +
            (event.actorName ? ' · ' + esc(event.actorName) : '') + '</span>' +
          (event.error ? '<span class="row-item__meta">⚠️ ' + esc(event.error) + '</span>' : '') +
        '</div>' +
      '</li>';
    }).join('') +
  '</ol>';
}

export async function orderTimeline(orderId) {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal">' +
    '<h3>' + esc(t('logs.timelineTitle')) + '</h3>' +
    '<div class="hint">' + esc(t('logs.timelineFor', { id: orderId })) + '</div>' +
    '<div id="timelineBody"><div class="sk sk--line"></div></div>' +
    '<div class="modal__foot"><button class="btn btn--outline btn--xs" data-close>' +
      esc(t('common.back')) + '</button></div>' +
  '</div>';

  mountModal(overlay);

  var target = overlay.querySelector('#timelineBody');
  try {
    var res = await api('logs.order', { id: orderId });
    if (target) target.innerHTML = timelineHtml(res.events);
  } catch (error) {
    if (target) {
      target.innerHTML = stateBlock({ variant: 'error', title: t('state.errorTitle'), body: error.message });
    }
  }
}
