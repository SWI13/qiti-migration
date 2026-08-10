/* ==========================================================================
   Qiti admin — المنتجات (قائمة + محرّر + مخزون)
   ========================================================================== */
import { state } from '../state.js';
import { api } from '../api.js';
import { esc, toast, getPath } from '../dom.js';
import { fmtMoney } from '../format.js';
import { t } from '../i18n.js';
import { PRODUCT_FIELD_GROUPS, PRODUCT_CREATE_ONLY_FIELDS } from '../product-fields.js';
import { shell } from '../ui/shell.js';
import { fieldHtml } from '../ui/field-html.js';
import { stateBlock } from '../ui/state-block.js';

var root = document.getElementById('adminRoot');

/* ── قائمة المنتجات ─────────────────────────────────────────────── */

export function renderProductList() {
  var rows = state.products.map(function (product) {
    return '<div class="row-item">' +
        '<div>' +
          '<div class="row-item__name"><bdi>' + esc(product.name || t('campaigns.untitled')) + '</bdi></div>' +
          '<div class="row-item__meta">/p/' + esc(product.slug) + ' · ' + esc(fmtMoney(product.price)) + '</div>' +
        '</div>' +
        '<span class="badge">' + esc(product.type) + '</span>' +
        '<div class="row-item__actions">' +
          '<a class="btn btn--outline btn--xs" href="#/products/' + esc(product.id) + '">' + esc(t('common.edit')) + '</a>' +
        '</div>' +
      '</div>';
  }).join('');

  root.innerHTML = shell(
    t('products.title'),
    '<a class="btn btn--primary" href="#/products/new">' + esc(t('products.new')) + '</a>',
    '<div class="admin-card"><div class="row-list">' +
      (rows || stateBlock({
        variant: 'empty',
        title: t('products.emptyTitle'),
        body: t('products.emptyBody'),
        actionHref: '#/products/new',
        actionLabel: t('products.new'),
      })) +
    '</div></div>',
  );
}

/* ── مخزون الفاريانتات ──────────────────────────────────────────── */

