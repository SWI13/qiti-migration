// فحص الأقسام — الكلاسات، الحقول الفارغة، الهروب من console.log("\n── 7. الإقناع ──");SS، والـ hooks
// اللي main.js يقرا بيهم.
//
// ⚠️ الكلاسات هنا هي كلاسات التصميم الجديد (موبايل أولاً). القديمة
// (cards, social-post, gallery__thumbs, reveal, data-count...) تحيّدو
// مع التصميم — التشيك هنا يحرس البنية الجديدة، ماشي يحنّ للقديمة.
import trust from '../../lib/render/sections/trust.mjs';
import features from '../../lib/render/sections/features.mjs';
import how from '../../lib/render/sections/how.mjs';
import lifestyle from '../../lib/render/sections/lifestyle.mjs';
import gallery from '../../lib/render/sections/gallery.mjs';
import reviews from '../../lib/render/sections/reviews.mjs';
import faq from '../../lib/render/sections/faq.mjs';
import cta from '../../lib/render/sections/cta.mjs';
import { readFileSync } from 'node:fs';
import orderSection from '../../lib/render/sections/order.mjs';
import { SECTIONS } from '../../lib/render/index.mjs';

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
};

// ── معطيات واقعية بالدارجة، منتج وهمي ────────────────────────────────
const priceView = { amount: 4500, compareAt: 5200, from: false };

const XSS = '<script>alert(1)</script>';
const XSS_URL = 'javascript:alert(1)';

const trustData = {
  rating: '4.8',
  headline: 'بعنا أكثر من 300 قميص، والزبائن راهم راضيين.',
  badges: [
    { icon: 'i-truck', label: 'توصيل سريع' },
    { icon: 'i-shield', label: 'ضمان سنة' },
    { icon: XSS, label: 'قماش قطن 100%' }, // اسم أيقونة خبيث — لازم يختفي بلا ما يطيح
  ],
  stats: [
    { value: 300, suffix: '+', label: 'زبون راضي' },
    { value: 98, suffix: '%', label: 'توصيل في الوقت' },
  ],
};

const featuresData = {
  eyebrow: 'المميزات',
  title: 'كلش لي تحتاجو <b>القميص</b>.',
  subtitle: XSS,
  cards: [
    { icon: 'i-feather', title: 'قماش خفيف', body: 'يريّحك في الصيف.' },
    { icon: 'i-shield', title: 'متين', body: 'يبقى معاك سنين.' },
    { icon: 'i-globe', title: XSS, body: 'يوصل لكل الولايات.' },
  ],
};

const howData = {
  eyebrow: 'كيفاش تطلب',
  title: 'اطلب في 3 خطوات',
  steps: [
    { icon: 'i-box', title: 'اختار المقاس', body: 'شوف جدول المقاسات.' },
    { icon: 'i-truck', title: 'أكّد الطلب', body: 'عمّر معلوماتك.' },
    { icon: 'i-check', title: 'استلم وخلّص', body: 'تخلّص كاش عند الاستلام.' },
  ],
};

const lifestyleData = {
  image: 'https://images.example.com/lifestyle.jpg',
  imageAlt: 'شاب لابس القميص',
  title: 'ستايل يديك <em>الثقة</em>.',
  paragraphs: ['يلبق مع كلشي.', 'قماش يتنفّس ويدوم.'],
  ctaLabel: 'اطلب دروك',
  ctaHref: XSS_URL, // لازم يتبدّل لـ '#order' الافتراضي
};

const galleryData = {
  eyebrow: 'المنتج',
  title: 'قميص قطني أصلي',
  mainImage: 'https://images.example.com/main.jpg',
  mainImageAlt: 'صورة القميص',
  thumbs: [
    { src: 'https://images.example.com/1.jpg', thumbSrc: 'https://images.example.com/1-thumb.jpg', alt: 'أمام' },
    { src: 'https://images.example.com/2.jpg', thumbSrc: 'https://images.example.com/2-thumb.jpg', alt: 'خلف' },
  ],
  deviceImage: 'https://images.example.com/detail.jpg',
  deviceImageAlt: 'صورة قريبة',
  specs: [
    { icon: 'i-feather', value: '180غ', label: 'قماش خفيف' },
    { icon: 'i-shield', label: 'مقاوم للتشقق' },
  ],
  priceNote: 'الدفع عند الاستلام',
  ctaLabel: 'اطلب الان',
};

