/*
 * غلاف الصفحة — كلش اللي حوالي الأقسام: الـ head، القائمة، الفوتر،
 * والزر العائم.
 *
 * الأقسام تعرف تبني روحها برك. هذا الملف هو اللي يعرف بلّي كاين صفحة.
 */
import { esc, escAttr, safeUrl, mapJoin, jsLit } from './html.mjs';
import { ICON_SPRITE, icon } from './sprite.mjs';
import { sanitizeTheme, themeCss, fontLinkFor } from '../theme.mjs';

/* الأقسام اللي تستاهل رابط في القائمة، بأسمائها */
const NAV_LABELS = {
  features: 'المميزات',
  how: 'كيفاش يخدم',
  gallery: 'المنتج',
  reviews: 'آراء الزبائن',
  faq: 'أسئلة',
};

/* الـ id اللي يكتبو كل قسم في الـ HTML تاعو */
const NAV_ANCHORS = {
  features: '#features',
  how: '#how',
  gallery: '#product',
  reviews: '#reviews',
  faq: '#faq',
};

/**
 * روابط القائمة تتبنى من الأقسام المفعّلة فعلاً.
 * حملة بلا قسم أسئلة ما تعرضش رابط "أسئلة" يودّي لبلاصة ما كايناش —
 * رابط مكسور في القائمة يبان كيما موقع مهمل.
 */
function navLinks(sections = []) {
  return sections
    .filter((s) => s?.enabled !== false && NAV_LABELS[s.type])
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((s) => ({ href: NAV_ANCHORS[s.type], label: NAV_LABELS[s.type] }));
}

/*
 * بيانات منظّمة للمنتج (JSON-LD).
 *
 * علاش: هذا هو اللي يخلّي غوغل يبيّن السومة والتوفّر مباشرة في نتائج
 * البحث. للحملة اللي تجيب زوّار من الإعلانات برك ما يبدّل والو، بصح
 * كي تولّي عندك 50 صفحة منتج، هذا هو الفرق بين ترافيك مجاني ولا والو.
 *
 * ما نكتبوش `aggregateRating` — تقييم مخترع في البيانات المنظّمة يقدر
 * يجيبلك عقوبة يدوية من غوغل، ماشي غير مسألة أخلاق.
 */
function productJsonLd({ product, campaign, priceView, canonical }) {
  if (!product) return '';

  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    ...(campaign?.seo?.description ? { description: campaign.seo.description } : {}),
    offers: {
      '@type': 'Offer',
      price: priceView?.amount ?? product.price ?? 0,
      priceCurrency: 'DZD',
      availability: 'https://schema.org/InStock',
      ...(canonical ? { url: canonical } : {}),
    },
  };

  /* `<` مهروب باش نص فيه وسم ما يخرجش من الوسم */
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

/**
 * يبني الصفحة كاملة.
 *
 * `content` هو ناتج renderSections() — نص HTML جاهز ومهروب من قبل.
 */
export function renderPage({
  content,
  campaign,
  product,
  priceView,
  siteOrigin = '',
  themed = true,
  track = null,
}) {
  const theme = sanitizeTheme(campaign?.theme);
  const links = navLinks(campaign?.sections);

  const title = campaign?.seo?.title || `${product?.name ?? 'Qiti'} — Qiti`;
  const description = campaign?.seo?.description || '';
  const ogImage = campaign?.seo?.ogImage || '';
  const canonical = campaign?.slug && siteOrigin ? `${siteOrigin}/${campaign.slug}` : '';

  /*
   * كي الحملة عندها ثيم، الشكل يتقفل على mood تاعها وزر الليلي يختفي.
   * علاش: تبديلات الحملة تتكتب في :root وتجي بعد [data-theme="dark"]
   * بنفس الـ specificity، فتغلبها في الزوج حالات — الزر ما يبدّل والو.
   * زر ميّت أوحش من زر ما كانش.
   */
  const lockedTheme = themed && campaign?.theme && Object.keys(campaign.theme).length > 0;

  return `<!DOCTYPE html>
<html lang="ar-DZ" dir="rtl" data-theme="${escAttr(lockedTheme ? theme.mood : 'light')}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${escAttr(description)}">` : ''}
<meta name="theme-color" content="${escAttr(theme.accent)}">
${canonical ? `<link rel="canonical" href="${safeUrl(canonical)}">` : ''}