function stockTable() {
  if (!state.stock.length) return '';
  var rows = state.stock.map(function (entry) {
    var labels = Object.keys(entry.variant.options || {}).map(function (key) {
      return key + ': ' + entry.variant.options[key];
    }).join(' · ') || t('stock.single');
    var low = entry.stock.qty <= entry.stock.threshold;
    return '<tr>' +
      '<td>' + esc(labels) + '</td>' +
      '<td class="' + (low ? 'stock-low' : '') + '">' +
        '<input type="number" min="0" value="' + Number(entry.stock.qty) + '" data-stock-qty="' + esc(entry.variant.sku) + '">' +
      '</td>' +
      '<td><input type="number" min="0" value="' + Number(entry.stock.threshold) + '" data-stock-threshold="' + esc(entry.variant.sku) + '"></td>' +
      '<td><button type="button" class="btn btn--outline btn--xs" data-act="save-stock" data-sku="' + esc(entry.variant.sku) + '">' + esc(t('common.save')) + '</button></td>' +
    '</tr>';
  }).join('');

  return '<div class="admin-card admin-card--form"><h3>' + esc(t('stock.title')) + '</h3>' +
    '<table class="stock-table"><thead><tr>' +
      '<th>' + esc(t('stock.variant')) + '</th><th>' + esc(t('stock.quantity')) + '</th><th>' + esc(t('stock.threshold')) + '</th><th></th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

export async function saveStock(sku) {
  try {
    await api('stock.set', {
      productId: state.product.id,
      sku: sku,
      qty: Number(document.querySelector('[data-stock-qty="' + sku + '"]').value),
      threshold: Number(document.querySelector('[data-stock-threshold="' + sku + '"]').value),
    });
    toast(t('stock.updated'));
  } catch (error) {
    toast(error.message, true);
  }
}

/* ── جدول الفاريانتات (SKU/باركود/فرق السومة) ──────────────────────
   منفصل عمدًا على جدول المخزون: هذا يتحفظ مع المنتج (زر الحفظ الرئيسي،
   state.product.variants)، وجدول المخزون يتحفظ روحو بـ stock.set لكل
   صف — خلطهم يخلّي حفظة توحل الثانية بالغلط. */
function variantTable(product) {
  if (!product.variants || !product.variants.length) return '';
  var rows = product.variants.map(function (variant, index) {
    var labels = Object.keys(variant.options || {}).map(function (key) {
      return key + ': ' + variant.options[key];
    }).join(' · ') || t('stock.single');
    return '<tr>' +
      '<td>' + esc(labels) + '</td>' +
      '<td><input type="text" data-path="variants.' + index + '.merchantSku" value="' + esc(variant.merchantSku || '') + '"></td>' +
      '<td><input type="text" data-path="variants.' + index + '.barcode" value="' + esc(variant.barcode || '') + '"></td>' +
      '<td><input type="number" data-path="variants.' + index + '.priceDelta" data-kind="number" value="' + Number(variant.priceDelta || 0) + '"></td>' +
    '</tr>';
  }).join('');

  return '<div class="admin-card admin-card--form"><h3>' + esc(t('variants.title')) + '</h3>' +
    '<table class="stock-table"><thead><tr>' +
      '<th>' + esc(t('stock.variant')) + '</th><th>' + esc(t('variants.merchantSku')) + '</th>' +
      '<th>' + esc(t('variants.barcode')) + '</th><th>' + esc(t('variants.priceDelta')) + '</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

/* ── هامش الربح (معاينة حيّة، ما يتخزّنش) ───────────────────────────
   readout ما عندهاش data-path (شوف field-html.js) — onInput العام في
   app.js ما يقدرش يكتبها فـ state.product أصلاً. هنا نبدّلوها يدويًا
   كل ما price/unitCost يتبدّلو. priceDelta ما يدخلش الحساب — قصدًا،
   الهامش على السومة الأصلية برك. */
function marginText(product) {
  var price = Number(product.price) || 0;
  var cost = Number(product.unitCost) || 0;
  if (!price || !cost) return '—';
  var profit = price - cost;
  return fmtMoney(profit) + ' · ' + Math.round((profit / price) * 100) + '%';
}

document.addEventListener('input', function (event) {
  var node = event.target;
  var path = node.getAttribute && node.getAttribute('data-path');
  if (path !== 'price' && path !== 'unitCost') return;
  var out = document.querySelector('[data-readout="profitMargin"]');
  if (!out || !state.product) return;

  /* onInput العام (app.js) يقدر يخدم قبلنا ولا بعدنا حسب ترتيب
     التسجيل — فنقرا القيمة الطرية من الحقل روحو بدل ما نثقو فـ
     state.product اللي يقدر يكون مازال ما تبدّلش */
  var price = path === 'price' ? Number(node.value) || 0 : Number(state.product.price) || 0;
  var cost = path === 'unitCost' ? Number(node.value) || 0 : Number(state.product.unitCost) || 0;
  out.textContent = marginText({ price: price, unitCost: cost });
});

/* ── محرّر المنتج ───────────────────────────────────────────────── */

/** يحلّ وصفة حقل: يترجم label/hint، ويعمّر options ديناميكية (فئات) */
function resolveDef(def, categoryOptions) {
  var out = Object.assign({}, def, { label: t(def.label) });
  if (def.hint) out.hint = t(def.hint);
  if (def.fields) out.fields = def.fields.map(function (f) { return resolveDef(f, categoryOptions); });
  if (def.optionsFrom === 'categories') out.options = categoryOptions;
  return out;
}

function fieldGroupHtml(group, product, categoryOptions) {
  var fields = group.fields;
  if (group.key === 'inventory' && !product.id) {
    fields = fields.concat(PRODUCT_CREATE_ONLY_FIELDS);
  }

  var html = fields.map(function (f) {
    var def = resolveDef(f, categoryOptions);
    var value = def.type === 'readout' ? marginText(product) : getPath(product, f.key);
    return fieldHtml(def, value, f.key);
  }).join('');

  return '<div class="admin-card admin-card--form">' +
    '<h3>' + esc(t(group.title)) + '</h3>' +
    '<div class="form-grid">' + html + '</div></div>';
}

export function renderProductEditor() {
  var product = state.product;

  var categoryOptions = [{ value: '', label: t('products.noCategory') }].concat(
    state.categories.map(function (c) { return { value: c.id, label: c.name }; }),
  );

  var optionsHtml = (product.options || []).map(function (option, index) {
    return '<div class="group-item">' +
      '<div class="group-item__head">' +
        '<button type="button" class="mini-btn mini-btn--danger" data-act="del-item" data-path="options.' + index + '" title="' + esc(t('common.delete')) + '">✕</button>' +
      '</div>' +
      fieldHtml({ key: 'name', label: t('products.optionName'), type: 'text', hint: t('products.optionNameHint') }, option.name, 'options.' + index + '.name') +
      fieldHtml({ key: 'values', label: t('products.optionValues'), type: 'lines', hint: t('products.optionValuesHint') }, option.values, 'options.' + index + '.values') +
    '</div>';
  }).join('');

  var groupsHtml = PRODUCT_FIELD_GROUPS.map(function (group) {
    return fieldGroupHtml(group, product, categoryOptions);
  }).join('');

  var body = groupsHtml +

    '<div class="admin-card admin-card--form">' +
      '<h3>' + esc(t('products.optionsTitle')) + '</h3>' +
      '<div class="hint" style="margin-bottom:10px">' + esc(t('products.optionsHint')) + '</div>' +
      '<div class="group-list">' + optionsHtml + '</div>' +
      '<button type="button" class="btn btn--outline btn--xs" data-act="add-option">' + esc(t('products.addOption')) + '</button>' +
    '</div>' +

    variantTable(product) +
    stockTable();

  root.innerHTML = shell(
    '⁦' + (product.name || t('campaigns.untitled')) + '⁩',
    '<a class="btn btn--outline" href="#/products">' + esc(t('common.back')) + '</a>' +
    '<button class="btn btn--primary" data-act="save-product">' + esc(t('common.save')) + '</button>',
    body,
  );
}

export function addProductOption() {
  state.product.options = state.product.options || [];
  state.product.options.push({ name: '', values: [] });
  renderProductEditor();
}

/* ── الحفظ ──────────────────────────────────────────────────────── */

export async function saveProduct() {
  try {
    var res = await api('products.save', { product: state.product });
    state.products = (await api('products.list')).products;
    if (location.hash !== '#/products/' + res.product.id) {
      location.hash = '#/products/' + res.product.id;
    } else {
      var full = await api('products.get', { id: res.product.id });
      state.product = full.product;
      state.stock = full.stock;
      renderProductEditor();
    }
    toast(t('products.saved'));
  } catch (error) {
    toast(error.message, true);
  }
}
