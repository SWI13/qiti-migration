import { state } from './state.js';
import { api } from './api.js';
import { t } from './i18n.js';
import { shell, NAV } from './ui/shell.js';
import { skeletonList, skeletonEditor, skeletonDashboard, skeletonTable, skeletonGrid } from './ui/skeleton.js';
import { stateBlock } from './ui/state-block.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderCampaignList, renderCampaignEditor } from './pages/campaigns.js';
import { renderProductList, renderProductEditor } from './pages/products.js';
import { renderCategories } from './pages/categories.js';
import { renderMedia } from './pages/media.js';
import { renderOrderList } from './pages/orders.js';
import { renderQueue, reloadQueue } from './pages/queue.js';
import { renderLogs, loadLogs } from './pages/logs.js';

export { NAV };

var root = document.getElementById('adminRoot');

var VIEW_TITLE = {
  dashboard: 'nav.dashboard',
  queue: 'nav.queue',
  orders: 'nav.orders',
  campaigns: 'nav.campaigns',
  products: 'nav.products',
  categories: 'nav.categories',
  media: 'nav.media',
  logs: 'nav.logs',
};

function loadingTitle() {
  return t(VIEW_TITLE[state.view] || 'nav.dashboard');
}

var LIST_VIEWS_WITH_ACTIONS = { dashboard: true, queue: true, orders: true, products: true, campaigns: true, categories: true, logs: true };

function loadingActions() {
  if (state.id || !LIST_VIEWS_WITH_ACTIONS[state.view]) return '';
  return '<div class="sk sk--line" style="width:220px;height:38px;margin:0;border-radius:var(--r-md)"></div>';
}

function loadingBody() {
  if (state.view === 'dashboard') return skeletonDashboard();
  if (state.id) return skeletonEditor();
  if (state.view === 'orders' || state.view === 'queue' || state.view === 'logs') return skeletonTable(8, 5);
  if (state.view === 'media') return skeletonGrid(8);
  return skeletonList();
}

export async function route() {
  if (!state.authed) return;

  var parts = (location.hash || '#/dashboard').replace(/^#\/?/, '').split('/');
  state.view = parts[0] || 'dashboard';
  state.id = parts[1] || null;
  state.draft = null;
  state.product = null;
  state.stock = [];

  root.classList.remove('is-nav-open');

  root.innerHTML = shell(loadingTitle(), loadingActions(), loadingBody());

  try {
    if (state.view === 'dashboard') {
      state.dashboard = (await api('dashboard.summary', { days: state.dashboardDays })).summary;
      renderDashboard();
      return;
    }

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

    if (state.view === 'queue') {
      await reloadQueue();
      renderQueue();
      return;
    }

    if (state.view === 'orders') {
      if (!state.products.length) state.products = (await api('products.list')).products;
      state.orders = (await api('orders.list')).orders;
      state.leads = await api('leads.list')
        .then(function (res) { return res.leads; })
        .catch(function () { return []; });
      state.pendingOrders = state.orders.filter(function (order) { return order.status === 'pending'; }).length;
      renderOrderList();
      return;
    }

    if (state.view === 'categories') {
      if (!state.products.length) state.products = (await api('products.list')).products;
      state.categories = (await api('categories.list')).categories;
      renderCategories();
      return;
    }

    if (state.view === 'logs') {
      await loadLogs();
      renderLogs();
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
