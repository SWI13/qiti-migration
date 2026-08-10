/* ==========================================================================
   Qiti admin — الصور
   صفحة الميديا + نافذة اختيار صورة (تُستدعى من أي حقل image في أي محرّر).
   ========================================================================== */
import { state } from '../state.js';
import { api } from '../api.js';
import { esc, toast } from '../dom.js';
import { t } from '../i18n.js';
import { shell } from '../ui/shell.js';
import { stateBlock } from '../ui/state-block.js';
import { confirmDialog, mountModal } from '../ui/dialog.js';
import { showToast } from '../ui/toast.js';

var root = document.getElementById('adminRoot');

function mediaGrid(onPick) {
  return state.media.map(function (item) {
    return '<div class="media-item"' +
        (onPick ? ' data-pick="/media/' + esc(item.id) + '" role="button" tabindex="0"' : '') + '>' +
      '<img src="/media/' + esc(item.id) + '" alt="' + esc(item.alt || '') + '" loading="lazy">' +
      '<div class="media-item__foot">' +
        '<span class="media-item__name">' + esc(item.filename) + '</span>' +
        (onPick ? '' : '<button class="media-item__del" data-act="del-media" data-id="' + esc(item.id) + '" title="' + esc(t('common.delete')) + '">✕</button>') +
      '</div>' +
    '</div>';
  }).join('');
}

export function renderMedia() {
  root.innerHTML = shell(t('media.title'), '',
    '<div class="media-upload-row">' +
      '<input type="file" id="mediaFile" accept="image/jpeg,image/png,image/webp,image/avif" multiple' +
        ' aria-label="' + esc(t('media.uploadAriaLabel')) + '">' +
      '<span class="hint" id="mediaUploadStatus">' + esc(t('media.uploadHint')) + '</span>' +
    '</div>' +
    '<div class="media-grid">' + (mediaGrid(false) || stateBlock({
      variant: 'empty',
      title: t('media.emptyTitle'),
      body: t('media.emptyBody'),
      actionAct: 'focus-media-upload',
      actionLabel: t('media.uploadAction'),
    })) + '</div>');

  var fileInput = document.getElementById('mediaFile');
  var statusEl = document.getElementById('mediaUploadStatus');

  fileInput.addEventListener('change', async function (event) {
    var files = Array.prototype.slice.call(event.target.files || []);
    if (!files.length) return;

    fileInput.disabled = true;
    var succeeded = 0;
    var failed = [];

    for (var i = 0; i < files.length; i++) {
      statusEl.textContent = t('media.uploadingProgress', { current: i + 1, total: files.length });
      try {
        await uploadFile(files[i]);
        succeeded++;
      } catch (error) {
        failed.push(files[i].name);
      }
    }

    /* رفعة وحدة نجحت تكفي باش نعاودو نجيبو القائمة — إذا الكل طاح، ما
       ثمّة والو جديد يستاهل طلب شبكة زايد */
    if (succeeded > 0) {
      try {
        state.media = (await api('media.list')).media;
        renderMedia();
      } catch (error) {
        /* الرفع نجح بصح جلب القائمة طاح — بلا هذا الحرس، الحقل يبقى
           معطّل للأبد والمستخدم يحسب بلي الرفع مازال جاري */
        fileInput.disabled = false;
        fileInput.value = '';
        statusEl.textContent = t('media.uploadHint');
        toast(error.message, true);
        return;
      }
    } else {
      fileInput.disabled = false;
      fileInput.value = '';
      statusEl.textContent = t('media.uploadHint');
    }

    /* ملخّص واحد يقول بالضبط واش صار — توست "تمّ" وحدو كان يخبّي فشل
       جزئي (بعض الصور تعدّاو، بعضهم لا) وكان يخلّي المستخدم يحسب يدويًا */
    if (!failed.length) {
      toast(t('media.uploadedCount', { n: succeeded }));
    } else if (succeeded > 0) {
      showToast({ message: t('media.uploadedPartial', { ok: succeeded, fail: failed.length }), variant: 'info' });
    } else {
      toast(t('media.uploadFailedAll', { n: failed.length }), true);
    }
  });
}

async function uploadFile(file) {
  var form = new FormData();
  form.append('file', file);
  var response = await fetch('/api/media-upload', { method: 'POST', body: form });
  var data = await response.json().catch(function () { return {}; });
  if (!response.ok) throw new Error(data.error || 'Failed to upload ' + file.name);
  return data;
}

/* نافذة اختيار صورة — ترجع وعد بالرابط ولا null */
export async function pickMedia() {
  /* اللوحة تقدر تكون فتحات على محرّر مباشرةً بلا ما تعدّي على صفحة
     الصور — فنجيبو القائمة هنا إذا مازال ما تحمّلتش */
  if (!state.media.length) {
    state.media = (await api('media.list')).media.filter(Boolean);
  }

  return new Promise(function (resolve) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal">' +
      '<h3>' + esc(t('media.pickTitle')) + '</h3>' +
      '<div class="media-upload-row">' +
        '<input type="file" id="pickUpload" accept="image/jpeg,image/png,image/webp,image/avif"' +
          ' aria-label="' + esc(t('media.uploadAriaLabel')) + '">' +
      '</div>' +
      '<div class="media-grid" id="pickGrid">' +
        (mediaGrid(true) || esc(t('media.pickEmpty'))) +
      '</div>' +
      '<div class="modal__foot"><button class="btn btn--outline btn--xs" data-close>' + esc(t('common.cancel')) + '</button></div>' +
    '</div>';

    var settled = false;
    var close = mountModal(overlay, function () { if (!settled) { settled = true; resolve(null); } });
    var done = function (value) { settled = true; close(); resolve(value); };

    overlay.addEventListener('click', function (event) {
      var item = event.target.closest('[data-pick]');
      if (item) done(item.getAttribute('data-pick'));
    });

    /* role="button" ما يعطيش سلوك الكيبورد بروحو */
    overlay.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      var item = event.target.closest('[data-pick]');
      if (!item) return;
      event.preventDefault();
      done(item.getAttribute('data-pick'));
    });

    var pickUpload = overlay.querySelector('#pickUpload');
    pickUpload.addEventListener('change', async function (event) {
      var file = (event.target.files || [])[0];
      if (!file) return;
      pickUpload.disabled = true;
      try {
        var record = await uploadFile(file);
        state.media = (await api('media.list')).media;
        done('/media/' + record.id);
      } catch (error) {
        toast(error.message, true);
        pickUpload.disabled = false;
        pickUpload.value = '';
      }
    });
  });
}

export async function deleteMedia(id) {
  var ok = await confirmDialog({
    title: t('media.deleteConfirmTitle'),
    body: t('media.deleteConfirmBody'),
    confirmLabel: t('common.delete'),
    danger: true,
  });
  if (!ok) return;
  try {
    await api('media.delete', { id: id });
    state.media = (await api('media.list')).media;
    renderMedia();
  } catch (error) {
    toast(error.message, true);
  }
}
