/* ==========================================================================
   Qiti admin — الفئات (قائمة + نافذة تعديل)
   ========================================================================== */
import { state } from '../state.js';
import { api } from '../api.js';
import { esc, toast } from '../dom.js';
import { t } from '../i18n.js';
import { ICONS } from '../section-fields.js';
import { shell } from '../ui/shell.js';
import { stateBlock } from '../ui/state-block.js';

var root = document.getElementById('adminRoot');

export function renderCategories() {
  var rows = state.categories.map(function (category) {
    return '<div class="row-item">' +
        '<div>' +
          '<div class="row-item__name"><bdi>' + esc(category.name) + '</bdi></div>' +
          '<div class="row-item__meta">/c/' + esc(category.slug) + '</div>' +
        '</div>' +
        '<span class="badge">' + Number(category.sort || 0) + '</span>' +
        '<div class="row-item__actions">' +
          '<button class="btn btn--outline btn--xs" data-act="edit-category" data-id="' + esc(category.id) + '">' + esc(t('common.edit')) + '</button>' +
        '</div>' +
      '</div>';
  }).join('');

  root.innerHTML = shell(
    t('categories.title'),
    '<button class="btn btn--primary" data-act="edit-category" data-id="">' + esc(t('categories.new')) + '</button>',
    '<div class="admin-card"><div class="row-list">' +
      (rows || stateBlock({
        variant: 'empty',
        title: t('categories.emptyTitle'),
        body: t('categories.emptyBody'),
        actionAct: 'edit-category',
        actionId: '',
        actionLabel: t('categories.new'),
      })) +
    '</div></div>',
  );
}

export function categoryModal(category) {
  var draft = Object.assign({ name: '', slug: '', tagline: '', icon: '', sort: 0 }, category || {});
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal">' +
    '<h3>' + esc(category ? t('categories.editTitle') : t('categories.newTitle')) + '</h3>' +
    '<div class="field"><label>' + esc(t('categories.name')) + '</label><input type="text" id="catName" value="' + esc(draft.name) + '" dir="auto"></div>' +
    '<div class="field"><label>' + esc(t('categories.slug')) + '</label><input type="text" id="catSlug" value="' + esc(draft.slug) + '"></div>' +
    '<div class="field"><label>' + esc(t('categories.tagline')) + '</label><input type="text" id="catTagline" value="' + esc(draft.tagline) + '" dir="auto"></div>' +
    '<div class="field"><label>' + esc(t('categories.icon')) + '</label><select id="catIcon"><option value="">' + esc(t('common.none')) + '</option>' +
      ICONS.map(function (name) {
        return '<option value="' + name + '"' + (draft.icon === name ? ' selected' : '') + '>' + name + '</option>';
      }).join('') + '</select></div>' +
    '<div class="field"><label>' + esc(t('categories.sort')) + '</label><input type="number" id="catSort" value="' + Number(draft.sort || 0) + '"></div>' +
    '<div class="modal__foot">' +
      '<button class="btn btn--outline btn--xs" data-close>' + esc(t('common.cancel')) + '</button>' +
      '<button class="btn btn--primary btn--xs" id="catSave">' + esc(t('common.save')) + '</button>' +
    '</div></div>';

  document.body.appendChild(overlay);
  var close = function () { overlay.remove(); };
  overlay.addEventListener('click', function (event) {
    if (event.target === overlay || event.target.hasAttribute('data-close')) close();
  });

  overlay.querySelector('#catSave').addEventListener('click', async function () {
    try {
      await api('categories.save', {
        category: {
          id: draft.id,
          name: overlay.querySelector('#catName').value,
          slug: overlay.querySelector('#catSlug').value,
          tagline: overlay.querySelector('#catTagline').value,
          icon: overlay.querySelector('#catIcon').value || null,
          sort: Number(overlay.querySelector('#catSort').value) || 0,
        },
      });
      close();
      state.categories = (await api('categories.list')).categories;
      renderCategories();
      toast(t('categories.saved'));
    } catch (error) {
      toast(error.message, true);
    }
  });
}
