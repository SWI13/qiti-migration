/*
 * غلاف الصفحة — كلش اللي حوالي الأقسام: الـ head، القائمة، الفوتر،
 * والزر العائم.
 *
 * الأقسام تعرف تبني روحها برك. هذا الملف هو اللي يعرف بلّي كاين صفحة.
 */
import { esc, escAttr, safeUrl, jsLit } from './html.mjs';
import { ICON_SPRITE, icon } from './sprite.mjs';
import { sanitizeTheme, themeCss } from '../theme.mjs';

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

<header class="topbar">
  <div class="wrap topbar__in">
    <a href="/" class="brand" aria-label="Qiti">
      <span class="brand__mark">${icon('i-pin')}</span>
      Qiti
    </a>
    <span class="topbar__cod">${icon('i-cash')} تخلّص كي يوصلك</span>
  </div>
</header>

<main id="main" class="wrap">
${content}
</main>

<footer class="wrap foot">
  <p>© Qiti — التوصيل لـ 58 ولاية · الدفع عند الاستلام</p>
</footer>

<!-- السومة والزرّ ديما في الشاشة، ويزيحو كي يبان الفورم (main.js) -->
<div class="bar" id="stickyBar">
  <div class="bar__in">
    <span class="bar__price">
      <b>${priceView ? `${esc(Number(priceView.amount).toLocaleString('en-US'))} دج` : ''}</b>
      <small>الدفع عند الاستلام</small>
    </span>
    <a href="#order" class="btn btn--primary">Commander</a>
  </div>
</div>

${track ? `<script>
(function(){try{
var k=${jsLit(track.kind)},i=${jsLit(track.id)},u=0;
try{var s='qv:'+k+':'+i;if(!sessionStorage.getItem(s)){sessionStorage.setItem(s,'1');u=1;}}catch(e){}
var b=JSON.stringify({k:k,i:i,u:u});
if(navigator.sendBeacon){navigator.sendBeacon('/api/track',new Blob([b],{type:'application/json'}));}
else{fetch('/api/track',{method:'POST',headers:{'content-type':'application/json'},body:b,keepalive:true}).catch(function(){});}
}catch(e){}})();
</script>
` : ''}<script src="/assets/js/main.js" defer></script>
</body>
</html>`;
}
