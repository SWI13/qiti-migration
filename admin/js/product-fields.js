/* ==========================================================================
   Qiti admin — وصفة حقول المنتج
   نفس فكرة section-fields.js (وصفة → fieldHtml يبني الـ HTML) بصح ملف
   وحدو: check-admin-fields.mjs يقرا نطاق SECTION_FIELDS بالضبط، وحقول
   المنتج ما عندهاش علاقة بأقسام الحملة — نخليوها برّا باش السكريبت
   هذاك ما يتخبّطش.

   ⚠️ المسارات هنا جذرية (root-relative) — "shipping.weightGrams" ماشي
   "sections.N.data...". products.js يبعث def.key مباشرة كـ path
   لـ fieldHtml، وsetPath في dom.js يصنع الكائنات الناقصة في الطريق.

   ترتيب المصفوفة هو نفسو ترتيب التبويبات في المحرّر (شوف TAB_ORDER
   في products.js) — basics+media يتجمّعو في تبويب "Basic" وحدو، والباقي
   تبويب لكل قسم. زيد قسم هنا؟ زيد مفتاحو لـ TAB_ORDER ثاني وإلا
   يبقى معروض بلا تبويب.
   ========================================================================== */
import { field, area, num, img, bool, lines, list, readout, PRODUCT_TYPES } from './section-fields.js';

export var PRODUCT_FIELD_GROUPS = [
  { key: 'basics', title: 'products.groupBasics', fields: [
    field('name', 'products.name'),
    field('slug', 'products.slug', 'products.slugHint'),
    area('shortDescription', 'products.shortDescription', 'products.shortDescriptionHint'),
    area('description', 'products.description', 'products.descriptionHint'),
  ] },
  { key: 'media', title: 'products.groupMedia', fields: [
    list('media', 'products.media', [
      img('src', 'products.mediaSrc'),
      field('alt', 'products.mediaAlt', 'products.mediaAltHint'),
    ], 'products.mediaHint'),
  ] },
  { key: 'pricing', title: 'products.groupPricing', fields: [
    num('price', 'products.price'),
    num('compareAtPrice', 'products.compareAtPrice', 'products.compareAtPriceHint'),
    num('unitCost', 'products.unitCost', 'products.unitCostHint'),
    readout('profitMargin', 'products.profitMargin', 'products.profitMarginHint'),
  ] },
  { key: 'inventory', title: 'products.groupInventory', fields: [
    num('defaultStockThreshold', 'products.defaultStockThreshold', 'products.defaultStockThresholdHint'),
  ] },
  { key: 'organize', title: 'products.groupOrganize', fields: [
    { key: 'type', label: 'products.type', type: 'select', options: PRODUCT_TYPES },
    { key: 'categoryId', label: 'products.category', type: 'select', optionsFrom: 'categories' },
    lines('tags', 'products.tags', 'products.tagsHint'),
    /* Draft لازمها تكون هنا: المنتج اللي يتصنع من تيليغرام يجي 'draft'،
       وبلا خيار يمثّلها الـ select ما يوري حتى حاجة مختارة — وأوّل حفظ
       يقلبها لـ active بالسكات ويطلّع للمتجر منتج بلا صور. */
    { key: 'status', label: 'products.status', type: 'select', options: [
      { value: 'active', label: 'Active' },
      { value: 'draft', label: 'Draft — not in the store yet' },
      { value: 'archived', label: 'Archived' } ] },
    bool('featured', 'products.featured'),
  ] },
  { key: 'shipping', title: 'products.groupShipping', fields: [
    num('shipping.weightGrams', 'products.weightGrams', 'products.weightGramsHint'),
    area('shipping.note', 'products.shippingNote', 'products.shippingNoteHint'),
  ] },
  { key: 'seo', title: 'products.groupSeo', fields: [
    field('seo.title', 'products.seoTitle', 'products.seoTitleHint'),
    area('seo.description', 'products.seoDescription', 'products.seoDescriptionHint'),
    img('seo.ogImage', 'products.seoOgImage', 'products.seoOgImageHint'),
  ] },
];

/* initialStock: مدخل كتابة مرّة وحدة، غير وقت الإنشاء (شوف catalog.mjs
   saveProduct — يبذر المخزون ما يتخزّنش هو روحو في السجل). products.js
   يزيدها لقسم inventory غير كي !state.product.id */
export var PRODUCT_CREATE_ONLY_FIELDS = [
  num('initialStock', 'products.initialStock', 'products.initialStockHint'),
];
