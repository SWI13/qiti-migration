// فحص الأقسام الثمانية الجداد — يتأكّد من: الكلاسات، الحقول الفارغة،
// الهروب من XSS، وبقاء الـ hooks اللي main.js يقرا بيهم.
import trust from '../../netlify/lib/render/sections/trust.mjs';
import features from '../../netlify/lib/render/sections/features.mjs';
import how from '../../netlify/lib/render/sections/how.mjs';
import lifestyle from '../../netlify/lib/render/sections/lifestyle.mjs';
import gallery from '../../netlify/lib/render/sections/gallery.mjs';
import reviews from '../../netlify/lib/render/sections/reviews.mjs';
import faq from '../../netlify/lib/render/sections/faq.mjs';
import cta from '../../netlify/lib/render/sections/cta.mjs';
import { SECTIONS } from '../../netlify/lib/render/index.mjs';

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
  { name: 'trust', fn: trust, data: trustData, ctx: {}, mustHave: ['class="trust"', 'trust__head', 'class="badges', 'class="stats', 'data-count="300"', 'data-suffix="+"'] },
  { name: 'features', fn: features, data: featuresData, ctx: {}, mustHave: ['id="features"', 'class="cards"', 'class="card reveal"', 'card__icon'] },
  { name: 'how', fn: how, data: howData, ctx: {}, mustHave: ['id="how"', 'class="steps"', 'step__num', 'step__icon'] },
  { name: 'lifestyle', fn: lifestyle, data: lifestyleData, ctx: {}, mustHave: ['class="lifestyle"', 'lifestyle__bg', 'lifestyle__scrim', 'lifestyle__title'] },
  { name: 'gallery', fn: gallery, data: galleryData, ctx: { priceView }, mustHave: ['id="product"', 'id="galleryStage"', 'id="galleryImg"', 'gallery__thumbs', 'role="tablist"', 'class="thumb is-active"', 'aria-selected="true"', 'data-src=', 'price-box', 'showcase__stage', 'data-float'] },
  { name: 'reviews', fn: reviews, data: reviewsData, ctx: {}, mustHave: ['id="reviews"', 'social-post', 'class="comments"', 'comment--reply', 'comment__heart'] },
  { name: 'faq', fn: faq, data: faqData, ctx: {}, mustHave: ['id="faq"', 'faq__item', 'faq__body'] },
  { name: 'cta', fn: cta, data: ctaData, ctx: {}, mustHave: ['class="cta"', 'cta__title', 'cta__assurances'] },
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

// ── 4. الـ hooks تاع main.js ─────────────────────────────────────────
console.log('\n── 4. الـ JS hooks ──');
const galleryHtml = gallery({ data: galleryData, priceView });
const reviewsHtml = reviews({ data: reviewsData });
const trustHtml = trust({ data: trustData });
const faqHtml = faq({ data: faqData });

ok(trustHtml.includes('reveal'), 'trust: .reveal موجودة');
ok(trustHtml.includes('data-count='), 'trust: [data-count] موجودة');
ok(trustHtml.includes('data-suffix='), 'trust: [data-suffix] موجودة');
ok(galleryHtml.includes('class="thumb is-active"') && galleryHtml.includes('data-src='), 'gallery: .thumb[data-src] موجودة');
ok(galleryHtml.includes('role="tablist"'), 'gallery: role="tablist" موجودة');
ok(galleryHtml.includes('aria-selected="true"') && galleryHtml.includes('aria-selected="false"'), 'gallery: aria-selected موجودة (true و false)');
ok(galleryHtml.includes('data-float'), 'gallery: [data-float] موجودة على .device');
ok(faqHtml.includes('faq__item'), 'faq: .faq__item موجودة');

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

console.log(`\n${failures === 0 ? 'كل الفحوصات نجحت ✅' : failures + ' فحوصات طاحت ❌'}`);
process.exit(failures === 0 ? 0 : 1);
