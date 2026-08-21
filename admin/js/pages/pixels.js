/*
 * صفحة البيكسلات — بيكسل تيك توك لكل صفحة من صفحات الموقع.
 *
 * علاش صفحة وحدها ماشي خانة في محرّر الحملة: البيكسل ماشي جزء من
 * تصميم الصفحة، هو إعداد إعلاني. اللي يبدّل البيكسلات يبدّلهم كلهم في
 * نفس اللحظة (حساب إعلاني جديد، بيكسل تبدّل) — ولو كانو مفرّقين في
 * محرّرات، لازم تحلّ كل حملة وحدة وحدة، وتنسى وحدة.
 *
 * التخزين ماشي في بلاصة وحدة، وهذا بقصد:
 *   الصفحة الرئيسية → الإعدادات (settings.tiktokPixelMain)
 *   كل حملة         → في سجلّ الحملة (campaign.tiktokPixelId)
 * هكذا نسخ حملة يجي معاه بيكسلها، ومسحها يمسحو معاها.
 *
 * خانة فارغة في حملة = ترث بيكسل الرئيسية.
 */
import { state } from '../state.js';
import { api } from '../api.js';
import { esc, toast } from '../dom.js';
import { t } from '../i18n.js';
import { shell } from '../ui/shell.js';
import { markClean } from '../ui/form.js';

var root = document.getElementById('adminRoot');

/* نفس القاعدة تاع السيرفر (lib/tiktok.mjs) — لو تفرّقو، اللوحة تقبل
   قيمة والسيرفر يحيّدها بصمت، والمشغّل يحسب البيكسل مركّب وهو ماشي */
var PIXEL_RE = /^[A-Za-z0-9_-]{1,64}$/;

/*
 * الصفوف: الرئيسية أوّل ديما، من بعد الحملات (حتى المسوّدات — تحضّر
 * بيكسلها قبل ما تنشر، ماشي من بعد ما الإعلان يبدا يجري).
 */
function rows() {
  var main = {
    key: 'main',
    label: t('pixels.mainPage'),
    path: '/',
    value: (state.settings || {}).tiktokPixelMain || '',
    placeholder: t('pixels.mainPlaceholder'),
  };

  var campaigns = (state.campaigns || []).map(function (campaign) {
    return {
      key: 'campaign:' + campaign.id,
      label: campaign.name || t('campaigns.untitled'),
      path: '/' + (campaign.slug || ''),
      value: campaign.tiktokPixelId || '',
      placeholder: t('pixels.inherits'),
    };
  });

  return [main].concat(campaigns);
}

function rowHtml(row) {
  var id = 'px_' + row.key.replace(/[^\w]/g, '_');

  return '<div class="field" data-pixel-field="' + esc(row.key) + '">' +
    '<label for="' + id + '"><bdi>' + esc(row.label) + '</bdi></label>' +
    '<input type="text" id="' + id + '" data-pixel-key="' + esc(row.key) + '"' +
      ' value="' + esc(row.value) + '" placeholder="' + esc(row.placeholder) + '"' +
      ' spellcheck="false" autocomplete="off" dir="ltr">' +
    '<div class="hint">' + esc(row.path) + '</div>' +
  '</div>';
}

function readInputs() {
  var values = {};
  Array.prototype.forEach.call(root.querySelectorAll('[data-pixel-key]'), function (input) {
    values[input.getAttribute('data-pixel-key')] = input.value.trim();
  });
  return values;
}

function showRowError(key, message) {
  var field = root.querySelector('[data-pixel-field="' + key + '"]');
  if (!field) return;

  var old = field.querySelector('.field__error');
  if (old) old.remove();
  field.classList.toggle('field--invalid', Boolean(message));

  var input = field.querySelector('input');
  if (!message) {
    if (input) input.removeAttribute('aria-invalid');
    return;
  }

  if (input) input.setAttribute('aria-invalid', 'true');
  var note = document.createElement('div');
  note.className = 'field__error';
  note.textContent = message;
  field.appendChild(note);
}

export function renderPixels() {
  var card = '<div class="admin-card">' +
    '<h3>' + esc(t('pixels.tiktokTitle')) + '</h3>' +
    '<div class="hint">' + esc(t('pixels.intro')) + '</div>' +
    '<div class="form-grid">' + rows().map(rowHtml).join('') + '</div>' +
  '</div>';

  var actions = '<button class="btn btn--primary" data-act="save-pixels">' + esc(t('common.save')) + '</button>';

  root.innerHTML = shell(t('nav.pixels'), actions, card);
  markClean(readInputs(), readInputs);
}

export async function savePixels() {
  var values = readInputs();

  /* فحص محلّي قبل أي رحلة للسيرفر: الغلطة الشائعة هي لصق الكود كامل
     بدل الـ id، والسيرفر يخزّنو فارغ بلا ما يقول والو */
  var bad = 0;
  Object.keys(values).forEach(function (key) {
    var invalid = values[key] && !PIXEL_RE.test(values[key]);
    showRowError(key, invalid ? t('pixels.invalid') : '');
    if (invalid) bad++;
  });
  if (bad) {
    toast(t('pixels.invalidToast', { n: bad }), true);
    return;
  }

  try {
    /* الرئيسية أوّلاً: هي اللي ترثها الحملات الفارغة */
    if (values.main !== ((state.settings || {}).tiktokPixelMain || '')) {
      state.settings = (await api('settings.save', { settings: { tiktokPixelMain: values.main } })).settings;
    }

    var changed = (state.campaigns || []).filter(function (campaign) {
      return values['campaign:' + campaign.id] !== (campaign.tiktokPixelId || '');
    });

    for (var i = 0; i < changed.length; i++) {
      var saved = await api('campaigns.save', {
        campaign: Object.assign({}, changed[i], {
          tiktokPixelId: values['campaign:' + changed[i].id] || null,
        }),
      });
      changed[i].tiktokPixelId = saved.campaign.tiktokPixelId;
    }

    renderPixels();
    toast(t('pixels.saved'));
  } catch (error) {
    toast(error.message, true);
  }
}
