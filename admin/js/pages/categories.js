/* ==========================================================================
   Qiti admin — الفئات (شبكة بطاقات + نافذة تعديل + جاهزين)
   ⚠️ admin-api.mjs ما فيهش categories.delete — الحذف ماشي مدعوم من
   السيرفر دروك، فالقائمة تعرض تعديل برك (شوف تقرير التسليم للتفاصيل).

   الشكل: بطاقات ماشي صفوف. الفئة عندها لون وإيموجي — معلومة بصرية
   ما تتقراش في سطر جدول، والتاجر يعرف فئتو بالشكل قبل ما يقرا الاسم.
   ========================================================================== */
import { state } from '../state.js';
import { api } from '../api.js';
import { esc, toast } from '../dom.js';
import { t } from '../i18n.js';
import { shell } from '../ui/shell.js';
import { stateBlock } from '../ui/state-block.js';
import { mountModal } from '../ui/dialog.js';
import { validate, showErrors, clearErrors } from '../ui/form.js';

var root = document.getElementById('adminRoot');

var CATEGORY_RULES = {
  name: { required: true, maxLength: 60 },
  slug: { required: true, slug: true },
};

/* لوحة ألوان الفئات — نفس الألوان اللي في lib/category-presets.mjs.
   عشرة برك: قائمة أطول تخلّي الاختيار بالحدس، والفئات كامل تولّي
   متشابهة في الشكل بدل ما تتفرّق. */
var COLORS = ['#FF6B2C', '#16A34A', '#6366F1', '#0EA5E9', '#EC4899',
  '#A855F7', '#EF4444', '#F43F5E', '#EAB308', '#64748B'];

var DEFAULT_COLOR = '#64748B';

/* الإيموجي والوصف اختياريين — الفئة القديمة (بلا الزوج) لازم تبقى
   تتقرا. الحرف الأول من الاسم يخدم كبديل مقبول. */
function badgeChar(category) {
  if (category.emoji) return category.emoji;
  var name = String(category.name || '?').trim();
  return name ? name.slice(0, 1) : '?';
}

function countProducts(categoryId) {
  return state.products.filter(function (product) {
    return product.categoryId === categoryId;
  }).length;
}

function categoryCard(category) {
  var color = category.color || DEFAULT_COLOR;
  var count = countProducts(category.id);

  /* اللون يجي من normalizeColor في catalog.mjs — hex برك، ولا null.
     يعني ما يقدرش يخرج من قيمة الـ CSS ويحقن قاعدة أخرى. */
  return '<div class="cat-card" style="--cat-color:' + esc(color) + '">' +
      '<div class="cat-card__badge" aria-hidden="true">' + esc(badgeChar(category)) + '</div>' +
      '<div class="cat-card__body">' +
        '<div class="cat-card__name"><bdi>' + esc(category.name) + '</bdi></div>' +
        (category.tagline
          ? '<div class="cat-card__tagline"><bdi>' + esc(category.tagline) + '</bdi></div>'
          : '') +
        '<div class="cat-card__meta">' +
          '<span class="cat-card__slug">/c/' + esc(category.slug) + '</span>' +
          '<span class="badge">' + esc(t('categories.productCount', { n: count })) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="cat-card__actions">' +
        '<button class="btn btn--outline btn--xs" data-act="edit-category" data-id="' + esc(category.id) + '">' +
          esc(t('common.edit')) +
        '</button>' +
      '</div>' +
    '</div>';
}

export function renderCategories() {
  var cards = state.categories.map(categoryCard).join('');

  var actions = '<button class="btn btn--outline" data-act="category-presets">' +
      esc(t('categories.fromPresets')) + '</button>' +
    '<button class="btn btn--primary" data-act="edit-category" data-id="">' +
      esc(t('categories.new')) + '</button>';

  root.innerHTML = shell(
    t('categories.title'),
    actions,
    cards
      ? '<div class="cat-grid">' + cards + '</div>'
      : '<div class="admin-card">' + stateBlock({
        variant: 'empty',
        title: t('categories.emptyTitle'),
        body: t('categories.emptyBody'),
        actionAct: 'category-presets',
        actionLabel: t('categories.fromPresets'),
      }) + '</div>',
  );
}

