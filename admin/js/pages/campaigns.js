import { state } from '../state.js';
import { api } from '../api.js';
import { esc, toast } from '../dom.js';
import { fmtMoney, fmtDateTime } from '../format.js';
import { t } from '../i18n.js';
import { SECTION_FIELDS, SECTION_LABELS, FONTS, RADII, BUNDLE_FIELDS, UPSELL_FIELDS } from '../section-fields.js';
import { shell } from '../ui/shell.js';
import { fieldHtml } from '../ui/field-html.js';
import { stateBlock } from '../ui/state-block.js';
import { confirmDialog } from '../ui/dialog.js';
import { icon } from '../ui/icon.js';
import { tabsHtml, bindTabs } from '../ui/tabs.js';
import { dataTable } from '../ui/table.js';
import { menuHtml } from '../ui/menu.js';
import { validate, showErrors, markClean } from '../ui/form.js';

var root = document.getElementById('adminRoot');
var textField = function (key, label, hint) { return { key: key, label: label, type: 'text', hint: hint }; };
var areaField = function (key, label, hint) { return { key: key, label: label, type: 'area', hint: hint }; };

function statusBadge(campaign) {
  var published = campaign.status === 'published';
  return '<span class="badge badge--' + (published ? 'published' : 'draft') + '">' +
    esc(published ? t('campaigns.published') : t('campaigns.draft')) + '</span>';
}

var campaignFilter = { q: '', status: 'all' };
var campaignSort = { key: 'updatedAt', dir: 'desc' };

function matchesCampaignFilter(campaign) {
  if (campaignFilter.status !== 'all' && campaign.status !== campaignFilter.status) return false;
  if (campaignFilter.q) {
    var q = campaignFilter.q.toLowerCase();
    var name = (campaign.name || '').toLowerCase();
    var slug = (campaign.slug || '').toLowerCase();
    if (name.indexOf(q) === -1 && slug.indexOf(q) === -1) return false;
  }
  return true;
}

function sortValue(campaign, key) {
  if (key === 'name') return (campaign.name || '').toLowerCase();
  if (key === 'status') return campaign.status || '';
  return campaign.updatedAt || '';
}

