/* ==========================================================================
   Qiti admin — وصفة حقول الأقسام
   الفورم ما يتكتبش بيد حقل بحقل. كل قسم عندو "وصفة" حقول (SECTION_FIELDS)،
   واللوحة تبني منها الـ HTML وحدها. زيد قسم جديد في الرندر؟ زيد وصفتو
   هنا وخلاص — بلا ما تلمس أي كود واجهة آخر.

   ⚠️ المفاتيح (المعامل الأول لكل field()/area()/num()/...) لازم تبقى
   بالضبط كيما هي — scripts/check-admin-fields.mjs ونتلifylib/render/
   sections/*.mjs يعتمدو عليها حرف بحرف. اللي يتبدّل هو التسمية (label)
   برك — من العربية للإنجليزية، هي نص واجهة اللوحة، ماشي محتوى التاجر.
   ========================================================================== */

/* نفس قائمة sprite.mjs — الأيقونة اللي ماشي فيها ما تتعرضش أصلاً */
export var ICONS = ['i-pin', 'i-zap', 'i-drop', 'i-phone', 'i-globe', 'i-heart', 'i-shield',
  'i-feather', 'i-radio', 'i-check', 'i-chevron', 'i-menu', 'i-x', 'i-sun', 'i-moon',
  'i-arrow-rtl', 'i-play', 'i-box', 'i-undo', 'i-link', 'i-cash', 'i-truck', 'i-store',
  'i-user', 'i-call', 'i-bubble', 'i-send'];

export var PRODUCT_TYPES = [
  { value: 'pet', label: 'Pets' },
  { value: 'clothing', label: 'Clothing' },
  { value: 'auto', label: 'Auto' },
  { value: 'tech', label: 'Tech' },
  { value: 'life', label: 'Everyday life' },
];

export var FONTS = [
  { value: 'tajawal', label: 'Tajawal' },
  { value: 'cairo', label: 'Cairo' },
  { value: 'almarai', label: 'Almarai' },
];

export var RADII = [
  { value: 'sharp', label: 'Sharp corners' },
  { value: 'soft', label: 'Soft corners' },
  { value: 'round', label: 'Rounded corners' },
];

export var SECTION_LABELS = {
  hero: 'Hero',
  trust: 'Trust',
  features: 'Features',
  how: 'How it works',
  lifestyle: 'Lifestyle',
  gallery: 'Gallery & specs',
  reviews: 'Customer reviews',
  faq: 'FAQ',
  cta: 'Final CTA',
  order: 'Order form',
};

/* ── وصفات الحقول ───────────────────────────────────────────────── */

/* اسمها field() ماشي t() — t() صارت i18n.js تاع شاسي اللوحة، وهذي
   كانت راهي تصطدم معاها. المفاتيح ما تبدّلاتش، هي اللي يعتمد عليها
   check-admin-fields.mjs. */
export var field = function (key, label, hint) { return { key: key, label: label, type: 'text', hint: hint }; };
export var area = function (key, label, hint) { return { key: key, label: label, type: 'area', hint: hint }; };
export var num = function (key, label, hint) { return { key: key, label: label, type: 'number', hint: hint }; };
export var img = function (key, label, hint) { return { key: key, label: label, type: 'image', hint: hint }; };
export var ico = function (key, label) { return { key: key, label: label, type: 'icon' }; };
export var bool = function (key, label) { return { key: key, label: label, type: 'bool' }; };
export var lines = function (key, label, hint) { return { key: key, label: label, type: 'lines', hint: hint }; };
export var list = function (key, label, fields, hint) {
  return { key: key, label: label, type: 'list', fields: fields, hint: hint };
};
/* readout: عرض محسوب برك — بلا data-path (شوف field-html.js وproduct-fields.js) */
export var readout = function (key, label, hint) { return { key: key, label: label, type: 'readout', hint: hint }; };

/*
 * الحقول تتبع بالضبط واش يقراه كل قسم في netlify/lib/render/sections/.
 * حقل ماشي هنا = حقل الزبون ما يشوفوش عمرو. لو زدت حقل في قسم، زيدو هنا.
 */
