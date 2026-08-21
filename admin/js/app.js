import { state } from './state.js';
import { api, loginStep } from './api.js';
import { getPath, setPath, delPath, toast } from './dom.js';
import { t } from './i18n.js';
import { stateBlock } from './ui/state-block.js';
import { isDirty, confirmDiscard, clearDirty } from './ui/form.js';
import { route } from './router.js';
import { renderLogin } from './pages/login.js';
import {
  renderCampaignList, renderCampaignEditor, saveCampaign, reorderSections,
  schedulePreview, deleteCampaign,
} from './pages/campaigns.js';
import {
  renderProductEditor, addProductOption, saveProduct, saveStock, deleteProduct,
} from './pages/products.js';
import { categoryModal, presetPicker, deleteCategory } from './pages/categories.js';
import { pickMedia, deleteMedia } from './pages/media.js';
import { savePixels } from './pages/pixels.js';

var root = document.getElementById('adminRoot');

export async function boot() {
  root.classList.toggle('is-nav-collapsed', localStorage.getItem('qiti-admin-collapsed') === '1');

  try {
    state.campaigns = (await api('campaigns.list')).campaigns;
    state.authed = true;
  } catch (error) {
    if (error.unauthorized) return;
    root.innerHTML = '<div class="login-screen"><div class="login-card">' + stateBlock({
      variant: 'error',
      title: t('state.errorTitle'),
      body: error.message,
      actionLabel: t('state.retry'),
      actionAct: 'retry-boot',
    }) + '</div></div>';
    return;
  }

  if (state.authed) {
    try {
      state.pendingOrders = (await api('orders.pendingCount')).count;
    } catch (error) {
      state.pendingOrders = 0;
    }

    /* بادج الصفّ: اللي يستنّى مكالمة ولا قرار دروك. منفصل على عدّاد
       الطلبات المعلّقة — عشرين طلب معلّق فيهم ثلاثة عندهم موعد بعد
       ساعتين ماشي نفس الشغل. */
    try {
      state.queueDue = (await api('queue.count')).count;
    } catch (error) {
      state.queueDue = 0;
    }
  }

  await route();
}

function onInput(event) {
  var node = event.target;
  var path = node.getAttribute && node.getAttribute('data-path');
  if (!path) return;

  var target = state.draft || state.product;
  if (!target) return;

  var kind = node.getAttribute('data-kind');
  var value;

  if (kind === 'bool') value = node.checked;
  else if (kind === 'number') value = node.value === '' ? null : Number(node.value);
  else if (kind === 'lines') {
    value = node.value.split('\n').map(function (line) { return line.trim(); })
      .filter(function (line) { return line.length; });
  } else value = node.value;

  setPath(target, path, value);

  if (node.type === 'text' && node.parentElement && node.parentElement.classList.contains('image-field')) {
    var thumb = node.parentElement.querySelector('.image-field__thumb');
    if (thumb) thumb.src = value || '';
  }

  if (state.draft) schedulePreview();
}