/* ── نافذة التعديل ──────────────────────────────────────────────── */

function colorSwatches(selected) {
  return '<div class="swatches" role="radiogroup" aria-label="' + esc(t('categories.color')) + '">' +
    COLORS.map(function (color) {
      var isOn = String(selected || '').toUpperCase() === color;
      return '<button type="button" class="swatch' + (isOn ? ' is-on' : '') + '"' +
        ' style="--sw:' + color + '" data-color="' + color + '"' +
        ' role="radio" aria-checked="' + (isOn ? 'true' : 'false') +
        '" aria-label="' + esc(color) + '"></button>';
    }).join('') +
  '</div>';
}

export function categoryModal(category) {
  var draft = Object.assign(
    { name: '', slug: '', tagline: '', emoji: '', color: '', sort: 0 },
    category || {},
  );
  /* الفئات القدام حطّو الإيموجي في `icon` — catalog.mjs يرقّيهم عند
     أوّل حفظ، بصح النافذة لازم تعرضو حتى قبل ذاك الحفظ */
  var startEmoji = draft.emoji || (String(draft.icon || '').indexOf('i-') === 0 ? '' : draft.icon || '');
  var color = draft.color || '';

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal">' +
    '<h3>' + esc(category ? t('categories.editTitle') : t('categories.newTitle')) + '</h3>' +
    '<div class="field"><label for="catName">' + esc(t('categories.name')) + '</label>' +
      '<input type="text" id="catName" value="' + esc(draft.name) + '" dir="auto"></div>' +
    '<div class="field"><label for="catSlug">' + esc(t('categories.slug')) + '</label>' +
      '<input type="text" id="catSlug" value="' + esc(draft.slug) + '"></div>' +
    '<div class="field"><label for="catTagline">' + esc(t('categories.tagline')) + '</label>' +
      '<input type="text" id="catTagline" value="' + esc(draft.tagline) + '" dir="auto"></div>' +
    /* إيموجي بدل قائمة أيقونات sprite: القائمة القديمة كانت تخزّن
       أسماء ('i-pin') ما يعرضها حتى بلاصة — لا اللوحة لا المتجر.
       الإيموجي يبان في الزوج بلا ما نزيدو sprite جديد لكل فئة. */
    '<div class="form-grid">' +
      '<div class="field"><label for="catEmoji">' + esc(t('categories.emoji')) + '</label>' +
        '<input type="text" id="catEmoji" maxlength="4" value="' + esc(startEmoji) + '" ' +
        'placeholder="🐾" autocomplete="off"></div>' +
      '<div class="field"><label for="catSort">' + esc(t('categories.sort')) + '</label>' +
        '<input type="number" id="catSort" value="' + Number(draft.sort || 0) + '"></div>' +
    '</div>' +
    '<div class="field"><label>' + esc(t('categories.color')) + '</label>' + colorSwatches(color) + '</div>' +
    '<div class="modal__foot">' +
      '<button class="btn btn--outline btn--xs" data-close>' + esc(t('common.cancel')) + '</button>' +
      '<button class="btn btn--primary btn--xs" id="catSave">' + esc(t('common.save')) + '</button>' +
    '</div></div>';

  var close = mountModal(overlay);
  var modal = overlay.querySelector('.modal');
  var saveBtn = overlay.querySelector('#catSave');
  var saving = false;

  /* الاختيار يعيش في متغيّر ماشي في الـ DOM: الحفظ يقراه من هنا،
     والـ DOM يعرض برك — بلا هذا لازم نقلّبو على .is-on وقت الحفظ */
  overlay.querySelector('.swatches').addEventListener('click', function (event) {
    var swatch = event.target.closest('.swatch');
    if (!swatch) return;
    color = swatch.getAttribute('data-color');
    Array.prototype.forEach.call(overlay.querySelectorAll('.swatch'), function (node) {
      var on = node === swatch;
      node.classList.toggle('is-on', on);
      node.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  });

  saveBtn.addEventListener('click', async function () {
    if (saving) return;   // بلا هذا الحرس، ضغطة مزدوجة تبعث حفظتين للسيرفر

    var values = {
      name: overlay.querySelector('#catName').value,
      slug: overlay.querySelector('#catSlug').value,
    };
    var result = validate(values, CATEGORY_RULES);
    if (!result.ok) { showErrors(modal, result.errors); return; }
    clearErrors(modal);

    saving = true;
    saveBtn.classList.add('is-busy');
    try {
      await api('categories.save', {
        category: {
          id: draft.id,
          name: values.name,
          slug: values.slug,
          tagline: overlay.querySelector('#catTagline').value,
          emoji: overlay.querySelector('#catEmoji').value,
          color: color || null,
          sort: Number(overlay.querySelector('#catSort').value) || 0,
        },
      });
      close();
      await refresh();
      toast(t('categories.saved'));
    } catch (error) {
      toast(error.message, true);
    } finally {
      saving = false;
      saveBtn.classList.remove('is-busy');
    }
  });
}

/* ── الفئات الجاهزة ─────────────────────────────────────────────── */

/* التصنيفة تسكن في lib/category-presets.mjs (السيرفر) — نجيبوها مرّة
   وحدة ونحتفظو بيها: هي ثابتة، ما تتبدّلش بين طلب وآخر. */
var presetsCache = null;

async function loadPresets() {
  if (!presetsCache) presetsCache = (await api('categories.presets')).presets;
  return presetsCache;
}

async function refresh() {
  state.categories = (await api('categories.list')).categories;
  renderCategories();
}

export async function presetPicker() {
  var presets;
  try {
    presets = await loadPresets();
  } catch (error) {
    toast(error.message, true);
    return;
  }

  var taken = {};
  state.categories.forEach(function (category) {
    taken[String(category.slug).toLowerCase()] = true;
  });

  var rows = presets.map(function (preset) {
    var already = taken[preset.slug];
    return '<label class="preset' + (already ? ' is-taken' : '') + '">' +
        '<input type="checkbox" value="' + esc(preset.slug) + '"' + (already ? ' disabled' : '') + '>' +
        '<span class="preset__badge" style="--cat-color:' + esc(preset.color) + '" aria-hidden="true">' +
          esc(preset.emoji) + '</span>' +
        '<span class="preset__text">' +
          '<span class="preset__name"><bdi>' + esc(preset.name) + '</bdi></span>' +
          '<span class="preset__tagline"><bdi>' + esc(preset.tagline) + '</bdi></span>' +
        '</span>' +
        (already ? '<span class="badge">' + esc(t('categories.presetTaken')) + '</span>' : '') +
      '</label>';
  }).join('');

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal modal--wide">' +
    '<h3>' + esc(t('categories.presetsTitle')) + '</h3>' +
    '<p class="modal__sub">' + esc(t('categories.presetsBody')) + '</p>' +
    '<div class="preset-list">' + rows + '</div>' +
    '<div class="modal__foot">' +
      '<button class="btn btn--outline btn--xs" data-close>' + esc(t('common.cancel')) + '</button>' +
      '<button class="btn btn--primary btn--xs" id="presetAdd">' + esc(t('categories.presetAdd')) + '</button>' +
    '</div></div>';

  var close = mountModal(overlay);
  var addBtn = overlay.querySelector('#presetAdd');
  var busy = false;

  addBtn.addEventListener('click', async function () {
    if (busy) return;
    var slugs = Array.prototype.filter
      .call(overlay.querySelectorAll('.preset input:checked'), function (box) { return !box.disabled; })
      .map(function (box) { return box.value; });

    if (!slugs.length) { toast(t('categories.presetPickOne'), true); return; }

    busy = true;
    addBtn.classList.add('is-busy');
    try {
      var res = await api('categories.seedPresets', { slugs: slugs });
      close();
      /* الجواب فيه القائمة الطرية — ما نعاودوش نطلبوها */
      state.categories = res.categories;
      renderCategories();
      toast(t('categories.presetsAdded', { n: res.created.length }));
    } catch (error) {
      toast(error.message, true);
    } finally {
      busy = false;
      addBtn.classList.remove('is-busy');
    }
  });
}
