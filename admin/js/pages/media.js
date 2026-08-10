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
import { confirmDialog } from '../ui/dialog.js';

var root = document.getElementById('adminRoot');

function mediaGrid(onPick) {
  return state.media.map(function (item) {
    return '<div class="media-item"' + (onPick ? ' data-pick="/media/' + esc(item.id) + '"' : '') + '>' +
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
      '<input type="file" id="mediaFile" accept="image/jpeg,image/png,image/webp,image/avif" multiple>' +
      '<span class="hint">' + esc(t('media.uploadHint')) + '</span>' +
    '</div>' +
    '<div class="media-grid">' + (mediaGrid(false) || stateBlock({
      variant: 'empty',
      title: t('media.emptyTitle'),
      body: t('media.emptyBody'),
      actionAct: 'focus-media-upload',
      actionLabel: t('media.uploadAction'),
    })) + '</div>');

  document.getElementById('mediaFile').addEventListener('change', async function (event) {
    var files = Array.prototype.slice.call(event.target.files || []);
    if (!files.length) return;
    toast(t('media.uploading'));
    for (var i = 0; i < files.length; i++) {
      try {
        await uploadFile(files[i]);
      } catch (error) {
        toast(error.message, true);
      }
    }
    state.media = (await api('media.list')).media;
    renderMedia();
    toast(t('media.uploaded'));
  });
}

async function uploadFile(file) {
  var form = new FormData();
  form.append('file', file);
  var response = await fetch('/.netlify/functions/media-upload', { method: 'POST', body: form });
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
        '<input type="file" id="pickUpload" accept="image/jpeg,image/png,image/webp,image/avif">' +
      '</div>' +
      '<div class="media-grid" id="pickGrid">' +
        (mediaGrid(true) || esc(t('media.pickEmpty'))) +
      '</div>' +
      '<div class="modal__foot"><button class="btn btn--outline btn--xs" data-close>' + esc(t('common.cancel')) + '</button></div>' +
    '</div>';

    document.body.appendChild(overlay);
    var done = function (value) { overlay.remove(); resolve(value); };

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay || event.target.hasAttribute('data-close')) { done(null); return; }
      var item = event.target.closest('[data-pick]');
      if (item) done(item.getAttribute('data-pick'));
    });

    overlay.querySelector('#pickUpload').addEventListener('change', async function (event) {
      var file = (event.target.files || [])[0];
      if (!file) return;
      try {
        var record = await uploadFile(file);
        state.media = (await api('media.list')).media;
        done('/media/' + record.id);
      } catch (error) {
        toast(error.message, true);
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
