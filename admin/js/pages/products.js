/* ==========================================================================
   Qiti admin — المنتجات (قائمة + محرّر تبويبات + مخزون)
   ========================================================================== */
import { state } from '../state.js';
import { api } from '../api.js';
import { esc, toast, getPath } from '../dom.js';
import { fmtMoney } from '../format.js';
import { t } from '../i18n.js';
import { PRODUCT_FIELD_GROUPS, PRODUCT_CREATE_ONLY_FIELDS } from '../product-fields.js';
import { shell } from '../ui/shell.js';
import { fieldHtml } from '../ui/field-html.js';
import { dataTable } from '../ui/table.js';
import { menuHtml } from '../ui/menu.js';
import { tabsHtml, bindTabs } from '../ui/tabs.js';
import { validate, showErrors, clearErrors, markClean } from '../ui/form.js';
import { confirmDialog } from '../ui/dialog.js';

var root = document.getElementById('adminRoot');

/* ── قائمة المنتجات ─────────────────────────────────────────────── */

/* الفلتر يعيش على مستوى الموديول ويبقى بعد التنقّل — نفس نمط filter
   في pages/orders.js — باش أوّل رندر ما يلقاش القائمة خاوية بسبب بحث
   قديم، ماشي بسبب غياب المنتجات فعلاً. */
var listFilter = { q: '', status: 'all' };
var sort = { key: 'name', dir: 'asc' };

var STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'products.filterAll' },
  { value: 'active', label: 'products.filterActive' },
  { value: 'draft', label: 'products.filterDraft' },
  { value: 'archived', label: 'products.filterArchived' },
];

/* ثلاث حالات، ماشي زوج: 'draft' هي حالة المنتج اللي يتصنع من تيليغرام
   (بلا صور ولا وصف). قبل، القائمة كانت تعتبر كل ما ماشي 'archived'
   نشيط — فالمسودّة كانت تبان "Active" وهي ما توصلش للزبون. */
var STATUS_TONE = { active: 'success', draft: 'warn', archived: 'neutral' };
var STATUS_LABEL = {
  active: 'products.filterActive',
  draft: 'products.filterDraft',
  archived: 'products.filterArchived',
};
function statusOf(product) {
  return STATUS_TONE[product.status] ? product.status : 'active';
}

function matchesListFilter(product) {
  if (listFilter.status !== 'all' && product.status !== listFilter.status) return false;
  if (listFilter.q) {
    var q = listFilter.q.toLowerCase();
    var name = (product.name || '').toLowerCase();
    var slug = (product.slug || '').toLowerCase();
    if (name.indexOf(q) === -1 && slug.indexOf(q) === -1) return false;
  }
  return true;
}

function sortValue(product, key) {
  if (key === 'price') return Number(product.price) || 0;
  if (key === 'status') return statusOf(product);
  if (key === 'type') return product.type || '';
  return (product.name || '').toLowerCase();
}