const reviewsData = {
  eyebrow: 'آراء الزبائن',
  title: 'واش يقولو الناس',
  handle: 'shirt.dz',
  handleNote: 'منشور مموّل',
  photo: 'https://images.example.com/post.jpg',
  likesCount: '1,204',
  caption: XSS,
  totalComments: '87',
  comments: [
    { name: 'sara.k', text: 'قماش زوين بزاف <3', timeAgo: 'يومين', likes: 12, avatar: 'https://images.example.com/a1.jpg' },
    { name: 'shirt.dz', text: '@sara.k شكرا عليك!', timeAgo: 'يوم', likes: 2, isBrand: true },
    { name: XSS, text: XSS, timeAgo: 'أسبوع', likes: 0, avatar: XSS_URL },
  ],
};

const faqData = {
  eyebrow: 'أسئلة',
  title: 'أسئلة شائعة',
  items: [
    { question: 'واش المقاسات متوفّرة؟', answer: 'من S لـ XXL.' },
    { question: XSS, answer: 'إيه.' },
  ],
};

const ctaData = {
  title: 'خلّي ستايلك <em>يتكلّم</em>.',
  subtitle: '4500 دج · الدفع عند الاستلام.',
  ctaLabel: 'اطلب دروك',
  assurances: [
    { icon: 'i-box', label: 'نرسلو في 24 ساعة' },
    { icon: 'i-undo', label: 'ترجعو في 30 يوم' },
  ],
};

// ── 1. كل قسم يطلع بالكلاسات المتوقّعة ───────────────────────────────
const cases = [
  { name: 'trust', fn: trust, data: trustData, ctx: {}, mustHave: ['class="strip"', 'class="trust"', 'trust__it'] },
  { name: 'features', fn: features, data: featuresData, ctx: {}, mustHave: ['id="features"', 'class="perks"', 'class="perk"'] },
  { name: 'how', fn: how, data: howData, ctx: {}, mustHave: ['id="how"', 'class="steps"', 'class="step"', 'step__n'] },
  { name: 'lifestyle', fn: lifestyle, data: lifestyleData, ctx: {}, mustHave: ['class="strip"', 'class="shot"', 'loading="lazy"'] },
  { name: 'gallery', fn: gallery, data: galleryData, ctx: { priceView }, mustHave: ['id="product"', 'class="shots"', 'class="shot"', 'class="dots"', 'class="price"'] },
  { name: 'reviews', fn: reviews, data: reviewsData, ctx: {}, mustHave: ['id="reviews"', 'class="quotes"', 'class="quote', 'quote__who'] },
  { name: 'faq', fn: faq, data: faqData, ctx: {}, mustHave: ['id="faq"', '<details>', 'faq__q', 'faq__a'] },
  { name: 'cta', fn: cta, data: ctaData, ctx: {}, mustHave: ['class="card"', 'btn--primary', 'class="perk"'] },
];

console.log('── 1. الكلاسات المتوقّعة ──');
for (const c of cases) {
  const html = c.fn({ data: c.data, ...c.ctx });
  const missing = c.mustHave.filter((needle) => !html.includes(needle));
  ok(missing.length === 0, `${c.name}: كل الكلاسات موجودة${missing.length ? ' — ناقص: ' + missing.join(', ') : ''}`);
}

// ── 2. بلا data ترجع '' ─────────────────────────────────────────────
console.log('\n── 2. {} يرجّع سلسلة فارغة ──');
for (const c of cases) {
  const html = c.fn({ data: {} });
  ok(html === '', `${c.name}({data:{}}) === ''`);
}
// gallery و lifestyle كي ماعندهمش priceView/product برك (ماشي data) لازم يرجعو فارغين حتى وهم
ok(gallery({ data: {} }) === '', "gallery({data:{}}) === '' (بلا priceView ولا mainImage)");