function sortCampaignRows(rows) {
  var key = campaignSort.key;
  var dir = campaignSort.dir === 'asc' ? 1 : -1;
  return rows.slice().sort(function (a, b) {
    var av = sortValue(a, key);
    var bv = sortValue(b, key);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

function campaignRowActions(campaign) {
  var published = campaign.status === 'published';
  var items = [
    { label: t('campaigns.duplicate'), act: 'dup', id: campaign.id },
    { label: published ? t('campaigns.unpublish') : t('campaigns.publish'), act: 'publish', id: campaign.id },
    { sep: true },
    { label: t('common.delete'), icon: 'trash', act: 'del-campaign', id: campaign.id, danger: true },
  ];
  return (published ? '<a class="btn btn--outline btn--xs" href="/' + esc(campaign.slug) + '" target="_blank" rel="noopener">' + esc(t('common.view')) + '</a> ' : '') +
    '<a class="btn btn--outline btn--xs" href="#/campaigns/' + esc(campaign.id) + '">' + esc(t('common.edit')) + '</a> ' +
    menuHtml({ items: items, label: t('campaigns.rowMenuLabel', { name: campaign.name || t('campaigns.untitled') }) });
}

function campaignColumns() {
  return [
    { key: 'name', label: t('campaigns.colName'), sortable: true, render: function (c) {
        return '<bdi>' + esc(c.name || t('campaigns.untitled')) + '</bdi>' +
          '<div class="row-item__meta">/' + esc(c.slug) + '</div>';
      } },
    { key: 'status', label: t('campaigns.colStatus'), sortable: true, render: statusBadge },
    { key: 'updatedAt', label: t('campaigns.colUpdated'), sortable: true, render: function (c) { return esc(fmtDateTime(c.updatedAt)); } },
    { key: '_actions', label: '', align: 'end', render: campaignRowActions },
  ];
}

function campaignEmptyOpts() {
  var any = state.campaigns.length > 0;
  return any
    ? { variant: 'empty', title: t('campaigns.emptyFilteredTitle'), body: t('campaigns.emptyFilteredBody') }
    : { variant: 'empty', title: t('campaigns.emptyTitle'), body: t('campaigns.emptyBody'), actionHref: '#/campaigns/new', actionLabel: t('campaigns.new') };
}

function campaignListBody() {
  return dataTable({
    columns: campaignColumns(),
    rows: sortCampaignRows(state.campaigns.filter(matchesCampaignFilter)),
    sort: campaignSort,
    onSortAct: 'campaigns-sort',
    empty: campaignEmptyOpts(),
  });
}

export function renderCampaignList() {
  var actions =
    '<input type="text" id="campaignSearch" class="campaign-search" placeholder="' + esc(t('campaigns.searchPlaceholder')) +
      '" aria-label="' + esc(t('campaigns.searchPlaceholder')) + '" value="' + esc(campaignFilter.q) + '">' +
    '<select id="campaignStatusFilter" aria-label="' + esc(t('campaigns.filterAriaLabel')) + '">' +
      '<option value="all"' + (campaignFilter.status === 'all' ? ' selected' : '') + '>' + esc(t('campaigns.filterAll')) + '</option>' +
      '<option value="draft"' + (campaignFilter.status === 'draft' ? ' selected' : '') + '>' + esc(t('campaigns.draft')) + '</option>' +
      '<option value="published"' + (campaignFilter.status === 'published' ? ' selected' : '') + '>' + esc(t('campaigns.published')) + '</option>' +
    '</select>' +
    '<a class="btn btn--primary" href="#/campaigns/new">' + esc(t('campaigns.new')) + '</a>';

  root.innerHTML = shell(t('campaigns.title'), actions, '<div class="admin-card" id="campaignsCard">' + campaignListBody() + '</div>');

  var card = document.getElementById('campaignsCard');
  function refresh() { card.innerHTML = campaignListBody(); }

  document.getElementById('campaignSearch').addEventListener('input', function (event) {
    campaignFilter.q = event.target.value.trim();
    refresh();
  });
  document.getElementById('campaignStatusFilter').addEventListener('change', function (event) {
    campaignFilter.status = event.target.value;
    refresh();
  });
  card.addEventListener('click', function (event) {
    var sortBtn = event.target.closest('[data-act="campaigns-sort"]');
    if (!sortBtn) return;
    campaignSort = { key: sortBtn.getAttribute('data-sort-key'), dir: sortBtn.getAttribute('data-sort-dir') };
    refresh();
  });
}

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

function themeDefaults(mood) {
  return mood === 'dark'
    ? { accent: '#FF6B2C', accentText: '#1A0E07', bg: '#0C0B0A', surface: '#161412', text: '#F6F2EE' }
    : { accent: '#FF6B2C', accentText: '#FFFFFF', bg: '#FFFFFF', surface: '#FFFFFF', text: '#14110F' };
}

function contrastNote(theme) {
  var defaults = themeDefaults(theme.mood);
  var ratio = contrastRatio(theme.text || defaults.text, theme.bg || defaults.bg);
  var key = ratio < 4.5 ? 'theme.contrastWarn' : 'theme.contrastOk';
  return '<div class="hint" id="themeContrast"' + (ratio < 4.5 ? ' style="color:var(--danger)"' : '') + '>' +
    esc(t(key, { ratio: ratio.toFixed(2) })) + '</div>';
}

function themeBlock(theme) {
  var defaults = themeDefaults(theme.mood);

  var color = function (key, label) {
    return '<div class="field"><label for="th_' + key + '">' + esc(label) + '</label>' +
      '<input type="color" id="th_' + key + '" data-path="theme.' + key + '" value="' +
      esc(theme[key] || defaults[key]) + '"></div>';
  };

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
    '</div>' + contrastNote(theme) + '</div>';
}

function bindThemeContrast() {
  var form = document.querySelector('.editor-form');
  if (!form) return;
  var refresh = function (event) {
    var path = event.target.getAttribute && event.target.getAttribute('data-path');
    if (path !== 'theme.text' && path !== 'theme.bg' && path !== 'theme.mood') return;
    var note = document.getElementById('themeContrast');
    if (!note) return;
    var theme = Object.assign({}, state.draft.theme || {});
    theme[path.split('.')[1]] = event.target.value;
    note.outerHTML = contrastNote(theme);
  };
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
}

var STEP_KEYS = ['details', 'design', 'content', 'offers', 'review'];

var currentStep = STEP_KEYS[0];
var lastSeenDraft = null;
var skipStepReset = false;

function stepLabel(key) {
  return t('campaigns.step' + key.charAt(0).toUpperCase() + key.slice(1));
}

function publishRules() {
  return {
    name: { required: true, maxLength: 80 },
    slug: { required: true, slug: true },
    productId: { required: true, message: t('campaigns.productRequired') },
  };
}

function stepForPath(path) {
  if (path.indexOf('theme.') === 0) return 'design';
  if (path.indexOf('sections.') === 0) return 'content';
  return 'details';
}

function stepStatus(errors) {
  var detailsBad = !!(errors.name || errors.slug || errors.productId);
  return { details: detailsBad ? 'alert' : 'check', design: 'check', content: 'check', review: detailsBad ? 'alert' : 'check' };
}

function refreshStepIcons(draft) {
  var status = stepStatus(validate(draft, publishRules()).errors);
  STEP_KEYS.forEach(function (key) {
    var btn = document.getElementById('campaignSteps-tab-' + key);
    var svg = btn && btn.querySelector('svg');
    if (svg) svg.outerHTML = icon(status[key]);
  });
}

function bindStepValidation(rootEl) {
  var refresh = function () { refreshStepIcons(state.draft); };
  rootEl.addEventListener('input', refresh);
  rootEl.addEventListener('change', refresh);
}

function onStepChange(key) {
  currentStep = key;
  updateStepNav();
}

function moveStep(dir) {
  var at = STEP_KEYS.indexOf(currentStep);
  var target = STEP_KEYS[at + dir];
  if (!target) return;
  var btn = document.getElementById('campaignSteps-tab-' + target);
  if (btn) btn.click();
}

function bindStepNav(rootEl) {
  var back = rootEl.querySelector('#stepBack');
  var next = rootEl.querySelector('#stepNext');
  if (back) back.addEventListener('click', function () { moveStep(-1); });
  if (next) next.addEventListener('click', function () { moveStep(1); });
}

function updateStepNav() {
  var at = STEP_KEYS.indexOf(currentStep);
  var back = document.getElementById('stepBack');
  var next = document.getElementById('stepNext');
  var pos = document.getElementById('stepPos');
  if (back) back.disabled = at <= 0;
  if (next) next.disabled = at >= STEP_KEYS.length - 1;
  if (pos) pos.textContent = t('campaigns.stepPosition', { n: at + 1, total: STEP_KEYS.length });
}

function ensureEditorSession(draft) {
  if (draft === lastSeenDraft) return;
  lastSeenDraft = draft;
  markClean(draft, function () { return state.draft; });
  if (skipStepReset) { skipStepReset = false; return; }
  currentStep = STEP_KEYS[0];
}

function detailsPanel(draft) {
  var productOptions = [{ value: '', label: t('campaigns.selectProduct') }].concat(
    state.products.map(function (p) {
      return { value: p.id, label: p.name + ' — ' + fmtMoney(p.price) };
    }),
  );

  return '<div class="admin-card"><h3>' + esc(t('campaigns.basics')) + '</h3><div class="form-grid">' +
    fieldHtml(textField('name', t('campaigns.name'), t('campaigns.nameHint')), draft.name, 'name') +
    fieldHtml(textField('slug', t('campaigns.slug'), t('campaigns.slugHint')), draft.slug, 'slug') +
    fieldHtml({ key: 'productId', label: t('campaigns.product'), type: 'select', options: productOptions },
      draft.productId || '', 'productId') +
    fieldHtml(textField('seo.title', t('campaigns.seoTitle')), (draft.seo || {}).title, 'seo.title') +
    '<div class="field field--full">' +
      fieldHtml(areaField('seo.description', t('campaigns.seoDescription')), (draft.seo || {}).description, 'seo.description') +
    '</div>' +
  '</div></div>';
}

function contentPanel(draft) {
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
          '<button type="button" class="mini-btn" data-act="move-section" data-index="' + index + '" data-dir="-1"' +
            ' title="' + esc(t('common.moveUp')) + '" aria-label="' + esc(t('common.moveUp')) + '">' +
            icon('chevron', 'mini-btn__ico--up') + '</button>' +
          '<button type="button" class="mini-btn" data-act="move-section" data-index="' + index + '" data-dir="1"' +
            ' title="' + esc(t('common.moveDown')) + '" aria-label="' + esc(t('common.moveDown')) + '">' +
            icon('chevron') + '</button>' +
          '<button type="button" class="mini-btn mini-btn--danger" data-act="del-section" data-index="' + index + '"' +
            ' title="' + esc(t('common.delete')) + '" aria-label="' + esc(t('common.delete')) + '">' +
            icon('trash') + '</button>' +
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

  return '<div class="admin-card"><h3>' + esc(t('campaigns.sections')) + '</h3>' +
    (sectionsHtml || stateBlock({
      variant: 'empty',
      title: t('campaigns.sectionsEmptyTitle'),
      body: t('campaigns.sectionsEmptyBody'),
    })) +
    '<div class="add-section-row">' +
      (addable.length
        ? '<select id="addSectionType" aria-label="' + esc(t('campaigns.addSectionLabel')) + '">' +
            addable.map(function (type) {
              return '<option value="' + type + '">' + esc(SECTION_LABELS[type]) + '</option>';
            }).join('') +
          '</select>' +
          '<button type="button" class="btn btn--outline btn--xs" data-act="add-section">' + esc(t('campaigns.addSection')) + '</button>'
        : '<span class="hint" style="margin:0">' + esc(t('campaigns.allSectionsUsed')) + '</span>') +
      '<button type="button" class="btn btn--outline btn--xs" data-act="blank-sections">' + esc(t('campaigns.blankSections')) + '</button>' +
    '</div>' +
  '</div>';
}

document.addEventListener('keydown', function (event) {
  if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
  var block = event.target.closest && event.target.closest('.section-block');
  if (!block) return;
  var dir = event.key === 'ArrowUp' ? '-1' : '1';
  var moveBtn = block.querySelector('[data-act="move-section"][data-dir="' + dir + '"]');
  if (!moveBtn) return;
  event.preventDefault();
  moveBtn.click();
});

function reviewChecklist(errors) {
  var items = [
    { path: 'name', label: t('campaigns.name') },
    { path: 'slug', label: t('campaigns.slug') },
    { path: 'productId', label: t('campaigns.product') },
  ];
  return '<ul class="review-checklist">' + items.map(function (item) {
    var bad = errors[item.path];
    return '<li class="review-checklist__item ' + (bad ? 'is-bad' : 'is-ok') + '">' +
      icon(bad ? 'alert' : 'check') +
      '<span>' + esc(bad ? (item.label + ' — ' + bad) : item.label) + '</span>' +
    '</li>';
  }).join('') + '</ul>';
}

function reviewSummary(draft) {
  var product = state.products.filter(function (p) { return p.id === draft.productId; })[0];
  var sections = draft.sections || [];
  var enabledCount = sections.filter(function (s) { return s.enabled !== false; }).length;
  var theme = draft.theme || {};
  var defaults = themeDefaults(theme.mood);

  return '<dl class="review-summary">' +
    '<dt>' + esc(t('campaigns.name')) + '</dt><dd><bdi>' + esc(draft.name || t('campaigns.untitled')) + '</bdi></dd>' +
    '<dt>' + esc(t('campaigns.reviewLink')) + '</dt><dd>/' + esc(draft.slug || '') + '</dd>' +
    '<dt>' + esc(t('campaigns.product')) + '</dt><dd>' +
      (product ? esc(product.name) + ' — ' + esc(fmtMoney(product.price)) : esc(t('campaigns.selectProduct'))) + '</dd>' +
    '<dt>' + esc(t('theme.title')) + '</dt><dd>' +
      '<span class="review-swatch" style="background:' + esc(theme.accent || defaults.accent) + '"></span>' +
      esc(theme.mood === 'dark' ? 'Dark' : 'Light') + '</dd>' +
    '<dt>' + esc(t('campaigns.reviewSections')) + '</dt><dd>' +
      esc(t('campaigns.reviewSectionsCount', { enabled: enabledCount, total: sections.length })) + '</dd>' +
    '<dt>' + esc(t('campaigns.reviewStatus')) + '</dt><dd>' + statusBadge(draft) + '</dd>' +
  '</dl>';
}

function reviewPanel(draft, errors) {
  return '<div class="admin-card"><h3>' + esc(t('campaigns.reviewTitle')) + '</h3>' +
      reviewChecklist(errors) +
      '<div class="hint review-hint">' + esc(t('campaigns.reviewPublishHint')) + '</div>' +
    '</div>' +
    '<div class="admin-card"><h3>' + esc(t('campaigns.reviewSummaryTitle')) + '</h3>' +
      reviewSummary(draft) +
    '</div>';
}

function offersPanel(draft) {
  var bundles = draft.bundles || { enabled: false, items: [] };
  var upsell = draft.upsell || { enabled: false };

  var bundleList = (bundles.items || []).map(function (bundle, index) {
    var path = 'bundles.items.' + index;
    return '<div class="section-block">' +
      '<div class="section-block__head">' +
        '<b>' + esc(bundle.name || t('campaigns.bundleUntitled')) + '</b>' +
        '<button type="button" class="mini-btn" data-act="move" data-path="bundles.items" data-index="' + index + '" data-dir="-1">↑</button>' +
        '<button type="button" class="mini-btn" data-act="move" data-path="bundles.items" data-index="' + index + '" data-dir="1">↓</button>' +
        '<button type="button" class="mini-btn mini-btn--danger" data-act="del-item" data-path="' + path + '">✕</button>' +
      '</div>' +
      '<div class="form-grid">' +
        BUNDLE_FIELDS.map(function (def) {
          return fieldHtml(def, bundle[def.key], path + '.' + def.key);
        }).join('') +
      '</div>' +
    '</div>';
  }).join('');

  return '<div class="admin-card"><h3>' + esc(t('campaigns.bundlesTitle')) + '</h3>' +
      '<div class="hint">' + esc(t('campaigns.bundlesHint')) + '</div>' +
      fieldHtml({ key: 'enabled', label: t('campaigns.bundlesEnable'), type: 'bool' }, bundles.enabled, 'bundles.enabled') +
      bundleList +
      '<button type="button" class="btn btn--outline btn--xs" data-act="add-item" data-path="bundles.items">' +
        esc(t('campaigns.bundleAdd')) + '</button>' +
    '</div>' +
    '<div class="admin-card"><h3>' + esc(t('campaigns.upsellTitle')) + '</h3>' +
      '<div class="hint">' + esc(t('campaigns.upsellHint')) + '</div>' +
      fieldHtml({ key: 'enabled', label: t('campaigns.upsellEnable'), type: 'bool' }, upsell.enabled, 'upsell.enabled') +
      '<div class="form-grid">' +
        UPSELL_FIELDS.map(function (def) {
          return fieldHtml(def, upsell[def.key], 'upsell.' + def.key);
        }).join('') +
      '</div>' +
    '</div>';
}

function stepPanel(key, draft, errors) {
  if (key === 'details') return detailsPanel(draft);
  if (key === 'design') return themeBlock(draft.theme || {});
  if (key === 'content') return contentPanel(draft);
  if (key === 'offers') return offersPanel(draft);
  return reviewPanel(draft, errors);
}

export function renderCampaignEditor() {
  var draft = state.draft;
  ensureEditorSession(draft);

  var errors = validate(draft, publishRules()).errors;
  var status = stepStatus(errors);
  var tabs = STEP_KEYS.map(function (key) {
    return { key: key, label: stepLabel(key), icon: status[key], panel: stepPanel(key, draft, errors) };
  });

  var body = '<div class="editor-split">' +
    '<div class="editor-form">' +
      tabsHtml({ id: 'campaignSteps', tabs: tabs, active: currentStep }) +
      '<div class="step-nav">' +
        '<button type="button" class="btn btn--outline btn--xs" id="stepBack">' +
          icon('chevron', 'step-nav__ico step-nav__ico--prev') + esc(t('campaigns.stepBack')) +
        '</button>' +
        '<span class="step-nav__pos" id="stepPos"></span>' +
        '<button type="button" class="btn btn--outline btn--xs" id="stepNext">' +
          esc(t('campaigns.stepNext')) + icon('chevron', 'step-nav__ico') +
        '</button>' +
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

  root.innerHTML = shell(draft.name || t('campaigns.untitled'), actions, body);;
  bindTabs(root, onStepChange);
  bindThemeContrast();
  bindStepValidation(root.querySelector('.editor-form'));
  bindStepNav(root);
  updateStepNav();
  refreshPreview();
}

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
    console.warn('preview failed:', error.message);
  }
}

export function reorderSections() {
  (state.draft.sections || []).forEach(function (section, index) { section.order = index + 1; });
}

export async function saveCampaign(publish) {
  var draft = state.draft;

  if (publish) {
    var result = validate(draft, publishRules());
    if (!result.ok) {
      var firstPath = Object.keys(result.errors)[0];
      var step = stepForPath(firstPath);
      var stepBtn = document.getElementById('campaignSteps-tab-' + step);
      if (stepBtn) stepBtn.click();
      refreshStepIcons(draft);
      showErrors(document.querySelector('.editor-form'), result.errors);
      toast(t('validation.summary', { n: Object.keys(result.errors).length }), true);
      return;
    }
  }

  var statusBefore = draft.status;
  if (publish) draft.status = 'published';
  if (!draft.productId) draft.productId = null;

  skipStepReset = true;
  try {
    var res = await api('campaigns.save', { campaign: draft });
    state.draft = res.campaign;
    markClean(state.draft, function () { return state.draft; });
    state.campaigns = (await api('campaigns.list')).campaigns;
    if (location.hash !== '#/campaigns/' + res.campaign.id) {
      location.hash = '#/campaigns/' + res.campaign.id;
    } else {
      renderCampaignEditor();
    }
    toast(publish ? t('campaigns.publishedToast', { slug: res.campaign.slug }) : t('campaigns.saved'));
  } catch (error) {
    draft.status = statusBefore;
    skipStepReset = false;
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
