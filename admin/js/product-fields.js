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

export var PRODUCT_CREATE_ONLY_FIELDS = [
  num('initialStock', 'products.initialStock', 'products.initialStockHint'),
];