async function onClick(event) {
  var node = event.target.closest('[data-act]');
  if (!node) return;
  var act = node.getAttribute('data-act');
  var target = state.draft || state.product;

  if (act === 'toggle-nav') {
    var opened = root.classList.toggle('is-nav-open');
    node.setAttribute('aria-expanded', opened ? 'true' : 'false');
    return;
  }
  if (act === 'close-nav') {
    root.classList.remove('is-nav-open');
    var toggleBtn = document.querySelector('.admin__nav-toggle');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
    return;
  }
  if (act === 'toggle-nav-collapsed') {
    var collapsed = root.classList.toggle('is-nav-collapsed');
    localStorage.setItem('qiti-admin-collapsed', collapsed ? '1' : '0');
    var label = t(collapsed ? 'nav.expand' : 'nav.collapse');
    node.setAttribute('aria-label', label);
    var labelText = node.querySelector('.sidebar-label');
    if (labelText) labelText.textContent = label;
    return;
  }
  if (act === 'toggle-theme') {
    var htmlEl = document.documentElement;
    var nextTheme = htmlEl.dataset.theme === 'dark' ? 'light' : 'dark';
    htmlEl.dataset.theme = nextTheme;
    try { localStorage.setItem('qiti-theme', nextTheme); } catch (error) {}
    return;
  }

  if (act === 'retry-route') { await route(); return; }
  if (act === 'retry-boot') { await boot(); return; }

  if (act === 'focus-media-upload') {
    var fileInput = document.getElementById('mediaFile');
    if (fileInput) fileInput.click();
    return;
  }

  if (act === 'logout') {
    await loginStep({ step: 'logout' }).catch(function () {});
    state.authed = false;
    renderLogin();
    return;
  }

  if (act === 'add-item') {
    var path = node.getAttribute('data-path');
    var arr = getPath(target, path);
    if (!Array.isArray(arr)) { arr = []; setPath(target, path, arr); }
    arr.push({});
    rerenderEditor();
    return;
  }

  if (act === 'del-item') {
    delPath(target, node.getAttribute('data-path'));
    rerenderEditor();
    return;
  }

  if (act === 'move') {
    var listPath = node.getAttribute('data-path');
    var index = Number(node.getAttribute('data-index'));
    var dir = Number(node.getAttribute('data-dir'));
    var items = getPath(target, listPath) || [];
    var next = index + dir;
    if (next >= 0 && next < items.length) {
      var moved = items.splice(index, 1)[0];
      items.splice(next, 0, moved);
      rerenderEditor();
    }
    return;
  }

  if (act === 'pick') {
    var pickPath = node.getAttribute('data-path');
    try {
      var url = await pickMedia();
      if (url) {
        setPath(target, pickPath, url);
        rerenderEditor();
      }
    } catch (error) { toast(error.message, true); }
    return;
  }

  if (act === 'add-section') {
    var typeSelect = document.getElementById('addSectionType');
    var type = typeSelect ? typeSelect.value : '';
    if (!type) return;
    state.draft.sections = state.draft.sections || [];
    state.draft.sections.push({ type: type, enabled: true, order: state.draft.sections.length + 1, data: {} });
    reorderSections();
    rerenderEditor();
    return;
  }

  if (act === 'del-section') {
    var delIndex = Number(node.getAttribute('data-index'));
    var delOpen = openSectionStates();
    state.draft.sections.splice(delIndex, 1);
    delOpen.splice(delIndex, 1);
    reorderSections();
    rerenderEditor(delOpen);
    return;
  }

  if (act === 'move-section') {
    var si = Number(node.getAttribute('data-index'));
    var sdir = Number(node.getAttribute('data-dir'));
    var sections = state.draft.sections;
    var sn = si + sdir;
    if (sn >= 0 && sn < sections.length) {
      var moveOpen = openSectionStates();
      sections.splice(sn, 0, sections.splice(si, 1)[0]);
      moveOpen.splice(sn, 0, moveOpen.splice(si, 1)[0]);
      reorderSections();
      rerenderEditor(moveOpen);
    }
    return;
  }

  if (act === 'blank-sections') {
    try {
      var product = state.products.filter(function (p) { return p.id === state.draft.productId; })[0];
      var res = await api('sections.blank', { type: product ? product.type : 'life' });
      state.draft.sections = res.sections;
      rerenderEditor([]);
    } catch (error) { toast(error.message, true); }
    return;
  }

  if (act === 'viewport') {
    state.viewport = node.getAttribute('data-size');
    document.querySelector('.preview-frame-wrap').setAttribute('data-viewport', state.viewport);
    Array.prototype.forEach.call(document.querySelectorAll('.viewport-btn'), function (button) {
      button.classList.toggle('is-active', button.getAttribute('data-size') === state.viewport);
    });
    return;
  }

  if (act === 'save-pixels') return savePixels();
  if (act === 'save-campaign') return saveCampaign(false);
  if (act === 'save-publish') return saveCampaign(true);
  if (act === 'save-product') return saveProduct();

  if (act === 'add-option') {
    addProductOption();
    return;
  }

  if (act === 'save-stock') {
    await saveStock(node.getAttribute('data-sku'));
    return;
  }

  if (act === 'publish') {
    try {
      await api('campaigns.publish', { id: node.getAttribute('data-id') });
      state.campaigns = (await api('campaigns.list')).campaigns;
      renderCampaignList();
    } catch (error) { toast(error.message, true); }
    return;
  }

  if (act === 'dup') {
    try {
      var copy = await api('campaigns.duplicate', { id: node.getAttribute('data-id') });
      state.campaigns = (await api('campaigns.list')).campaigns;
      location.hash = '#/campaigns/' + copy.campaign.id;
    } catch (error) { toast(error.message, true); }
    return;
  }

  if (act === 'del-campaign') {
    await deleteCampaign(node.getAttribute('data-id'));
    return;
  }

  if (act === 'edit-category') {
    var id = node.getAttribute('data-id');
    var category = state.categories.filter(function (c) { return c.id === id; })[0];
    categoryModal(category || null);
    return;
  }

  if (act === 'category-presets') {
    await presetPicker();
    return;
  }

  if (act === 'del-category') {
    await deleteCategory(node.getAttribute('data-id'), Number(node.getAttribute('data-count')) || 0);
    return;
  }

  if (act === 'del-product') {
    await deleteProduct(node.getAttribute('data-id'));
    return;
  }

  if (act === 'del-media') {
    await deleteMedia(node.getAttribute('data-id'));
  }
}

function openSectionStates() {
  return Array.prototype.map.call(
    document.querySelectorAll('.section-block'),
    function (block) { return block.open; },
  );
}

function rerenderEditor(openOverride) {
  var pageScroll = window.scrollY;
  var open = openOverride || openSectionStates();

  if (state.draft) renderCampaignEditor();
  else if (state.product) renderProductEditor();
  else return;

  Array.prototype.forEach.call(document.querySelectorAll('.section-block'), function (block, index) {
    if (open[index]) block.open = true;
  });
  window.scrollTo(0, pageScroll);
}

var lastHash = location.hash || '#/dashboard';
var revertingHash = false;

async function onHashChange() {
  if (revertingHash) { revertingHash = false; return; }

  if (isDirty()) {
    var proceed = await confirmDiscard();
    if (!proceed) {
      if (location.hash !== lastHash) {
        revertingHash = true;
        location.hash = lastHash;
      }
      return;
    }
  }

  clearDirty();
  lastHash = location.hash;
  await route();
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (event) {
  var stored = null;
  try { stored = localStorage.getItem('qiti-theme'); } catch (error) {}
  if (!stored) document.documentElement.dataset.theme = event.matches ? 'dark' : 'light';
});

document.addEventListener('input', onInput);
document.addEventListener('change', onInput);
document.addEventListener('click', onClick);
window.addEventListener('hashchange', onHashChange);

boot();
