/*
 * صفّ المكالمات — الصفحة اللي منها يتخدم الشغل.
 *
 * ⚠️ علاش ماشي جدول كيما صفحة الطلبات: الجدول للقراءة، هذي للعمل.
 * كل سطر فيه الرقم اللي تنقر عليه وتعيّط، وأزرار النتيجة قدّامك
 * مباشرة — نقرة وحدة على "ما جاوبش" وتفوت للسطر اللي بعدو. لو خبّينا
 * النتائج جوّا نافذة، مايتين طلب في النهار يولّيو مايتين نافذة تتحلّ
 * وتتسكّر.
 *
 * الترتيب والحالة ما يتحسبوش هنا — يجيو محسوبين من الخادم
 * (lib/calls.mjs)، باش الرقم في البادج والرقم في اللائحة يبقاو واحد.
 */
import { state } from '../state.js';
import { esc, toast } from '../dom.js';
import { fmtMoney, fmtDateTime } from '../format.js';
import { t } from '../i18n.js';
import { api } from '../api.js';
import { shell } from '../ui/shell.js';
import { stateBlock } from '../ui/state-block.js';
import { mountModal } from '../ui/dialog.js';

var root = document.getElementById('adminRoot');
var filter = 'all';

var FILTERS = [
  { value: 'all', label: 'queue.filterAll' },
  { value: 'confirmed', label: 'queue.filterConfirmed' },
  { value: 'due', label: 'queue.filterDue' },
  { value: 'stalled', label: 'queue.filterStalled' },
  { value: 'waiting', label: 'queue.filterWaiting' },
];

var STATE_LABEL = {
  confirmed: 'queue.stateConfirmed',
  due: 'queue.stateDue',
  stalled: 'queue.stateStalled',
  waiting: 'queue.stateWaiting',
};

var OUTCOME_LABEL = {
  reached: 'queue.outcomeReached',
  'no-answer': 'queue.outcomeNoAnswer',
  busy: 'queue.outcomeBusy',
  off: 'queue.outcomeOff',
  callback: 'queue.outcomeCallback',
  wrong: 'queue.outcomeWrong',
};

/* ── وقت مقروء ────────────────────────────────────────────────────
 *
 * "منذ ساعتين" تخدم أحسن من "14:20" كي تكون تقرا عشرين سطر ورا بعضهم:
 * السؤال ماشي "وقتاش عيّطنا" بل "قداش هذا وهو يستنّى".
 */