<meta property="og:type" content="website">
<meta property="og:title" content="${escAttr(title)}">
${description ? `<meta property="og:description" content="${escAttr(description)}">` : ''}
${ogImage ? `<meta property="og:image" content="${safeUrl(ogImage)}">` : ''}
${canonical ? `<meta property="og:url" content="${safeUrl(canonical)}">` : ''}
<meta name="twitter:card" content="summary_large_image">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${safeUrl(fontLinkFor(theme))}" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/styles.css">

<!-- ثيم الحملة: يعاود يعرّف tokens برك، بعد styles.css باش يغلبها -->
<style>${themeCss(theme)}</style>
${lockedTheme ? '' : `
<!-- نحطّو الثيم قبل ما ترسم الصفحة باش ما يبانش وميض -->
<script>
(function(){
  try{
    var s = localStorage.getItem('qiti-theme');
    document.documentElement.dataset.theme =
      s || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }catch(e){}
})();
</script>`}
${productJsonLd({ product, campaign, priceView, canonical })}
</head>
<body>

<a href="#main" class="skip-link">اقفز للمحتوى</a>

${ICON_SPRITE}

<header class="nav" id="nav">
  <div class="container nav__inner">
    <a href="/" class="logo" aria-label="Qiti">
      <span class="logo__mark">${icon('i-pin')}</span>
      <span class="logo__text">Qiti</span>
    </a>

    <nav class="nav__links" aria-label="القائمة الرئيسية">
      ${mapJoin(links, (l) => `<a href="${escAttr(l.href)}">${esc(l.label)}</a>`)}
    </nav>

    <div class="nav__actions">
      ${lockedTheme ? '' : `<button class="icon-btn" id="themeToggle" aria-label="بدّل الوضع الليلي">
        <svg class="ico ico--sun" viewBox="0 0 24 24"><use href="#i-sun"/></svg>
        <svg class="ico ico--moon" viewBox="0 0 24 24"><use href="#i-moon"/></svg>
      </button>`}
      <a href="#order" class="btn btn--primary btn--sm nav__cta">اطلب الان</a>
      <button class="icon-btn nav__burger" id="burger" aria-label="حلّ القائمة" aria-expanded="false" aria-controls="mobileMenu">
        ${icon('i-menu')}
      </button>
    </div>
  </div>

  <div class="mobile-menu" id="mobileMenu" hidden>
    ${mapJoin(links, (l) => `<a href="${escAttr(l.href)}">${esc(l.label)}</a>`)}
    <a href="#order" class="btn btn--primary">اطلب الان</a>
  </div>
</header>

<main id="main">
${content}
</main>

<footer class="footer">
  <div class="container footer__grid">
    <div class="footer__brand">
      <a href="/" class="logo">
        <span class="logo__mark">${icon('i-pin')}</span>
        <span class="logo__text">Qiti</span>
      </a>
      <p>منتجات مفيدة، توصيل لـ 58 ولاية، والدفع عند الاستلام.</p>
    </div>

    <!-- /shop مازال ما تبناش — ما نحطّوش رابط يودّي لـ 404 -->
    <nav class="footer__col" aria-label="المساعدة">
      <h4>المساعدة</h4>
      <a href="#faq">أسئلة</a>
    </nav>
  </div>

  <div class="container footer__bottom">
    <p>© <span id="year">2026</span> Qiti. كل الحقوق محفوظة.</p>
  </div>
</footer>

<a href="#orderForm" class="floating-cta" aria-label="اطلب الان">
  اطلب الان ${icon('i-arrow-rtl')}
</a>

${track ? `<script>
(function(){try{
var k=${jsLit(track.kind)},i=${jsLit(track.id)},u=0;
try{var s='qv:'+k+':'+i;if(!sessionStorage.getItem(s)){sessionStorage.setItem(s,'1');u=1;}}catch(e){}
var b=JSON.stringify({k:k,i:i,u:u});
if(navigator.sendBeacon){navigator.sendBeacon('/.netlify/functions/track',new Blob([b],{type:'application/json'}));}
else{fetch('/.netlify/functions/track',{method:'POST',headers:{'content-type':'application/json'},body:b,keepalive:true}).catch(function(){});}
}catch(e){}})();
</script>
` : ''}<script src="/assets/js/main.js" defer></script>
</body>
</html>`;
}
