/* ==========================================================================
   Qiti admin — الراوتينغ
   الراوتينغ بالـ hash، بلا مكتبة. route() تقرا location.hash، تجيب
   الداتا، وتنادي رندر الصفحة المناسبة. NAV مُصدّرة من ui/shell.js —
   شوف الملاحظة هناك على علاش (تفادي حلقة استيراد).
   ========================================================================== */
import { state } from './state.js';
import { api } from './api.js';
import { t } from './i18n.js';
import { shell, NAV } from './ui/shell.js';
import { skeletonList, skeletonEditor } from './ui/skeleton.js';
import { stateBlock } from './ui/state-block.js';
import { renderCampaignList, renderCampaignEditor } from './pages/campaigns.js';
import { renderProductList, renderProductEditor } from './pages/products.js';
import { renderCategories } from './pages/categories.js';
import { renderMedia } from './pages/media.js';
import { renderOrderList } from './pages/orders.js';

export { NAV };

var root = document.getElementById('adminRoot');

var VIEW_TITLE = {
  orders: 'nav.orders',
  campaigns: 'nav.campaigns',
  products: 'nav.products',
  categories: 'nav.categories',
  media: 'nav.media',
};

function loadingTitle() {
  return t(VIEW_TITLE[state.view] || 'nav.campaigns');
}

export async function route() {
  if (!state.authed) return;

  var parts = (location.hash || '#/campaigns').replace(/^#\/?/, '').split('/');
  state.view = parts[0] || 'campaigns';
  state.id = parts[1] || null;
  state.draft = null;
  state.product = null;
  state.stock = [];

  /* التنقّل يسكّر الدرج (شاشة صغيرة) — البقاء مفتوح بعد اختيار صفحة يبان غالط */
  root.classList.remove('is-nav-open');

  root.innerHTML = shell(loadingTitle(), '', state.id ? skeletonEditor() : skeletonList());

  try {
    if (state.view === 'campaigns' && state.id) {
      if (state.id === 'new') {
        state.draft = { name: '', slug: '', productId: null, theme: {}, sections: [], status: 'draft', seo: {} };
      } else {
        state.draft = (await api('campaigns.get', { id: state.id })).campaign;
      }
      if (!state.products.length) state.products = (await api('products.list')).products;
      renderCampaignEditor();
      return;
    }

    if (state.view === 'products' && state.id) {
      if (state.id === 'new') {
        state.product = { name: '', slug: '', type: 'life', price: 0, unitCost: 0, options: [], status: 'active' };
      } else {
        var res = await api('products.get', { id: state.id });
        state.product = res.product;
        state.stock = res.stock;
      }
      if (!state.categories.length) state.categories = (await api('categories.list')).categories;
      renderProductEditor();
      return;
    }

    if (state.view === 'products') {
      state.products = (await api('products.list')).products;
      renderProductList();
      return;
    }

    if (state.view === 'orders') {
      if (!state.products.length) state.products = (await api('products.list')).products;
      state.orders = (await api('orders.list')).orders;
      renderOrderList();
      return;
    }

    if (state.view === 'categories') {
      state.categories = (await api('categories.list')).categories;
      renderCategories();
      return;
    }

    if (state.view === 'media') {
      state.media = (await api('media.list')).media;
      renderMedia();
      return;
    }

    state.view = 'campaigns';
    state.campaigns = (await api('campaigns.list')).campaigns;
    renderCampaignList();
  } catch (error) {
    if (state.authed) {
      root.innerHTML = shell(loadingTitle(), '', stateBlock({
        variant: 'error',
        title: t('state.errorTitle'),
        body: error.message,
        actionLabel: t('state.retry'),
        actionAct: 'retry-route',
      }));
    }
  }
}