export var SECTION_FIELDS = {
  hero: [
    field('title', 'Headline'),
    area('subtitle', 'Subtext'),
    img('image', 'Main image'),
    field('imageAlt', 'Image description', 'For screen readers, and for Google'),
    field('rating', 'Rating', 'e.g. 4.8 — only shows if filled in'),
    field('ratingNote', 'Rating note'),
    field('ctaLabel', 'Order button'),
    field('ctaHref', 'Order button link', 'Leave it as #order'),
    field('secondaryLabel', 'Second button'),
    field('secondaryHref', 'Second button link'),
    field('priceNote', 'Price note'),
    lines('assurances', 'Assurances', 'One per line'),
    list('floatCards', 'Floating cards (2 max)', [ico('icon', 'Icon'), field('title', 'Title'), field('note', 'Note')]),
  ],
  trust: [
    field('rating', 'Rating'),
    field('headline', 'Headline'),
    list('badges', 'Badges', [ico('icon', 'Icon'), field('label', 'Text')]),
    list('stats', 'Stats', [field('value', 'Number'), field('suffix', 'Suffix'), field('label', 'Label')]),
  ],
  features: [
    field('eyebrow', 'Eyebrow line'),
    field('title', 'Title'),
    area('subtitle', 'Subtext'),
    list('cards', 'Feature cards', [ico('icon', 'Icon'), field('title', 'Title'), area('body', 'Body')]),
  ],
  how: [
    field('eyebrow', 'Eyebrow line'),
    field('title', 'Title'),
    area('subtitle', 'Subtext'),
    list('steps', 'Steps', [ico('icon', 'Icon'), field('title', 'Title'), area('body', 'Body')]),
  ],
  lifestyle: [
    img('image', 'Image'),
    field('imageAlt', 'Image description'),
    field('title', 'Title'),
    lines('paragraphs', 'Paragraphs', 'One paragraph per line'),
    field('ctaLabel', 'Button'),
    field('ctaHref', 'Button link'),
  ],
  gallery: [
    field('eyebrow', 'Eyebrow line'),
    field('title', 'Title'),
    img('mainImage', 'Main image'),
    field('mainImageAlt', 'Main image description'),
    list('thumbs', 'Thumbnails', [img('src', 'Image'), img('thumbSrc', 'Thumbnail'), field('alt', 'Description')]),
    img('deviceImage', 'Device image'),
    field('deviceImageAlt', 'Device image description'),
    list('specs', 'Specs', [ico('icon', 'Icon'), field('label', 'Label'), field('value', 'Value')]),
    field('priceNote', 'Price note'),
    field('ctaLabel', 'Button'),
    field('ctaHref', 'Button link'),
  ],
  reviews: [
    field('eyebrow', 'Eyebrow line'),
    field('title', 'Title'),
    field('handle', 'Account name'),
    field('handleNote', 'Account note'),
    img('photo', 'Post image'),
    field('photoAlt', 'Post image description'),
    num('likesCount', 'Like count'),
    area('caption', 'Post caption'),
    num('totalComments', 'Total comments'),
    list('comments', 'Comments', [
      field('name', 'Name'), img('avatar', 'Avatar'), bool('isBrand', 'Qiti account'),
      num('likes', 'Likes'), area('text', 'Comment'), field('timeAgo', 'Time'),
    ], "⚠️ Don't write reviews that aren't real — this section doesn't show at all when empty"),
  ],
  faq: [
    field('eyebrow', 'Eyebrow line'),
    field('title', 'Title'),
    list('items', 'Questions', [field('question', 'Question'), area('answer', 'Answer')]),
  ],
  cta: [
    field('title', 'Title'),
    area('subtitle', 'Subtext'),
    field('ctaLabel', 'Button'),
    field('ctaHref', 'Button link'),
    list('assurances', 'Assurances', [ico('icon', 'Icon'), field('label', 'Text')]),
  ],
  order: [
    field('eyebrow', 'Eyebrow line'),
    field('title', 'Title'),
    area('subtitle', 'Subtext'),
    area('productBlurb', 'Short product description'),
    img('image', 'Image next to the form'),
    field('submitLabel', 'Confirm button'),
    field('codNote', 'Payment note'),
    field('footnote', 'Final note'),
  ],
};
