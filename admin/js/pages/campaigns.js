/* ==========================================================================
   Qiti admin — الحملات (قائمة + محرّر)
   المحرّر عندو عمودين: فورم مبني من SECTION_FIELDS، ومعاينة مباشرة في
   iframe تنادي نفس فنكشن الرندر الحقيقي (preview) بلا حفظ.
   ========================================================================== */
import { state } from '../state.js';
import { api } from '../api.js';
import { esc, toast } from '../dom.js';
import { fmtMoney } from '../format.js';
import { t } from '../i18n.js';
import { SECTION_FIELDS, SECTION_LABELS, FONTS, RADII } from '../section-fields.js';
import { shell } from '../ui/shell.js';
import { fieldHtml } from '../ui/field-html.js';
import { stateBlock } from '../ui/state-block.js';
import { confirmDialog } from '../ui/dialog.js';

var root = document.getElementById('adminRoot');
/* field() القديمة صارت في section-fields.js تحت نفس الاسم القديم t() —
   هنا نستعمل fieldHtml مباشرة، وواحد بسيط لحقول الأساس (اسم/رابط) اللي
   ماشي جزء من SECTION_FIELDS */
var textField = function (key, label, hint) { return { key: key, label: label, type: 'text', hint: hint }; };
var areaField = function (key, label, hint) { return { key: key, label: label, type: 'area', hint: hint }; };

/* ── قائمة الحملات ──────────────────────────────────────────────── */

export function renderCampaignList() {
  var rows = state.campaigns
    .slice()
    .sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); })
    .map(function (campaign) {
      var published = campaign.status === 'published';
      return '<div class="row-item">' +
          '<div>' +
            '<div class="row-item__name"><bdi>' + esc(campaign.name || t('campaigns.untitled')) + '</bdi></div>' +
            '<div class="row-item__meta">/' + esc(campaign.slug) + '</div>' +
          '</div>' +
          '<span class="badge badge--' + (published ? 'published">' + esc(t('campaigns.published')) : 'draft">' + esc(t('campaigns.draft'))) + '</span>' +
          '<div class="row-item__actions">' +
            (published ? '<a class="btn btn--outline btn--xs" href="/' + esc(campaign.slug) + '" target="_blank" rel="noopener">' + esc(t('common.view')) + '</a>' : '') +
            '<a class="btn btn--outline btn--xs" href="#/campaigns/' + esc(campaign.id) + '">' + esc(t('common.edit')) + '</a>' +
            '<button class="btn btn--twin btn--xs" data-act="dup" data-id="' + esc(campaign.id) + '">' + esc(t('campaigns.duplicate')) + '</button>' +
            '<button class="btn btn--xs ' + (published ? 'btn--outline' : 'btn--primary') + '" data-act="publish" data-id="' + esc(campaign.id) + '">' +
              (published ? esc(t('campaigns.unpublish')) : esc(t('campaigns.publish'))) + '</button>' +
            '<button class="btn btn--danger btn--xs" data-act="del-campaign" data-id="' + esc(campaign.id) + '">' + esc(t('common.delete')) + '</button>' +
          '</div>' +
        '</div>';
    }).join('');

  root.innerHTML = shell(
    t('campaigns.title'),
    '<a class="btn btn--primary" href="#/campaigns/new">' + esc(t('campaigns.new')) + '</a>',
    '<div class="admin-card"><div class="row-list">' +
      (rows || stateBlock({
        variant: 'empty',
        title: t('campaigns.emptyTitle'),
        body: t('campaigns.emptyBody'),
        actionHref: '#/campaigns/new',
        actionLabel: t('campaigns.new'),
      })) +
    '</div></div>',
  );
}

/* ── ثيم الحملة ─────────────────────────────────────────────────── */

