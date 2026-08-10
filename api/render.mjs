/*
 * الفنكشن اللي يعرض صفحات المتجر: الحملات، المنتجات، الفئات.
 *
 * كل رابط ما هوش ملف ستاتيك يوصل هنا. نديرو lookup واحد في فهرس
 * الروابط ونعرفو واش لازم نعرضو.
 *
 * ── علاش عرض عند الطلب ماشي بناء مسبق ──────────────────────────────
 * باش النشر يكون فوري: تبدّل نص في اللوحة وتشوفو في الحين، بلا deploy
 * ولا استنّى دقيقة على البناء. الـ CDN يخبّي النتيجة فالزائر ما يحسّش.
 *
 * ── التخبئة (cache) ────────────────────────────────────────────────
 * `cache-control: max-age=0, must-revalidate` للمتصفّح (يسقسي في كل
 * مرّة) + `cdn-cache-control` للـ CDN وحدو (يخبّي 5 دقايق ويقدّم
 * النسخة القديمة كي يعاود يجيب الجديدة). هكذا كي تنشر تبديل، الزوّار
 * يشوفوه بلا ما كل زيارة تضرب الفنكشن.
 *
 * ⚠️ الهيدر كان `netlify-cdn-cache-control` — اسم خاص بـ Netlify، وعلى
 * Vercel ما يعني والو (يعدّي كهيدر عادي والـ CDN ما يقراهش). Vercel
 * يقرا `cdn-cache-control` (المعيار المشترك) و`vercel-cdn-cache-control`.
 * نحطّو المعياري باش يخدم في الزوج.
 */
import { resolveRoute, getCampaign, getProduct, getCategory, listProducts } from '../lib/catalog.mjs';
import { renderSections, priceViewFor } from '../lib/render/index.mjs';
import { renderPage } from '../lib/render/layout.mjs';
import { esc, escAttr, dz } from '../lib/render/html.mjs';
import { toVercel } from '../lib/http.mjs';

const html = (body, status = 200, extraHeaders = {}) =>
  new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
  });

/* صفحات منشورة تتخبّى، الباقي لا */
const CACHE_PUBLIC = {
  'cache-control': 'public, max-age=0, must-revalidate',
  'cdn-cache-control': 'public, max-age=300, stale-while-revalidate=86400',
};

/*
 * 404 حقيقية ماشي 200 بصفحة "ما لقيناش".
 * علاش يهم: غوغل يفهرس أي رابط يرجع 200. رابط مكتوب غالط في إعلان
 * يولّي صفحة في نتائج البحث إذا رجعنا 200.
 */
function notFound() {
  return html(`<!DOCTYPE html>
<html lang="ar-DZ" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>ما لقيناش الصفحة — Qiti</title>
<link rel="stylesheet" href="/assets/css/styles.css">
</head>
<body>
<main id="main" class="container" style="text-align:center;padding:120px 0">
  <h1 style="font-size:clamp(2rem,5vw,3rem)">ما لقيناش هذي الصفحة</h1>
  <p style="color:var(--text-muted);margin:16px 0 28px">يمكن الرابط تبدّل ولا فيه غلطة.</p>
  <a href="/" class="btn btn--primary btn--lg">ارجع للرئيسية</a>
</main>
</body>
</html>`, 404);
}

/*
 * مسار الطلب بلا query ولا شرطة في الأخير.
 *
 * ⚠️ الفنكشن يوصلها الطلب عبر rewrite في vercel.json، والـ rewrite
 * يقدر يبدّل pathname لـ /api/render — وقتها السلاڨ يضيع. علاش
 * الـ rewrite يمرّر المسار الأصلي في ?path=، وهو اللي نقراوه الأوّل.
 * pathname يبقى احتياط للنداء المباشر (تجارب محلّية).
 */