function sortProducts(list) {
  var dir = sort.dir === 'asc' ? 1 : -1;
  return list.slice().sort(function (a, b) {
    var av = sortValue(a, sort.key);
    var bv = sortValue(b, sort.key);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

/* اسم المنتج هو الرابط للمحرّر — عمود كامل يتنقر أوسع من زر "بدّل"
   صغير في الطرف، وتحتو الـ slug باش المستخدم يعرف الرابط الحقيقي */
function nameCell(product) {
  return '<a class="dt-link" href="#/products/' + esc(product.id) + '">' +
      '<span class="dt-link__name"><bdi>' + esc(product.name || t('campaigns.untitled')) + '</bdi></span>' +
      '<span class="row-item__meta">/p/' + esc(product.slug) + '</span>' +
    '</a>';
}

function statusCell(product) {
  var status = statusOf(product);
  return '<span class="badge badge--' + STATUS_TONE[status] + '">' + esc(t(STATUS_LABEL[status])) + '</span>';
}

/* التعديل بارز، والحذف تحت "⋯" — نفس منطق قائمة الحملات: فعل بلا
   رجوع ما يتحطّش حدا فعل عادي تحت نفس الإبهام */
function productRowActions(product) {
  return '<a class="btn btn--outline btn--xs" href="#/products/' + esc(product.id) + '">' + esc(t('common.edit')) + '</a> ' +
    menuHtml({
      items: [{ label: t('common.delete'), icon: 'trash', act: 'del-product', id: product.id, danger: true }],
      label: t('products.rowMenuLabel', { name: product.name || t('products.untitled') }),
    });
}

function productColumns() {
  return [
    { key: 'name', label: t('products.colName'), sortable: true, render: nameCell },
    { key: 'type', label: t('products.colType'), sortable: true,
      render: function (row) { return esc(row.type || '—'); } },
    { key: 'price', label: t('products.colPrice'), sortable: true, numeric: true,
      render: function (row) { return esc(fmtMoney(row.price)); } },
    { key: 'status', label: t('products.colStatus'), sortable: true, render: statusCell },
    { key: 'actions', label: '', render: productRowActions },
  ];
}

/* فارغ حقيقي (ولا منتج أصلاً) ماشي هو نفسو فارغ من الفلتر — الرسالة
   لازمها تقول للمستخدم واش يدير: يبدا منتج، ولا يبدّل البحث/الفلتر. */
function emptyOpts() {
  if (!state.products.length) {
    return {
      variant: 'empty',
      title: t('products.emptyTitle'),
      body: t('products.emptyBody'),
      actionHref: '#/products/new',
      actionLabel: t('products.new'),
    };
  }
  return {
    variant: 'empty',
    title: t('products.emptyFilteredTitle'),
    body: t('products.emptyFilteredBody'),
  };
}

function listRegionHtml() {
  return dataTable({
    columns: productColumns(),
    rows: sortProducts(state.products.filter(matchesListFilter)),
    sort: sort,
    onSortAct: 'products-sort',
    empty: emptyOpts(),
  });
}

export function renderProductList() {
  var actions =
    '<input type="text" id="productSearch" placeholder="' + esc(t('products.searchPlaceholder')) +
      '" aria-label="' + esc(t('products.searchPlaceholder')) + '" value="' + esc(listFilter.q) + '">' +
    '<select id="productStatusFilter" aria-label="' + esc(t('products.filterAriaLabel')) + '">' +
      STATUS_FILTER_OPTIONS.map(function (opt) {
        return '<option value="' + opt.value + '"' + (listFilter.status === opt.value ? ' selected' : '') + '>' + esc(t(opt.label)) + '</option>';
      }).join('') +
    '</select>' +
    '<a class="btn btn--primary" href="#/products/new">' + esc(t('products.new')) + '</a>';

  root.innerHTML = shell(
    t('products.title'),
    actions,
    '<div class="admin-card admin-card--form" id="productsCard">' + listRegionHtml() + '</div>',
  );

  /* البحث/الفلتر/الترتيب يعاودو يبنيو داخل الكارت برك — البار فوق ما
     يتلمسش، وإلا حقل البحث يخسر الفوكس مع كل حرف يتكتب */
  var card = document.getElementById('productsCard');
  function refresh() { card.innerHTML = listRegionHtml(); }

  document.getElementById('productSearch').addEventListener('input', function (event) {
    listFilter.q = event.target.value.trim();
    refresh();
  });
  document.getElementById('productStatusFilter').addEventListener('change', function (event) {
    listFilter.status = event.target.value;
    refresh();
  });

  /* الكارت روحو ما يتبدّلش (غير innerHTML تاعو) — تسجيل مرّة وحدة يكفي */
  card.addEventListener('click', function (event) {
    var sortBtn = event.target.closest('[data-act="products-sort"]');
    if (!sortBtn) return;
    sort = { key: sortBtn.getAttribute('data-sort-key'), dir: sortBtn.getAttribute('data-sort-dir') };
    refresh();
  });
}

/* ── مخزون الفاريانتات ──────────────────────────────────────────── */

/* .stock-table (components.css) هو المعيار — نفسو .data-table بصح
   بأقلّ عرض وقاعدة خاصة لـ input[type=number]/td.stock-low. جدول
   بـ render() مبني بـ dataTable() ما يقدرش يزيد class على <td> واحدة
   (علامة "ناقص") ولا على <input> بلا ما يعقّد الوصفة لخدمة صف واحد —
   هنا اليد أوضح من التجريد. */
function stockTable() {
  if (!state.stock.length) return '';
  var rows = state.stock.map(function (entry) {
    var labels = Object.keys(entry.variant.options || {}).map(function (key) {
      return key + ': ' + entry.variant.options[key];
    }).join(' · ') || t('stock.single');
    var low = entry.stock.qty <= entry.stock.threshold;
    /* الجدول هو التسمية البصرية (رأس العمود) — بصح قارئ الشاشة ما
       يربطهاش بالـ <input> وحدو، فنزيدو aria-label صريح لكل خانة
       (اسم العمود + الفاريانت) */
    return '<tr>' +
      '<td>' + esc(labels) + '</td>' +
      '<td class="' + (low ? 'stock-low' : '') + '">' +
        '<input type="number" min="0" value="' + Number(entry.stock.qty) + '" data-stock-qty="' + esc(entry.variant.sku) + '" aria-label="' + esc(t('stock.quantity') + ' — ' + labels) + '">' +
      '</td>' +
      '<td><input type="number" min="0" value="' + Number(entry.stock.threshold) + '" data-stock-threshold="' + esc(entry.variant.sku) + '" aria-label="' + esc(t('stock.threshold') + ' — ' + labels) + '"></td>' +
      '<td><button type="button" class="btn btn--outline btn--xs" data-act="save-stock" data-sku="' + esc(entry.variant.sku) + '">' + esc(t('common.save')) + '</button></td>' +
    '</tr>';
  }).join('');

  return '<div class="admin-card admin-card--form"><h3>' + esc(t('stock.title')) + '</h3>' +
    '<div class="table-wrap"><table class="stock-table"><thead><tr>' +
      '<th>' + esc(t('stock.variant')) + '</th><th>' + esc(t('stock.quantity')) + '</th><th>' + esc(t('stock.threshold')) + '</th><th></th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}

export async function saveStock(sku) {
  var btn = document.querySelector('[data-act="save-stock"][data-sku="' + sku + '"]');
  if (btn) {
    if (btn.classList.contains('is-busy')) return;   // يمنع بعث مزدوج بضغطة ثانية بينما الطلب ماشي
    btn.classList.add('is-busy');
    btn.disabled = true;
  }
  try {
    var qtyInput = document.querySelector('[data-stock-qty="' + sku + '"]');
    var thresholdInput = document.querySelector('[data-stock-threshold="' + sku + '"]');
    var res = await api('stock.set', {
      productId: state.product.id,
      sku: sku,
      qty: Number(qtyInput.value),
      threshold: Number(thresholdInput.value),
    });

    var entry = state.stock.filter(function (e) { return e.variant.sku === sku; })[0];
    if (entry) entry.stock = res.stock;
    /* نحدّثو الخانة والعلامة الحمرا بلا ما نعاودو نبنيو الجدول كامل —
       رندر كامل يطيّح فوكس/تعديلات جارية في صفوف أخرى */
    qtyInput.value = res.stock.qty;
    thresholdInput.value = res.stock.threshold;
    var qtyCell = qtyInput.closest('td');
    if (qtyCell) qtyCell.classList.toggle('stock-low', res.stock.qty <= res.stock.threshold);

    toast(t('stock.updated'));
  } catch (error) {
    toast(error.message, true);
  } finally {
    if (btn) { btn.classList.remove('is-busy'); btn.disabled = false; }
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
    var labelFor = function (key) { return esc(t(key) + ' — ' + labels); };
    return '<tr>' +
      '<td>' + esc(labels) + '</td>' +
      '<td><input type="text" data-path="variants.' + index + '.merchantSku" aria-label="' + labelFor('variants.merchantSku') + '" value="' + esc(variant.merchantSku || '') + '"></td>' +
      '<td><input type="text" data-path="variants.' + index + '.barcode" aria-label="' + labelFor('variants.barcode') + '" value="' + esc(variant.barcode || '') + '"></td>' +
      '<td><input type="number" data-path="variants.' + index + '.priceDelta" data-kind="number" aria-label="' + labelFor('variants.priceDelta') + '" value="' + Number(variant.priceDelta || 0) + '"></td>' +
    '</tr>';
  }).join('');

  return '<div class="admin-card admin-card--form"><h3>' + esc(t('variants.title')) + '</h3>' +
    '<div class="table-wrap"><table class="stock-table"><thead><tr>' +
      '<th>' + esc(t('stock.variant')) + '</th><th>' + esc(t('variants.merchantSku')) + '</th>' +
      '<th>' + esc(t('variants.barcode')) + '</th><th>' + esc(t('variants.priceDelta')) + '</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
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

/* ── محرّر المنتج (تبويبات) ─────────────────────────────────────── */

/* ترتيب العرض + مطابقة كل مسار حقل نتحقّق منّو للتبويب اللي فيه — باش
   showErrors() ورسالتو يوصلو لتبويب مفتوح ماشي مطوي وراه. */
var TAB_ORDER = ['basic', 'pricing', 'inventory', 'variants', 'organize', 'shipping', 'seo'];
var PATH_TAB = {
  name: 'basic', slug: 'basic',
  price: 'pricing', compareAtPrice: 'pricing', unitCost: 'pricing',
  defaultStockThreshold: 'inventory',
};
function tabOf(path) {
  return PATH_TAB[path] || PATH_TAB[path.split('.')[0]] || 'basic';
}

/* التبويب المفتوح حاليًا — يعيش برّا الرندر باش زيد/حذف عنصر (نفس
   المحرّر، نفس المنتج) ما يرجّعش المستخدم لأوّل تبويب بالغلط. */
var activeTab = 'basic';
/* آخر منتج (بالمرجع) رندرينا لو markClean — رندر بنفس المرجع معناه
   تعديل داخلي (add-item/del-item/move عبر rerenderEditor في app.js)
   ماشي فتح محرّر جديد، فما نديروش markClean عليه: هذا كان يمحي فعلاً
   حالة "متغيّر" حقيقية (زيادة خيار هي تعديل يستاهل تحذير قبل ما يضيع). */
var markedProduct = null;

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

function groupHtmlByKey(key, product, categoryOptions) {
  var group = PRODUCT_FIELD_GROUPS.filter(function (g) { return g.key === key; })[0];
  return group ? fieldGroupHtml(group, product, categoryOptions) : '';
}

function optionsBlockHtml(product) {
  var optionsHtml = (product.options || []).map(function (option, index) {
    return '<div class="group-item">' +
      '<div class="group-item__head">' +
        '<button type="button" class="mini-btn mini-btn--danger" data-act="del-item" data-path="options.' + index + '" title="' + esc(t('common.delete')) + '">✕</button>' +
      '</div>' +
      fieldHtml({ key: 'name', label: t('products.optionName'), type: 'text', hint: t('products.optionNameHint') }, option.name, 'options.' + index + '.name') +
      fieldHtml({ key: 'values', label: t('products.optionValues'), type: 'lines', hint: t('products.optionValuesHint') }, option.values, 'options.' + index + '.values') +
    '</div>';
  }).join('');

  return '<div class="admin-card admin-card--form">' +
    '<h3>' + esc(t('products.optionsTitle')) + '</h3>' +
    '<div class="hint" style="margin-bottom:10px">' + esc(t('products.optionsHint')) + '</div>' +
    '<div class="group-list">' + optionsHtml + '</div>' +
    '<button type="button" class="btn btn--outline btn--xs" data-act="add-option">' + esc(t('products.addOption')) + '</button>' +
  '</div>';
}

export function renderProductEditor() {
  var product = state.product;

  var categoryOptions = [{ value: '', label: t('products.noCategory') }].concat(
    state.categories.map(function (c) { return { value: c.id, label: c.name }; }),
  );

  var tabs = [
    { key: 'basic', label: t('products.tabBasic'),
      panel: groupHtmlByKey('basics', product, categoryOptions) + groupHtmlByKey('media', product, categoryOptions) },
    { key: 'pricing', label: t('products.tabPricing'),
      panel: groupHtmlByKey('pricing', product, categoryOptions) },
    { key: 'inventory', label: t('products.tabInventory'),
      panel: groupHtmlByKey('inventory', product, categoryOptions) + stockTable() },
    { key: 'variants', label: t('products.tabVariants'),
      panel: optionsBlockHtml(product) + variantTable(product) },
    { key: 'organize', label: t('products.tabOrganize'),
      panel: groupHtmlByKey('organize', product, categoryOptions) },
    { key: 'shipping', label: t('products.tabShipping'),
      panel: groupHtmlByKey('shipping', product, categoryOptions) },
    { key: 'seo', label: t('products.tabSeo'),
      panel: groupHtmlByKey('seo', product, categoryOptions) },
  ];

  /* مرجع جديد = محرّر جديد (فتح صفحة، ولا حفظ ناجح جاب نسخة طرية من
     السيرفر) — نرجّعو لأوّل تبويب ونثبّتو نسخة "نظيفة" جديدة. نفس
     المرجع (زيادة/حذف عنصر عبر rerenderEditor) يبقى بلا تبديل. */
  var freshSession = product !== markedProduct;
  if (freshSession) {
    activeTab = 'basic';
    markedProduct = product;
  }

  root.innerHTML = shell(
    product.name || t('campaigns.untitled'),
    '<a class="btn btn--outline" href="#/products">' + esc(t('common.back')) + '</a>' +
    '<button class="btn btn--primary" data-act="save-product">' + esc(t('common.save')) + '</button>',
    tabsHtml({ id: 'prodTabs', tabs: tabs, active: activeTab }),
  );

  bindTabs(root, function (key) { activeTab = key; });

  /* النسخة النظيفة تتثبّت غير مع محرّر جديد. لو ثبّتناها في كل رندر،
     "زيد خيار" (اللي يعاود يبني الفورم على نفس الكائن) يخلّي التبديل
     اللي راه واقف يولّي "محفوظ" في عين الحارس — والمستخدم يخرج ويضيّعو
     بلا سؤال. */
  if (freshSession) markClean(product, function () { return state.product; });
}

export function addProductOption() {
  state.product.options = state.product.options || [];
  state.product.options.push({ name: '', values: [] });
  renderProductEditor();
}

/* ── الحفظ ──────────────────────────────────────────────────────── */

var SAVE_RULES = {
  name: { required: true },
  slug: { required: true, slug: true },
  price: { required: true, positiveNumber: true },
  unitCost: { min: 0 },
  compareAtPrice: { min: 0 },
  defaultStockThreshold: { min: 0 },
};

/* بادج عدد الأخطاء على التبويبات المطوية — بلاه، خطأ في حقل تحت تبويب
   ماشي مفتوح يبقى مخبّي كامل، والمستخدم يضغط "احفظ" عشرة مرّات بلا ما يفهم علاش يرفض. */
function paintTabBadges(errors) {
  Array.prototype.forEach.call(root.querySelectorAll('.tabs__tab .tab-error-badge'), function (b) { b.remove(); });
  if (!errors) return;
  var counts = {};
  Object.keys(errors).forEach(function (path) {
    var key = tabOf(path);
    counts[key] = (counts[key] || 0) + 1;
  });
  Object.keys(counts).forEach(function (key) {
    var tabBtn = root.querySelector('[data-tab="' + key + '"]');
    if (!tabBtn) return;
    var badge = document.createElement('span');
    badge.className = 'badge badge--danger tab-error-badge';
    badge.textContent = String(counts[key]);
    tabBtn.appendChild(badge);
  });
}

export async function saveProduct() {
  var btn = document.querySelector('[data-act="save-product"]');
  if (btn && btn.classList.contains('is-busy')) return;   // يمنع بعث مزدوج

  var result = validate(state.product, SAVE_RULES);
  if (!result.ok) {
    var firstTab = TAB_ORDER.filter(function (key) {
      return Object.keys(result.errors).some(function (path) { return tabOf(path) === key; });
    })[0];
    if (firstTab) {
      var tabBtn = root.querySelector('[data-tab="' + firstTab + '"]');
      /* نبدّلو التبويب قبل showErrors() — وإلا الحقل الأوّل يبقى جوّا
         لوح مطوي (hidden) وما يقدرش ياخذ الفوكس */
      if (tabBtn && tabBtn.getAttribute('aria-selected') !== 'true') tabBtn.click();
    }
    var marked = showErrors(root, result.errors);
    paintTabBadges(result.errors);
    toast(t('validation.summary', { n: marked }), true);
    return;   // بلا اتصال بالسيرفر — التحقّق طاح قبل ما نبعثو حتى بايت
  }

  clearErrors(root);
  paintTabBadges(null);

  if (btn) { btn.classList.add('is-busy'); btn.disabled = true; }
  try {
    var res = await api('products.save', { product: state.product });

    /* الجواب يرجع أوّلاً في state.product، والنسخة النظيفة تتثبّت عليه
       قبل أي تبديل في الـ hash. بلا هذا، منتج جديد يبقى بلا id في
       الحالة والحارس يقارن ضدّ نسخة فارغة:
         1. تنقّل بعد الحفظ يسأل "تحبّ تضيّع تبديلاتك؟" ورا توست نجاح،
         2. وإذا المستخدم قال "بقّاني"، ضغطة حفظ ثانية تبني منتج
            ثاني كامل (catalog.mjs يعطي id جديد كي ما يلقى حتى واحد)
            وتعاود تزرع المخزون الابتدائي.
       campaigns.js يدير نفس الترتيب لنفس السبب. */
    state.product = res.product;
    markClean(state.product, function () { return state.product; });
    markedProduct = state.product;

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
  } finally {
    /* renderProductEditor() يقدر يكون بنى فورم جديد كامل (حفظ ناجح) —
       الزر القديم ما بقاش في الـ DOM، نلقاوه من جديد بدل ما نتّكلو على المرجع */
    var btnAfter = document.querySelector('[data-act="save-product"]');
    if (btnAfter) { btnAfter.classList.remove('is-busy'); btnAfter.disabled = false; }
  }
}

/*
 * الحذف نهائي (الرابط، المخزون، السجلّ) — علاش التأكيد يقول بالضبط
 * واش يروح بدل "متأكد؟" عامّة.
 *
 * السيرفر يردّ الحذف على منتج عندو طلبات ويرجّع سبب مكتوب — نعرضوه
 * كيما هو بدل ما نعاودو نفس الفحص هنا: فحص واحد في بلاصة وحدة ما
 * يقدرش يختلف مع الآخر.
 */
export async function deleteProduct(id) {
  var product = state.products.filter(function (p) { return p.id === id; })[0];
  var confirmed = await confirmDialog({
    title: t('products.deleteConfirmTitle', { name: (product && product.name) || t('products.untitled') }),
    body: t('products.deleteConfirmBody'),
    confirmLabel: t('common.delete'),
    danger: true,
  });
  if (!confirmed) return;

  try {
    await api('products.delete', { id: id });
    state.products = (await api('products.list')).products;
    renderProductList();
    toast(t('products.deleted'));
  } catch (error) {
    toast(error.message, true);
  }
}