function since(iso) {
  var minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes + 'm ago';
  var hours = Math.round(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.round(hours / 24) + 'd ago';
}

function until(iso) {
  var minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (minutes <= 0) return 'now';
  if (minutes < 60) return 'in ' + minutes + 'm';
  var hours = Math.round(minutes / 60);
  if (hours < 24) return 'in ' + hours + 'h';
  return fmtDateTime(iso);
}

/* ── سطر ──────────────────────────────────────────────────────────── */

function attemptLine(row) {
  var calls = row.calls || [];
  if (!calls.length) return esc(t('queue.neverCalled'));

  var last = calls[calls.length - 1];
  var line = esc(t('queue.attempts', {
    n: calls.length,
    outcome: t(OUTCOME_LABEL[last.outcome] || last.outcome),
    when: since(last.at),
  }));
  if (last.note) line += ' <span class="queue-row__note">“' + esc(last.note) + '”</span>';
  return line;
}

function metaLine(row) {
  var parts = [esc(row.phone)];
  if (row.wilaya) parts.push(esc(row.wilaya) + (row.commune ? ', ' + esc(row.commune) : ''));
  if (row.total) parts.push(esc(fmtMoney(row.total)));
  return parts.join(' · ');
}

/*
 * الأزرار. النتيجتين الأكثر تكراراً بايّنين، والباقي في نافذة —
 * ستّة أزرار في كل سطر يخلّيو العين تقرا بدل ما تنقر.
 */
function actionsHtml(row) {
  var id = esc(row.id);
  var wa = 'https://wa.me/213' + String(row.phone || '').replace(/\D/g, '').replace(/^0/, '');

  var call =
    '<a class="btn btn--outline btn--xs" href="tel:' + esc(row.phone) + '">' + esc(t('queue.call')) + '</a>' +
    '<a class="btn btn--outline btn--xs" href="' + esc(wa) + '" target="_blank" rel="noopener">' + esc(t('queue.whatsapp')) + '</a>';

  var log =
    '<button type="button" class="btn btn--outline btn--xs" data-act="queue-log" data-id="' + id + '" data-outcome="no-answer">' +
      esc(t('queue.logNoAnswer')) + '</button>' +
    '<button type="button" class="btn btn--outline btn--xs" data-act="queue-log" data-id="' + id + '" data-outcome="reached">' +
      esc(t('queue.logReached')) + '</button>' +
    '<button type="button" class="btn btn--outline btn--xs" data-act="queue-log-more" data-id="' + id + '">' +
      esc(t('queue.logMore')) + '</button>';

  /* الـ lead ما فيهش قبول: ما كاينش طلب باش تقبلو — الزبون هو اللي
     يكمّل من الصفحة. اللي يقدر يصرا هو تحيّدو من الصفّ. */
  var decide = row.isLead
    ? '<button type="button" class="btn btn--outline btn--xs btn--danger" data-act="queue-dismiss" data-id="' + id + '">' +
        esc(t('queue.dismiss')) + '</button>'
    : '<button type="button" class="btn btn--primary btn--xs" data-act="queue-accept" data-id="' + id + '">' +
        esc(t('queue.accept')) + '</button>' +
      '<button type="button" class="btn btn--outline btn--xs btn--danger" data-act="queue-deny" data-id="' + id + '">' +
        esc(t('queue.deny')) + '</button>';

  return '<div class="queue-row__actions">' +
      '<div class="queue-row__group">' + call + '</div>' +
      '<div class="queue-row__group">' + log + '</div>' +
      '<div class="queue-row__group">' + decide + '</div>' +
    '</div>';
}

function rowHtml(row) {
  var queueState = row.queueState;
  var nextLine = queueState === 'waiting' && row.nextCallAt
    ? '<div class="queue-row__next">' + esc(t('queue.nextCall', { when: until(row.nextCallAt) })) + '</div>'
    : '';
  var stalledLine = queueState === 'stalled'
    ? '<div class="queue-row__next">' + esc(t('queue.stalledHint', { n: (row.calls || []).length })) + '</div>'
    : '';

  return '<article class="queue-row queue-row--' + esc(queueState) + '">' +
      '<div class="queue-row__head">' +
        '<span class="badge badge--queue-' + esc(queueState) + '">' + esc(t(STATE_LABEL[queueState] || queueState)) + '</span>' +
        (row.isLead ? '<span class="badge badge--order-lead">' + esc(t('queue.leadTag')) + '</span>' : '') +
        '<h3 class="queue-row__name">' + esc(row.name || '—') + '</h3>' +
        '<span class="queue-row__age">' + esc(since(row.createdAt)) + '</span>' +
      '</div>' +
      '<div class="queue-row__meta">' + metaLine(row) + '</div>' +
      '<div class="queue-row__calls">' + attemptLine(row) + '</div>' +
      nextLine + stalledLine +
      actionsHtml(row) +
    '</article>';
}

/* ── الصفحة ───────────────────────────────────────────────────────── */

function countsHtml() {
  var counts = state.queueCounts || {};
  var tiles = [
    ['queue.countConfirmed', counts.confirmed || 0, 'confirmed'],
    ['queue.countDue', counts.due || 0, 'due'],
    ['queue.countStalled', counts.stalled || 0, 'stalled'],
    ['queue.countWaiting', counts.waiting || 0, 'waiting'],
  ];
  return '<div class="queue-counts">' + tiles.map(function (tile) {
    return '<button type="button" class="queue-count queue-count--' + tile[2] +
        (filter === tile[2] ? ' is-active' : '') + '" data-act="queue-filter" data-filter="' + tile[2] + '">' +
        '<span class="queue-count__n">' + tile[1] + '</span>' +
        '<span class="queue-count__label">' + esc(t(tile[0])) + '</span>' +
      '</button>';
  }).join('') + '</div>';
}

function visibleRows() {
  var rows = state.queue || [];
  if (filter === 'all') return rows;
  return rows.filter(function (row) { return row.queueState === filter; });
}

function listHtml() {
  var rows = visibleRows();
  if (!rows.length) {
    var filtered = (state.queue || []).length > 0;
    return stateBlock({
      variant: 'empty',
      title: filtered ? t('queue.emptyFilteredTitle') : t('queue.emptyTitle'),
      body: filtered ? t('queue.emptyFilteredBody') : t('queue.emptyBody'),
    });
  }
  return '<div class="queue-list">' + rows.map(rowHtml).join('') + '</div>';
}

function bodyHtml() {
  return '<div class="hint order-hint">' + esc(t('queue.hint')) + '</div>' +
    countsHtml() +
    '<div id="queueList">' + listHtml() + '</div>';
}

export function renderQueue() {
  var actions =
    '<select id="queueFilter" aria-label="' + esc(t('queue.filterAriaLabel')) + '">' +
      FILTERS.map(function (opt) {
        return '<option value="' + opt.value + '"' + (filter === opt.value ? ' selected' : '') + '>' +
          esc(t(opt.label)) + '</option>';
      }).join('') +
    '</select>' +
    '<button type="button" class="btn btn--outline btn--xs" data-act="queue-refresh">' + esc(t('queue.refresh')) + '</button>';

  root.innerHTML = shell(t('queue.title'), actions, bodyHtml());

  document.getElementById('queueFilter').addEventListener('change', function (event) {
    filter = event.target.value;
    repaint();
  });

  root.querySelector('.admin__main').addEventListener('click', onQueueClick);
}

/** يعاود يرسم بلا ما يعاود يطلب من الخادم — بعد فلترة برك */
function repaint() {
  var list = document.getElementById('queueList');
  if (list) list.innerHTML = listHtml();
  var counts = document.querySelector('.queue-counts');
  if (counts) counts.outerHTML = countsHtml();
  var select = document.getElementById('queueFilter');
  if (select) select.value = filter;

  /* بادج القائمة الجانبية يتبدّل هنا بيدينا: الشاسي ما يتعاودش يترسم
     إلا كي تبدّل صفحة، وبادج يقول 7 وأنت راك تشوف 4 سطور يخلّي
     الواحد يشكّ في اللائحة كاملة. */
  var badge = document.querySelector('.nav-link[href="#/queue"] .nav-link__badge');
  if (badge) badge.textContent = state.queueDue > 99 ? '99+' : state.queueDue;
  if (badge && !state.queueDue) badge.remove();
}

/**
 * يجيب الصفّ من جديد بعد كل فعل.
 *
 * ⚠️ ما نبدّلوش السطر في المتصفّح بالجواب وحدو: الفعل يقدر يبدّل
 * ترتيب اللائحة كاملة (محاولة جديدة تدفع السطر لتحت، قبول يحيّدو)،
 * والترتيب يتحسب في الخادم. رحلة زائدة، بصح اللائحة اللي تشوفها
 * تبقى هي اللائحة الحقيقية.
 */
export async function reloadQueue() {
  var res = await api('queue.list');
  state.queue = res.rows;
  state.queueCounts = res.counts;
  state.queueDue = (res.counts.confirmed || 0) + (res.counts.due || 0) + (res.counts.stalled || 0);
  return res;
}

async function afterAction(message) {
  try {
    await reloadQueue();
    repaint();
    if (message) toast(message);
  } catch (error) {
    if (!error.unauthorized) toast(error.message, true);
  }
}

function rowById(id) {
  return (state.queue || []).filter(function (row) { return row.id === id; })[0];
}

/** الـ lead مفتاحو الرقم، والطلب مفتاحو id — نفس الأكشن يخدم للزوج */
function keyOf(row) {
  return row.isLead ? { kind: 'lead', phone: row.phone } : { kind: 'order', id: row.id };
}

async function logCall(row, outcome, extra) {
  try {
    var payload = Object.assign({ outcome: outcome }, keyOf(row), extra || {});
    var res = await api('queue.logCall', payload);
    await afterAction(t('queue.loggedCall', { n: (res.row.calls || []).length }));
  } catch (error) {
    if (!error.unauthorized) toast(error.message, true);
  }
}

async function onQueueClick(event) {
  var node = event.target.closest('[data-act]');
  if (!node) return;
  var act = node.getAttribute('data-act');

  if (act === 'queue-filter') {
    var picked = node.getAttribute('data-filter');
    filter = filter === picked ? 'all' : picked;
    repaint();
    return;
  }

  if (act === 'queue-refresh') { await afterAction(); return; }

  var row = rowById(node.getAttribute('data-id'));
  if (!row) return;

  if (act === 'queue-log') { await logCall(row, node.getAttribute('data-outcome')); return; }
  if (act === 'queue-log-more') { logModal(row); return; }

  if (act === 'queue-accept') {
    try {
      await api('orders.accept', { id: row.id });
      await afterAction(t('queue.accepted'));
    } catch (error) {
      if (!error.unauthorized) toast(error.message, true);
    }
    return;
  }

  if (act === 'queue-deny') { denyModal(row); return; }

  if (act === 'queue-dismiss') {
    try {
      await api('queue.dismissLead', { phone: row.phone });
      await afterAction(t('queue.dismissed'));
    } catch (error) {
      if (!error.unauthorized) toast(error.message, true);
    }
  }
}

/* ── النوافذ: نتيجة مفصّلة، وسبب الرفض ────────────────────────────── */

function logModal(row) {
  var options = Object.keys(OUTCOME_LABEL).map(function (value) {
    return '<option value="' + value + '">' + esc(t(OUTCOME_LABEL[value])) + '</option>';
  }).join('');

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal">' +
    '<h3>' + esc(t('queue.logTitle')) + ' — ' + esc(row.name || row.phone) + '</h3>' +
    '<div class="field">' +
      '<label for="qOutcome">' + esc(t('queue.logOutcome')) + '</label>' +
      '<select id="qOutcome">' + options + '</select>' +
    '</div>' +
    '<div class="field">' +
      '<label for="qCallbackAt">' + esc(t('queue.logCallbackAt')) + '</label>' +
      '<input type="datetime-local" id="qCallbackAt">' +
      '<p class="hint">' + esc(t('queue.logCallbackHint')) + '</p>' +
    '</div>' +
    '<div class="field">' +
      '<label for="qNote">' + esc(t('queue.logNote')) + '</label>' +
      '<input type="text" id="qNote" maxlength="200" placeholder="' + esc(t('queue.logNotePlaceholder')) + '">' +
    '</div>' +
    '<div class="modal__foot">' +
      '<button class="btn btn--outline btn--xs" data-close>' + esc(t('common.cancel')) + '</button>' +
      '<button class="btn btn--primary btn--xs" data-act="queue-log-save">' + esc(t('queue.logSave')) + '</button>' +
    '</div>' +
  '</div>';

  var close = mountModal(overlay);
  overlay.querySelector('[data-act="queue-log-save"]').addEventListener('click', async function () {
    var outcome = overlay.querySelector('#qOutcome').value;
    var at = overlay.querySelector('#qCallbackAt').value;
    var note = overlay.querySelector('#qNote').value;
    close();
    await logCall(row, outcome, {
      /* datetime-local يعطي وقت محلّي بلا منطقة — Date يقراه على أساس
         وقت الجهاز، وهو بالضبط اللي قصدو اللي كتبو */
      callbackAt: at ? new Date(at).toISOString() : null,
      note: note,
    });
  });
}

function denyModal(row) {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal">' +
    '<h3>' + esc(t('queue.denyTitle')) + ' — ' + esc(row.name || row.phone) + '</h3>' +
    '<div class="field">' +
      '<label for="qReason">' + esc(t('queue.denyReason')) + '</label>' +
      '<input type="text" id="qReason" maxlength="200" placeholder="' + esc(t('queue.denyPlaceholder')) + '">' +
      '<p class="hint">' + esc(t('queue.denyHint')) + '</p>' +
    '</div>' +
    '<div class="modal__foot">' +
      '<button class="btn btn--outline btn--xs" data-close>' + esc(t('common.cancel')) + '</button>' +
      '<button class="btn btn--danger-solid btn--xs" data-act="queue-deny-save">' + esc(t('queue.denyConfirm')) + '</button>' +
    '</div>' +
  '</div>';

  var close = mountModal(overlay);
  overlay.querySelector('[data-act="queue-deny-save"]').addEventListener('click', async function () {
    var reason = overlay.querySelector('#qReason').value.trim();
    if (!reason) { overlay.querySelector('#qReason').focus(); return; }
    close();
    try {
      await api('orders.deny', { id: row.id, reason: reason });
      await afterAction(t('queue.denied'));
    } catch (error) {
      if (!error.unauthorized) toast(error.message, true);
    }
  });
}
