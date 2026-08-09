/*
 * تكامل: نعرضو الطوق من المعطيات ونقارنو مع index.html الحالية،
 * ومن بعد نعرضو Toji Outfit بنفس الكود بالضبط.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const lib = (p) => import(new URL(`../../netlify/lib/${p}`, import.meta.url).href);
const { renderSections, priceViewFor, SECTIONS, DEFAULT_SECTIONS, blankSectionsFor } = await lib('render/index.mjs');
const { renderPage } = await lib('render/layout.mjs');
const { buildVariants } = await lib('catalog.mjs');

const live = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

const ok = (label, pass, extra = '') =>
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);

/* ── 1. الطوق: نفس المحتوى اللي في الصفحة الحيّة ──────────────────── */
const collar = {
  id: 'prd_collar', slug: 'cat-tracker', name: 'طوق Qiti الذكي بـ GPS',
  type: 'pet', price: 3900, unitCost: 1500, status: 'active',
  options: [], variants: buildVariants([]),
};

const img = 'https://images.unsplash.com/photo-1695217150778-b4bfb5795e4a?w=1100';
const campaign = {
  id: 'cmp_collar', slug: 'cat-tracker', name: 'الطوق الذكي', productId: collar.id,
  status: 'published', theme: {},
  seo: { title: 'Qiti — طوق ذكي بـ GPS للقطط', description: 'شوف وين راهي قطّتك مباشرة من تيليفونك.' },
  sections: [
    { type: 'hero', order: 1, enabled: true, data: {
      title: 'عمرك ما تضيّع قطّك مرّة أخرى', subtitle: 'شوف وين راهي قطّتك مباشرة من تيليفونك.',
      rating: '4.9', ratingNote: 'أكثر من 200 زبون راضي', image: img, imageAlt: 'قطّة لابسة طوق',
      ctaLabel: 'اطلب الان', secondaryLabel: 'كيفاش يخدم', priceNote: 'الدفع عند الاستلام · التوصيل لـ 58 ولاية',
      assurances: ['تخلّص كي يوصلك', 'ترجعو في 30 يوم', 'ضمان سنتين'],
      floatCards: [{ icon: 'i-zap', title: 'باقي 10 شهور', note: 'البطارية 87%' }, { icon: 'i-pin', title: 'حديقة الحيّ', note: 'على بعد 120 م' }] } },
    { type: 'trust', order: 2, enabled: true, data: {
      headline: 'بعنا أكثر من 200 طوق، والزبائن راهم راضيين.',
      badges: [{ icon: 'i-radio', label: 'تتبّع GPS' }, { icon: 'i-drop', label: 'ما يخافش من الماء' }],
      stats: [{ value: 200, suffix: '+', label: 'قط محمي' }, { value: 58, suffix: ' ولاية', label: 'نوصّلو لكل الوطن' }] } },
    { type: 'features', order: 3, enabled: true, data: {
      eyebrow: 'المميزات', title: 'كلش اللي تحتاجو قطّتك.',
      cards: [
        { icon: 'i-radio', title: 'تتبّع مباشر GPS', body: 'شوف بلاصة قطّتك في الوقت الحقيقي.' },
        { icon: 'i-zap', title: 'بطارية تدوم عام', body: 'حتى لسنة كاملة بشحنة وحدة.' }] } },
    { type: 'how', order: 4, enabled: true, data: {
      eyebrow: 'كيفاش يخدم', title: 'تركّبو في أقل من 3 دقايق.',
      steps: [
        { icon: 'i-box', title: 'ركّب Qiti في الطوق', body: 'دخّل الجهاز في الطوق واغلقو.' },
        { icon: 'i-link', title: 'اربطو بالتطبيق', body: 'اسكاني الكود اللي على العلبة.' }] } },
    { type: 'order', order: 5, enabled: true, data: {
      title: 'عمّر المعلومات ونتصلو بيك.', productBlurb: 'يجي معاه: الجهاز + الطوق + قاعدة الشحن' } },
    { type: 'lifestyle', order: 6, enabled: true, data: {
      image: img, imageAlt: 'قطّة في العشب', title: 'على خاطرها من العائلة.',
      paragraphs: ['تستنّاك عند الباب.'], ctaLabel: 'احمي قطّتك' } },
    { type: 'gallery', order: 7, enabled: true, data: {
      mainImage: img, mainImageAlt: 'طوق Qiti',
      thumbs: [{ src: img, thumbSrc: img, alt: 'صورة 1' }, { src: img, thumbSrc: img, alt: 'صورة 2' }],
      specs: [{ icon: 'i-feather', value: '24 غرام', label: 'أخفّ من بطارية' }] } },
    { type: 'faq', order: 8, enabled: true, data: {
      items: [{ question: 'واش يتحمّل الماء؟', answer: 'إيه، معيار IP68.' }] } },
    { type: 'cta', order: 9, enabled: true, data: {
      title: 'خلّي قطّتك تتجوّل وانت مرتاح.', ctaLabel: 'اطلب Qiti الان',
      assurances: [{ icon: 'i-box', label: 'نرسلو في 24 ساعة' }] } },
    /* reviews مقصود مطفي — ما عندناش تقييمات حقيقية */
    { type: 'reviews', order: 10, enabled: false, data: {} },
  ],
};