function contrastRatio(a, b) {
  function lum(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return 0;
    var channels = [0, 2, 4].map(function (offset) {
      var v = parseInt(m[1].substr(offset, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }
  var la = lum(a);
  var lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function themeBlock(theme) {
  var defaults = theme.mood === 'dark'
    ? { accent: '#FF6B2C', accentText: '#1A0E07', bg: '#0C0B0A', surface: '#161412', text: '#F6F2EE' }
    : { accent: '#FF6B2C', accentText: '#FFFFFF', bg: '#FFFFFF', surface: '#FFFFFF', text: '#14110F' };

  var color = function (key, label) {
    return '<div class="field"><label for="th_' + key + '">' + esc(label) + '</label>' +
      '<input type="color" id="th_' + key + '" data-path="theme.' + key + '" value="' +
      esc(theme[key] || defaults[key]) + '"></div>';
  };

  var ratio = contrastRatio(theme.text || defaults.text, theme.bg || defaults.bg);
  var warn = ratio < 4.5
    ? '<div class="hint" style="color:var(--danger)">' + esc(t('theme.contrastWarn', { ratio: ratio.toFixed(2) })) + '</div>'
    : '<div class="hint">' + esc(t('theme.contrastOk', { ratio: ratio.toFixed(2) })) + '</div>';

  return '<div class="admin-card"><h3>' + esc(t('theme.title')) + '</h3>' +
    '<div class="form-grid">' +
      fieldHtml({ key: 'mood', label: t('theme.mode'), type: 'select', options: [
        { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' },
      ] }, theme.mood || 'light', 'theme.mood') +
      fieldHtml({ key: 'font', label: t('theme.font'), type: 'select', options: FONTS }, theme.font || 'tajawal', 'theme.font') +
      fieldHtml({ key: 'radius', label: t('theme.radius'), type: 'select', options: RADII }, theme.radius || 'soft', 'theme.radius') +
      color('accent', t('theme.accent')) +
      color('accentText', t('theme.accentText')) +
      color('bg', t('theme.bg')) +
      color('surface', t('theme.surface')) +
      color('text', t('theme.text')) +
    '</div>' + warn + '</div>';
}

/* ── محرّر الحملة ───────────────────────────────────────────────── */

export function renderCampaignEditor() {
  var draft = state.draft;
  var used = (draft.sections || []).map(function (s) { return s.type; });
  var addable = Object.keys(SECTION_LABELS).filter(function (type) { return used.indexOf(type) === -1; });

  var sectionsHtml = (draft.sections || []).map(function (section, index) {
    var fields = SECTION_FIELDS[section.type] || [];
    return '<details class="section-block">' +
      '<summary>' +
        '<span class="section-block__title">' + esc(SECTION_LABELS[section.type] || section.type) + '</span>' +
        '<span class="badge">' + esc(section.type) + '</span>' +
      '</summary>' +
      '<div class="section-block__body">' +
        '<div class="group-item__head">' +
          '<button type="button" class="mini-btn" data-act="move-section" data-index="' + index + '" data-dir="-1" title="' + esc(t('common.moveUp')) + '">↑</button>' +
          '<button type="button" class="mini-btn" data-act="move-section" data-index="' + index + '" data-dir="1" title="' + esc(t('common.moveDown')) + '">↓</button>' +
          '<button type="button" class="mini-btn mini-btn--danger" data-act="del-section" data-index="' + index + '" title="' + esc(t('common.delete')) + '">✕</button>' +
        '</div>' +
        '<div class="field checkbox-row">' +
          '<input type="checkbox" id="en_' + index + '" data-path="sections.' + index + '.enabled" data-kind="bool"' +
            (section.enabled !== false ? ' checked' : '') + '>' +
          '<label for="en_' + index + '">' + esc(t('campaigns.enabled')) + '</label>' +
        '</div>' +
        fields.map(function (def) {
          return fieldHtml(def, (section.data || {})[def.key], 'sections.' + index + '.data.' + def.key);
        }).join('') +
      '</div>' +
    '</details>';
  }).join('');

  /* U+2066/U+2069 (FSI/PDI) بدل <bdi> — بلاصة الاستعمال هنا نص <option>،
     والمتصفّح ما يرندريش وسوم HTML جوّا <option> */
  var productOptions = [{ value: '', label: t('campaigns.selectProduct') }].concat(
    state.products.map(function (p) {
      return { value: p.id, label: '⁦' + p.name + '⁩' + ' — ' + fmtMoney(p.price) };
    }),
  );

  var body = '<div class="editor-split">' +
    '<div class="editor-form">' +
      '<div class="admin-card"><h3>' + esc(t('campaigns.basics')) + '</h3><div class="form-grid">' +
        fieldHtml(textField('name', t('campaigns.name'), t('campaigns.nameHint')), draft.name, 'name') +
        fieldHtml(textField('slug', t('campaigns.slug'), t('campaigns.slugHint')), draft.slug, 'slug') +
        fieldHtml({ key: 'productId', label: t('campaigns.product'), type: 'select', options: productOptions },
          draft.productId || '', 'productId') +
        fieldHtml(textField('seo.title', t('campaigns.seoTitle')), (draft.seo || {}).title, 'seo.title') +
        '<div class="field field--full">' +
          fieldHtml(areaField('seo.description', t('campaigns.seoDescription')), (draft.seo || {}).description, 'seo.description') +
        '</div>' +
      '</div></div>' +

      themeBlock(draft.theme || {}) +

      '<div class="admin-card"><h3>' + esc(t('campaigns.sections')) + '</h3>' +
        (sectionsHtml || stateBlock({
          variant: 'empty',
          title: t('campaigns.sectionsEmptyTitle'),
          body: t('campaigns.sectionsEmptyBody'),
        })) +
        '<div class="add-section-row">' +
          '<select id="addSectionType">' +
            addable.map(function (type) {
              return '<option value="' + type + '">' + esc(SECTION_LABELS[type]) + '</option>';
            }).join('') +
          '</select>' +
          '<button type="button" class="btn btn--outline btn--xs" data-act="add-section">' + esc(t('campaigns.addSection')) + '</button>' +
          '<button type="button" class="btn btn--outline btn--xs" data-act="blank-sections">' + esc(t('campaigns.blankSections')) + '</button>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="preview-panel">' +
      '<div class="preview-toolbar">' +
        ['mobile', 'tablet', 'desktop'].map(function (size) {
          var labels = { mobile: t('campaigns.viewportMobile'), tablet: t('campaigns.viewportTablet'), desktop: t('campaigns.viewportDesktop') };
          return '<button type="button" class="viewport-btn' + (state.viewport === size ? ' is-active' : '') +
            '" data-act="viewport" data-size="' + size + '">' + esc(labels[size]) + '</button>';
        }).join('') +
      '</div>' +
      '<div class="preview-frame-wrap" data-viewport="' + state.viewport + '">' +
        '<div class="preview-frame"><iframe id="previewFrame" title="' + esc(t('campaigns.previewTitle')) + '"></iframe></div>' +
      '</div>' +
      '<div class="save-indicator" id="saveIndicator"></div>' +
    '</div>' +
  '</div>';

  var isPublished = draft.status === 'published';
  var actions =
    '<a class="btn btn--outline" href="#/campaigns">' + esc(t('common.back')) + '</a>' +
    (draft.id ? '<a class="btn btn--outline" href="/' + esc(draft.slug) + '" target="_blank" rel="noopener">' + esc(t('campaigns.viewPage')) + '</a>' : '') +
    '<button class="btn btn--outline" data-act="save-campaign">' + esc(t('common.save')) + '</button>' +
    '<button class="btn btn--primary" data-act="save-publish">' +
      (isPublished ? esc(t('campaigns.saveKeepPublished')) : esc(t('campaigns.savePublish'))) + '</button>';

  root.innerHTML = shell('⁦' + (draft.name || t('campaigns.untitled')) + '⁩', actions, body);
  refreshPreview();
}

/* المعاينة تنادي نفس الرندر تاع الصفحة الحقيقية — بلا حفظ */
var previewTimer = null;
export function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, 500);
}

async function refreshPreview() {
  var frame = document.getElementById('previewFrame');
  if (!frame || !state.draft) return;
  try {
    var res = await api('preview', { campaign: state.draft, productId: state.draft.productId || null });
    frame.srcdoc = res.html;
  } catch (error) {
    /* المعاينة تفشل بالسكات — ما نقطعوش الخدمة على المستخدم على وُدّها */
    console.warn('preview failed:', error.message);
  }
}

/* ترتيب الأقسام يتخزّن كرقم — نعاودو نرقّموه بعد كل تحريك */
export function reorderSections() {
  (state.draft.sections || []).forEach(function (section, index) { section.order = index + 1; });
}

/* ── الحفظ ──────────────────────────────────────────────────────── */

export async function saveCampaign(publish) {
  var draft = state.draft;
  if (publish) draft.status = 'published';
  /* الـ select يعطي '' كي ما يكونش مختار — و'' ماشي nullish، فتخزّن
     كيما هي وتخلّي الحملة "عندها منتج" بمعرّف فارغ */
  if (!draft.productId) draft.productId = null;

  try {
    var res = await api('campaigns.save', { campaign: draft });
    state.draft = res.campaign;
    state.campaigns = (await api('campaigns.list')).campaigns;
    /* أول حفظ يعطينا id — نبدّلو الهاش باش refresh ما يضيّعش الحملة */
    if (location.hash !== '#/campaigns/' + res.campaign.id) {
      location.hash = '#/campaigns/' + res.campaign.id;
    } else {
      renderCampaignEditor();
    }
    toast(publish ? t('campaigns.publishedToast', { slug: res.campaign.slug }) : t('campaigns.saved'));
  } catch (error) {
    toast(error.message, true);
  }
}

export async function deleteCampaign(id) {
  var ok = await confirmDialog({
    title: t('campaigns.deleteConfirmTitle'),
    body: t('campaigns.deleteConfirmBody'),
    confirmLabel: t('common.delete'),
    danger: true,
  });
  if (!ok) return;
  try {
    await api('campaigns.delete', { id: id });
    state.campaigns = (await api('campaigns.list')).campaigns;
    renderCampaignList();
    toast(t('campaigns.deleted'));
  } catch (error) {
    toast(error.message, true);
  }
}