// ── 3. الهروب من XSS ─────────────────────────────────────────────────
console.log('\n── 3. الهروب من الحقن ──');
const allHtml = cases.map((c) => c.fn({ data: c.data, ...c.ctx })).join('\n');
ok(!allHtml.includes('<script>alert(1)</script>'), 'ماكاين حتى <script> خام في الناتج');
ok(!allHtml.includes('javascript:alert'), 'ماكاين حتى javascript: خام في الناتج');
ok(allHtml.includes('&lt;script&gt;') || allHtml.includes('&lt;b&gt;') || allHtml.includes('&lt;em&gt;'), 'النص المهرّب ظاهر بصيغة &lt;...&gt; (يعني esc() خدمت)');
// أيقونة خبيثة (اسم فيه <script>) لازم ما تخرجش href="#<script>..."
ok(!allHtml.includes('href="#<script>'), 'اسم أيقونة خبيث ما دخلش كيما هو في href');
// رابط جالري thumb src خبيث ماكانش هنا، بصح ننجرب ctaHref خبيث في lifestyle
ok(!allHtml.includes('href="javascript:'), 'ctaHref الخبيث في lifestyle اتبدّل بـ fallback');

// ── 4. الـ hooks والقواعد تاع الموبايل ───────────────────────────────
console.log('\n── 4. hooks الموبايل ──');
const galleryHtml = gallery({ data: galleryData, priceView });
const trustHtml = trust({ data: trustData });
const faqHtml = faq({ data: faqData });

/* السلايدر: main.js يلقاه بالـ id باش ينوّر النقطة الصحيحة */
ok(galleryHtml.includes('id="shots"'), 'gallery: #shots موجود (سلايدر)');
ok(galleryHtml.includes('id="dots"'), 'gallery: #dots موجودة');
/* الصورة الأولى بأولوية، والباقي كسول — هذا هو كل فرق وقت التحميل */
ok(galleryHtml.includes('fetchpriority="high"'), 'gallery: أول صورة بأولوية عالية');
ok(galleryHtml.includes('loading="lazy"'), 'gallery: باقي الصور كسولة');
/* مقاسات مكتوبة = بلاصة محجوزة = النص ما يقفزش كي توصل الصورة */
ok(/width="800" height="800"/.test(galleryHtml), 'gallery: مقاسات الصور مكتوبة (بلا قفزة)');
/* بلا جافاسكريبت للفتح والغلق */
ok(faqHtml.includes('<details>') && !faqHtml.includes('faq__item'), 'faq: <details> عادية بلا JS');
/* حركة/أنيميشن ما بقاتش — reveal كانت تخبّي المحتوى حتى يزحلق */
const noReveal = [galleryHtml, trustHtml, faqHtml].every((html) => !html.includes('reveal'));
ok(noReveal, 'ما بقاش .reveal (المحتوى يبان مباشرة)');
/* الصور الشخصية تاع التعليقات ما تتعرضش — كانت صور ستوك */
ok(!reviews({ data: reviewsData }).includes('<img'), 'reviews: بلا صور (كانت ستوك)');

// ── 5. reviews بلا تعليقات = '' كامل (بلا شكل فارغ) ───────────────────
console.log('\n── 5. reviews بلا تعليقات ──');
ok(reviews({ data: { ...reviewsData, comments: [] } }) === '', 'reviews بلا comments يرجّع سلسلة فارغة كاملة');
ok(reviews({ data: { eyebrow: 'x', title: 'y' } }) === '', 'reviews بعنوان بلا تعليقات يرجّع فارغ (بلا شكل فارغ)');

