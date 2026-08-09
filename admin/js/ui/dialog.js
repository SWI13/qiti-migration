/* ==========================================================================
   Qiti admin — نافذة تأكيد
   بديل confirm() الأصلي — بصح مع focus trap، Escape يسكّر، والفوكس
   يرجع للعنصر اللي فتحها (وصولية حقيقية، ماشي زخرفة).
   confirmDialog({ title, body, confirmLabel, danger }) → Promise<boolean>
   ========================================================================== */
import { esc } from '../dom.js';
import { t } from '../i18n.js';

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
          '<button type="button" class="btn btn--xs ' + (opts.danger ? 'btn--danger' : 'btn--primary') + '" data-dlg="confirm">' +
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