function pathOf(request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('path') || url.pathname;
  const pathname = raw.startsWith('/') ? raw : `/${raw}`;
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

async function handler(request) {
  const path = pathOf(request);
  const origin = new URL(request.url).origin;

  let route;
  try {
    route = await resolveRoute(path);
  } catch (error) {
    /*
     * ⚠️ كان يرجّع notFound() هنا. المشكل: عطب في التخزين يولّي شكلو
     * بالضبط كي صفحة ما كايناش — الموقع كامل يطيح ويجاوب 404 هادي،
     * وحتى غوغل يفهرس الأخطاء. وفي التشخيص، 404 قالت "التخزين يخدم"
     * وهي كذبة كلّفت وقت.
     * دروك 503: عطب مؤقّت، ماشي صفحة مفقودة. Retry-After يقول
     * للزواحف ترجع من بعد بدل ما تشطب الرابط.
     */
    console.error('Route lookup failed:', error.message, '| path:', path);
    return html(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
<title>الخدمة ماشي متوفّرة</title>
<body style="font:16px/1.6 system-ui;padding:3rem;text-align:center">
<h1>الخدمة ماشي متوفّرة دروك</h1><p>عاود حاول بعد شوية.</p></body></html>`,
      503, { 'retry-after': '30', 'cache-control': 'no-store' });
  }

  if (!route) return notFound();

  /*
   * الرابط القديم بعد ما تبدّل — 301 دايمة.
   * ما نمحيوش الروابط القديمة على خاطر يقدرو يكونو في إعلان خدّام ولا
   * مطبوعين على ورقة. 301 تخلّي غوغل ينقل الترتيب للجديد كمان.
   */
  if (route.kind === 'redirect') {
    return new Response(null, { status: 301, headers: { location: route.to } });
  }

  try {
    if (route.kind === 'campaign') return await renderCampaign(route.id, origin);
    if (route.kind === 'product') return await renderProduct(route.id, origin);
    if (route.kind === 'category') return await renderCategory(route.id, origin);
  } catch (error) {
    console.error(`Render failed for ${path}:`, error.message);
    return html('<h1>وقعت مشكلة. عاود حاول.</h1>', 500);
  }

  return notFound();
}

async function renderCampaign(id, origin) {
  const campaign = await getCampaign(id);
  if (!campaign) return notFound();

  /* المسودّات ما تتعرضش للناس — المعاينة تمرّ على اللوحة بمصادقة */
  if (campaign.status !== 'published') return notFound();

  const product = campaign.productId ? await getProduct(campaign.productId) : null;
  const priceView = priceViewFor(product);
  const content = renderSections(campaign, product);

  return html(
    renderPage({
      content, campaign, product, priceView, siteOrigin: origin, track: { kind: 'campaign', id: campaign.id },
    }),
    200,
    CACHE_PUBLIC,
  );
}

/*
 * صفحة منتج عادية — نفس المحرّك، بحملة مصطنعة.
 *
 * علاش هكذا: المنتج بلا حملة ما يحتاجش قالب آخر، يحتاج غير الأقسام
 * الأساسية. هكذا نتفاداو محرّك ثاني يتصونا وحدو.
 */
async function renderProduct(id, origin) {
  const product = await getProduct(id);
  if (!product || product.status !== 'active') return notFound();

  const pseudoCampaign = {
    id: `product:${product.id}`,
    slug: `p/${product.slug}`,
    productId: product.id,
    theme: {},
    seo: product.seo ?? {},
    sections: [
      { type: 'hero', enabled: true, order: 1, data: { title: product.name } },
      { type: 'order', enabled: true, order: 2, data: {} },
    ],
  };

  const priceView = priceViewFor(product);
  return html(
    renderPage({
      content: renderSections(pseudoCampaign, product),
      campaign: pseudoCampaign,
      product,
      priceView,
      siteOrigin: origin,
      track: { kind: 'product', id: product.id },
    }),
    200,
    CACHE_PUBLIC,
  );
}

async function renderCategory(id, origin) {
  const category = await getCategory(id);
  if (!category) return notFound();

  const all = await listProducts();
  const items = all.filter((p) => p.categoryId === category.id && p.status === 'active');

  /*
   * شبكة بسيطة — الشكل الكامل للفئات يجي مع صفحة الرئيسية.
   *
   * ⚠️ اسم الفئة والمنتج يكتبهم المستخدم في اللوحة ويتخزّنو خام (نفس
   * قاعدة store raw / escape at render). لازم يمرّو على esc هنا —
   * هذا الفنكشن نساها في أوّل نسخة وكانت ثقب XSS مخزّن.
   */
  const grid = items.length
    ? `<div class="cards">${items.map((p) => `
        <a class="card" href="/p/${escAttr(p.slug)}">
          <h3>${esc(p.name)}</h3>
          <p>${dz(p.price)}</p>
        </a>`).join('')}</div>`
    : '<p class="section__sub">ما كاين حتى منتج في هذي الفئة دروك.</p>';

  const pseudoCampaign = {
    id: `category:${category.id}`,
    slug: `c/${category.slug}`,
    theme: {},
    seo: { title: `${category.name} — Qiti`, description: category.tagline ?? null },
    sections: [],
  };

  return html(
    renderPage({
      content: `<section class="section"><div class="container">
        <header class="section__head">
        ${category.emoji ? `<span class="cat-mark"${category.color ? ` style="--cat-color:${escAttr(category.color)}"` : ''} aria-hidden="true">${esc(category.emoji)}</span>` : ''}
        <h2 class="section__title">${esc(category.name)}</h2>
        ${category.tagline ? `<p class="section__sub">${esc(category.tagline)}</p>` : ''}</header>
        ${grid}
      </div></section>`,
      campaign: pseudoCampaign,
      product: null,
      priceView: null,
      siteOrigin: origin,
    }),
    200,
    CACHE_PUBLIC,
  );
}

/* توقيع Vercel هو (req,res) — الجسر في lib/http.mjs */
export default toVercel(handler);
