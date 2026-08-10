/* ==========================================================================
   Qiti — تطبيق اللوحة الإدارية (نقطة الدخول)
   صفحة وحدة، بلا build، بلا إطار. الراوتينغ بالـ hash (router.js)، وكل
   الاتصالات تمرّ على فنكشن واحد (api.js) اللي يتأكّد من الجلسة قبل كل
   أكشن. هذا الملف يجمع كل الموديولات ويوصّل المستمعين — نفس النمط
   القديم (data-path/data-act مع مستمع واحد مفوَّض)، موزّع دروك على
   ملفات.
   ========================================================================== */
import { state } from './state.js';
import { api, loginStep } from './api.js';
import { getPath, setPath, delPath, toast } from './dom.js';
import { route } from './router.js';
import { renderLogin } from './pages/login.js';
import {
  renderCampaignList, renderCampaignEditor, saveCampaign, reorderSections,
  schedulePreview, deleteCampaign,
} from './pages/campaigns.js';
import { renderProductEditor, addProductOption, saveProduct, saveStock } from './pages/products.js';
import { categoryModal } from './pages/categories.js';
import { pickMedia, deleteMedia } from './pages/media.js';

var root = document.getElementById('adminRoot');

/* ── الإقلاع ────────────────────────────────────────────────────── */

/* function declaration (مهوب var) — باش تكون جاهزة فوراً وقت التحميل،
   لازمة لـ pages/login.js اللي يستوردها من هنا (استيراد دائري متعمّد،
   شوف الملاحظة في api.js) */
export async function boot() {
  root.classList.toggle('is-nav-collapsed', localStorage.getItem('qiti-admin-collapsed') === '1');

  try {
    /* أرخص طلب موجود — إذا رجع 401 فالمستمع في api.js يرمينا لشاشة الدخول */
    state.campaigns = (await api('campaigns.list')).campaigns;
    state.authed = true;
  } catch (error) {
    if (!state.authed) return;
    toast(error.message, true);
  }

  if (state.authed) {
    /* عدّاد الطلبات بلا قرار — يبان كبادج فوق "Orders" في الشريط الجانبي.
       فشلو ما يوقّفش الإقلاع، البادج غير يبقى 0. */
    try {
      state.pendingOrders = (await api('orders.pendingCount')).count;
    } catch (error) {
      state.pendingOrders = 0;
    }
  }

  await route();
}

/* ── المستمعات ──────────────────────────────────────────────────── */

/* مستمع واحد للكتابة: يقرا data-path ويكتب في الحالة. */
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

  /* معاينة الصورة الصغيرة تتبدّل فوراً بلا ما نعاودو بناء الفورم */
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

  /* ── الدرج (شاشة صغيرة) ── */
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
    return;
  }
  if (act === 'retry-route') { await route(); return; }

  /* زر "حمّل صورة" في حالة الصفحة الفارغة تاع الميديا — يفتح نافذة
     اختيار الملف الحقيقية بدل ما يكرّر منطق الرفع هنا */
  if (act === 'focus-media-upload') {
    var fileInput = document.getElementById('mediaFile');
    if (fileInput) fileInput.click();
    return;
  }

  /* ── تنقّل وجلسة ── */
  if (act === 'logout') {
    await loginStep({ step: 'logout' }).catch(function () {});
    state.authed = false;
    renderLogin();
    return;
  }

  /* ── قوائم داخل الفورم ── */
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
    var url = await pickMedia();
    if (url) {
      setPath(target, pickPath, url);
      rerenderEditor();
    }
    return;
  }

  /* ── أقسام الحملة ── */
  if (act === 'add-section') {
    var type = document.getElementById('addSectionType').value;
    if (!type) return;
    state.draft.sections = state.draft.sections || [];
    state.draft.sections.push({ type: type, enabled: true, order: state.draft.sections.length + 1, data: {} });
    reorderSections();
    renderCampaignEditor();
    return;
  }

  if (act === 'del-section') {
    state.draft.sections.splice(Number(node.getAttribute('data-index')), 1);
    reorderSections();
    renderCampaignEditor();
    return;
  }

  if (act === 'move-section') {
    var si = Number(node.getAttribute('data-index'));
    var sdir = Number(node.getAttribute('data-dir'));
    var sections = state.draft.sections;
    var sn = si + sdir;
    if (sn >= 0 && sn < sections.length) {
      var s = sections.splice(si, 1)[0];
      sections.splice(sn, 0, s);
      reorderSections();
      renderCampaignEditor();
    }
    return;
  }

  if (act === 'blank-sections') {
    var product = state.products.filter(function (p) { return p.id === state.draft.productId; })[0];
    var res = await api('sections.blank', { type: product ? product.type : 'life' });
    state.draft.sections = res.sections;
    renderCampaignEditor();
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

  /* ── حفظ ── */
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

  /* ── قوائم ── */
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

  if (act === 'del-media') {
    await deleteMedia(node.getAttribute('data-id'));
  }
}

/*
 * زيد/حيّد عنصر يفرض إعادة بناء الفورم. بلا هذا، كل ضغطة على "زيد"
 * تطوي كل الأقسام وترجّع التمرير لفوق — والمستخدم يضيع بلاصتو.
 */
function rerenderEditor() {
  var form = document.querySelector('.editor-form');
  var scrollTop = form ? form.scrollTop : 0;
  var open = Array.prototype.map.call(
    document.querySelectorAll('.section-block'),
    function (block) { return block.open; },
  );

  if (state.draft) renderCampaignEditor();
  else if (state.product) { renderProductEditor(); return; }
  else return;

  Array.prototype.forEach.call(document.querySelectorAll('.section-block'), function (block, index) {
    if (open[index]) block.open = true;
  });
  var next = document.querySelector('.editor-form');
  if (next) next.scrollTop = scrollTop;
}

/* ── الإقلاع ────────────────────────────────────────────────────── */

document.addEventListener('input', onInput);
document.addEventListener('change', onInput);
document.addEventListener('click', onClick);
window.addEventListener('hashchange', route);

boot();
