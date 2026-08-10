/* ==========================================================================
   Qiti admin — نافذة تأكيد
   بديل confirm() الأصلي — بصح مع focus trap، Escape يسكّر، والفوكس
   يرجع للعنصر اللي فتحها (وصولية حقيقية، ماشي زخرفة).
   confirmDialog({ title, body, confirmLabel, danger }) → Promise<boolean>
   ========================================================================== */
import { esc } from '../dom.js';
import { t } from '../i18n.js';

/**
 * mountModal(overlay, onClose) → close()
 * النوافذ المبنية يدويًا (.modal-overlay في الطلبات/الفئات/اختيار صورة)
 * كانو تسكّرو بالضغط برك: بلا Escape، بلا حبس الفوكس، والفوكس ما يرجعش
 * لللي فتحها. هنا نلمّو نفس السلوك تاع confirmDialog في بلاصة وحدة.
 */
export function mountModal(overlay, onClose) {
  var trigger = document.activeElement;
  var box = overlay.querySelector('.modal');
  if (box) {
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
  }

  function focusable() {
    return overlay.querySelectorAll('button, [href], input, select, textarea, [data-pick]');
  }

  function close() {
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('hashchange', close);
    overlay.remove();
    if (trigger && typeof trigger.focus === 'function') trigger.focus();
    if (onClose) onClose();
  }

  function onKeydown(event) {
    if (event.key === 'Escape') { close(); return; }
    if (event.key !== 'Tab') return;
    var items = focusable();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  document.body.appendChild(overlay);
  overlay.addEventListener('click', function (event) {
    if (event.target === overlay || event.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', onKeydown);
  /* النافذة تعيش في document.body، وroute() ما يبدّل غير #adminRoot —
     بلا هذا، تنقّل والنافذة محلولة يخلّيها معلّقة فوق الصفحة الجديدة
     ومستمع الكيبورد تاعها مسجّل للأبد */
  window.addEventListener('hashchange', close);

  /* الفوكس يروح للحقل الأوّل إذا كان — وإلا للصندوق روحو. ما نعطيوهش
     لآخر زر: نافذة قراءة (تفاصيل الطلب) عندها زر وحيد تحت، وفوكسو
     يزحلق النافذة لتحت ويخبّي اللي حلّها المستخدم باش يقراه. */
  var firstField = overlay.querySelector('input, select, textarea, [data-pick]');
  if (firstField) firstField.focus();
  else if (box) { box.setAttribute('tabindex', '-1'); box.focus(); }

  return close;
}

export function confirmDialog(opts) {
  opts = opts || {};
  var trigger = document.activeElement;

  return new Promise(function (resolve) {
    var overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML =
      '<div class="dialog' + (opts.danger ? ' dialog--danger' : '') + '" role="alertdialog" aria-modal="true" ' +
        'aria-labelledby="dlgTitle" aria-describedby="dlgBody" tabindex="-1">' +
        '<div class="dialog__head"><h3 id="dlgTitle">' + esc(opts.title || '') + '</h3></div>' +
        '<div class="dialog__body" id="dlgBody">' + esc(opts.body || '') + '</div>' +
        '<div class="dialog__foot">' +
          '<button type="button" class="btn btn--outline btn--xs" data-dlg="cancel">' + esc(t('common.cancel')) + '</button>' +
          /* في نافذة تأكيد، الزر التخريبي هو الفعل الرئيسي — فيولّي
             مصمت (ماشي حدود برك كيما في الصفوف): وزنو البصري لازم
             يوافق خطورتو، وما يبقاش يبان ثانوي حدا "ألغي" */
          '<button type="button" class="btn btn--xs ' + (opts.danger ? 'btn--danger-solid' : 'btn--primary') + '" data-dlg="confirm">' +
            esc(opts.confirmLabel || t('common.confirm')) + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    var dialog = overlay.querySelector('.dialog');
    var buttons = overlay.querySelectorAll('button');

    function close(result) {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      if (trigger && typeof trigger.focus === 'function') trigger.focus();
      resolve(result);
    }

    function onKeydown(event) {
      if (event.key === 'Escape') { close(false); return; }
      if (event.key !== 'Tab') return;
      var first = buttons[0];
      var last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) { close(false); return; }
      var btn = event.target.closest('[data-dlg]');
      if (btn) close(btn.getAttribute('data-dlg') === 'confirm');
    });

    document.addEventListener('keydown', onKeydown);
    dialog.focus();
    overlay.querySelector('[data-dlg="confirm"]').focus();
  });
}