const page = renderPage({
  content: renderSections(campaign, collar), campaign, product: collar,
  priceView: priceViewFor(collar), siteOrigin: 'https://qiti.com',
});

console.log('══ 1. الطوق معروض من المعطيات ══');
ok('every section rendered', ['hero', 'trust', 'section__head', 'steps', 'order__form', 'lifestyle', 'gallery', 'faq__item', 'cta__'].every((c) => page.includes(c)));

const HOOKS = ['reveal', 'data-count', 'data-suffix', 'data-float', 'thumb', 'data-src',
  'faq__item', 'orderForm', 'fName', 'fPhone', 'fWilaya', 'fCommune', 'fQty', 'sumTotal',
  'submitBtn', 'orderDone', 'orderAgain', 'ship__price', 'qty__btn', 'themeToggle',
  'burger', 'mobileMenu', 'floating-cta', 'galleryImg'];
const missing = HOOKS.filter((h) => !page.includes(h));
ok('all JS hooks main.js binds to are present', missing.length === 0, missing.length ? 'MISSING: ' + missing.join(', ') : `${HOOKS.length} hooks`);

const liveSections = (live.match(/<section class="([^"]+)"/g) || []).length;
const newSections = (page.match(/<section class="([^"]+)"/g) || []).length;
ok('section count comparable to live page', Math.abs(liveSections - newSections) <= 2, `live ${liveSections}, rendered ${newSections} (reviews off)`);