// ── 6. السجلّ (SECTIONS) ─────────────────────────────────────────────
console.log('\n── 6. السجلّ في index.mjs ──');
const expected = ['hero', 'trust', 'features', 'how', 'lifestyle', 'gallery', 'reviews', 'faq', 'cta'];
for (const key of expected) {
  ok(typeof SECTIONS[key] === 'function', `SECTIONS.${key} مسجّل ويصدّر فنكشن`);
}

// ── 7. طبقة الإقناع — صادقة برك ──────────────────────────────────────
console.log("\n── 7. الإقناع ──");
const orderCtx = {
  data: {},
  product: { id: 'p1', name: 'قميص', price: 3900, options: [], variants: [] },
  campaign: { id: 'c1' },
};
const lowStock = orderSection({ ...orderCtx, stock: [{ variant: { sku: 'default' }, stock: { qty: 3, threshold: 5 } }] });
const fullStock = orderSection({ ...orderCtx, stock: [{ variant: { sku: 'default' }, stock: { qty: 50, threshold: 5 } }] });
const soldOut = orderSection({ ...orderCtx, stock: [{ variant: { sku: 'default' }, stock: { qty: 0, threshold: 5 } }] });

/* الندرة مربوطة بالعدّاد الحقيقي — هذا هو الفحص المهمّ */
ok(lowStock.includes('باقي 3 برك'), 'الندرة تبان كي المخزون الحقيقي يهبط للحدّ');
ok(!fullStock.includes('class="left"'), 'مخزون مليح = بلا شارة (ما نكذبوش)');
ok(!soldOut.includes('class="left"'), 'مخزون صفر = بلا شارة');
ok(!orderSection(orderCtx).includes('class="left"'), 'بلا معطيات مخزون = بلا شارة');

ok(lowStock.includes('id="progFill"'), 'شريط التقدّم موجود');
ok(lowStock.includes('id="etaLine"'), 'سطر وقت التوصيل موجود');
ok(lowStock.includes('ما تخسر والو'), 'السطر تحت الزرّ مصاغ بالخسارة');
ok(lowStock.includes('id="orderDoneId"'), 'رقم الطلب في شاشة النجاح');

console.log(`\n${failures === 0 ? 'كل الفحوصات نجحت ✅' : failures + ' فحوصات طاحت ❌'}`);
// ── 8. الوضع الليلي تاع المتجر ───────────────────────────────────────
/*
 * المتجر ما عندوش زرّ ثيم — يتبع التيليفون عبر media query، واللوحة
 * تكتب data-theme بيدها. الزوج لازم يحملو نفس المتغيّرات: مرّة وحدة
 * خرج المتجر بنص فاتح على خلفية فاتحة على خاطر بلوك نسي متغيّر.
 */
console.log("\n── 8. الوضع الليلي ──");
const css = readFileSync(new URL('../../assets/css/styles.css', import.meta.url), 'utf8');

const varsIn = (block) => new Set((block.match(/--[a-z0-9-]+s*:/gi) || []).map((v) => v.replace(/s*:$/, '')));
const darkBlocks = [];
let cursor = 0;
for (;;) {
  const start = css.indexOf('[data-theme="dark"] {', cursor);
  if (start === -1) break;
  const close = css.indexOf(String.fromCharCode(10) + '}', start);
  darkBlocks.push(css.slice(start, close));
  cursor = close;
}
const mediaStart = css.indexOf('@media (prefers-color-scheme: dark)');
const media = mediaStart === -1 ? '' : css.slice(mediaStart);

ok(mediaStart > -1, 'المتجر عندو بلوك ليلي يتبع التيليفون');
ok(mediaStart > css.lastIndexOf(':root {'), 'البلوك الليلي في الآخر (وإلا :root يغلبو)');

const declared = new Set();
darkBlocks.forEach((block) => varsIn(block).forEach((v) => declared.add(v)));
const inMedia = varsIn(media);
const missing = [...declared].filter((v) => !inMedia.has(v));
ok(missing.length === 0, 'كل متغيّرات الليلي موجودة في الزوج' + (missing.length ? ' — ناقص: ' + missing.join(', ') : ''));

process.exit(failures === 0 ? 0 : 1);