ok('disabled reviews section absent', !page.includes('social-post'));
ok('58 wilayas server-rendered', (page.match(/<option value="[^"]+"/g) || []).length === 58);
ok('price from product, not campaign copy', page.includes('3,900 دج') || page.includes('3900'));
ok('canonical + JSON-LD present', page.includes('rel="canonical"') && page.includes('ld+json'));
ok('no fabricated aggregateRating in structured data', !page.includes('aggregateRating'));

/* ── 2. نفس الكود، منتج آخر تماماً ────────────────────────────────── */
const opts = [{ name: 'المقاس', values: ['S', 'M', 'L', 'XL'] }, { name: 'اللون', values: ['أسود', 'أبيض'] }];
const toji = {
  id: 'prd_toji', slug: 'toji-outfit', name: 'Toji Oversized Hoodie',
  type: 'clothing', price: 4500, unitCost: 2000, status: 'active',
  options: opts, variants: buildVariants(opts),
};
const tojiCampaign = {
  id: 'cmp_toji', slug: 'toji-outfit', productId: toji.id, status: 'published',
  theme: { mood: 'dark', accent: '#E11D48', accentText: '#FFFFFF', bg: '#0A0A0A', surface: '#141414', text: '#F5F5F5', font: 'cairo', radius: 'sharp' },
  seo: { title: 'Toji Outfit — Qiti', description: 'هودي واسع، ستايل ستريتوير.' },
  sections: [
    { type: 'hero', order: 1, enabled: true, data: { title: 'TOJI', subtitle: 'هودي واسع.', image: img, ctaLabel: 'اطلبها دروك' } },
    { type: 'gallery', order: 2, enabled: true, data: { mainImage: img, mainImageAlt: 'هودي', thumbs: [{ src: img, thumbSrc: img, alt: 'أمام' }] } },
    { type: 'order', order: 3, enabled: true, data: { title: 'اختار مقاسك' } },
  ],
};
const tojiPage = renderPage({
  content: renderSections(tojiCampaign, toji), campaign: tojiCampaign, product: toji,
  priceView: priceViewFor(toji), siteOrigin: 'https://qiti.com',
});

console.log('\n══ 2. نفس المحرّك، Toji Outfit ══');
ok('dark mood locked, toggle hidden', tojiPage.includes('data-theme="dark"') && !tojiPage.includes('themeToggle'));
ok('Cairo loaded instead of Tajawal', tojiPage.includes('family=Cairo') && !tojiPage.includes('family=Tajawal'));
ok('sharp radius applied', tojiPage.includes('--r-md:3px'));
ok('crimson accent applied', tojiPage.includes('--accent:#E11D48'));
ok('size + colour pickers rendered', (tojiPage.match(/role="radiogroup"/g) || []).length === 2);
ok('8 variants in pricing payload', JSON.parse(tojiPage.match(/id="qiti-pricing">(.*?)<\/script>/s)[1].replace(/\\u003c/g, '<')).variants.length === 8);
ok('no "how it works" for clothing', !tojiPage.includes('step__num'));
ok('clothing default order puts form above the fold', DEFAULT_SECTIONS.clothing.indexOf('order') < DEFAULT_SECTIONS.pet.indexOf('order'));

/* ── 3. الحقن عبر معطيات الحملة ───────────────────────────────────── */
console.log('\n══ 3. الأمان ══');
const XSS = '<script>alert(1)</script>';
const evil = renderPage({
  content: renderSections({
    id: 'x', slug: 'x', theme: {},
    seo: { title: XSS, description: XSS, ogImage: 'javascript:alert(3)' },
    sections: [
      { type: 'hero', order: 1, enabled: true, data: { title: XSS, image: 'javascript:alert(2)', ctaHref: 'javascript:alert(4)' } },
      { type: 'features', order: 2, enabled: true, data: { title: XSS, cards: [{ icon: '"><script>x</script>', title: XSS, body: XSS }] } },
      { type: 'order', order: 3, enabled: true, data: { title: XSS } },
    ],
  }, { ...collar, name: XSS }),
  campaign: { id: 'x', slug: 'x', theme: {}, seo: { title: XSS, description: XSS, ogImage: 'javascript:alert(3)' }, sections: [] },
  product: { ...collar, name: XSS }, priceView: { amount: 1 }, siteOrigin: 'https://qiti.com',
});
ok('no executable <script>alert', !evil.includes('<script>alert'));
ok('no javascript: URL anywhere', !evil.includes('javascript:'));
ok('payload appears escaped instead', evil.includes('&lt;script&gt;'));
ok('bad icon name produced no href', !evil.includes('href="#"><script'));

/* ── 4. المرونة ───────────────────────────────────────────────────── */
console.log('\n══ 4. الأعطاب ══');
ok('campaign with zero sections still renders a page', renderPage({ content: renderSections({ id: 'e', sections: [] }, collar), campaign: { id: 'e', sections: [], theme: {} }, product: collar, priceView: null }).includes('</html>'));
ok('unknown section type skipped, page survives', renderSections({ id: 'u', sections: [{ type: 'nope', order: 1, enabled: true, data: {} }, { type: 'hero', order: 2, enabled: true, data: { title: 'ok' } }] }, collar).includes('ok'));
ok('every registered type is in at least one default template', Object.keys(SECTIONS).every((t) => Object.values(DEFAULT_SECTIONS).some((l) => l.includes(t))));
ok('blankSectionsFor produces usable scaffolding', blankSectionsFor('clothing').length === DEFAULT_SECTIONS.clothing.length);

console.log('\nregistered sections:', Object.keys(SECTIONS).join(', '));
console.log('rendered page size:', (page.length / 1024).toFixed(1), 'KB   (live index.html:', (live.length / 1024).toFixed(1), 'KB)');
