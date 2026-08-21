/*
 * تتبّع تيك توك — الفحوصات.
 *
 * اللي يتفحص هنا ماشي "هل الكود يخدم" — هو الحاجات اللي كي تنكسر
 * ما تبانش، وتخلّيك تصرف فلوس على أرقام كاذبة:
 *
 *   1. البيكسل يتحقن مرّة وحدة برك. زوج نسخ = كل زيارة تتحسب زوج مرّات.
 *   2. `event_id` يتبنى بنفس الصيغة في السيرفر وفي المتصفّح. لو تفرّقو،
 *      كل طلبية تتحسب مرّتين عند تيك توك.
 *   3. الهاتف يتهرّس بصيغة E.164 مع '+' (تيك توك)، ماشي بلاه (ميتا).
 *      نفس الرقم بزوج صيغ = زوج هاشات = مطابقة طايحة بلا ما يبان خطأ.
 *   4. الحدث تاع الشراء اسمو CompletePayment ماشي Purchase.
 *   5. تيك توك ترجع HTTP 200 حتى كي الحدث يطيح — الخطأ في `code`.
 *   6. الإرسال عمرو ما يرمي خطأ للفوق: الطلب أهمّ من التتبّع.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let failed = 0;
const ok = (label, pass, extra = '') => {
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
};

/* الوحدة تتقرا في كل مرّة باش تبديل متغيّرات البيئة يبان — الوحدات
   تتخبّى في الذاكرة، والقيم تتقرا وقت النداء ماشي وقت الاستيراد */
const tiktok = await import('../../lib/tiktok.mjs');
const {
  tiktokPixelId, tiktokPixelSnippet, tiktokEventId, sendTikTokEvent, sanitizePixelId, resolvePixelId,
  pixelScriptBody, tiktokPixelLoaderTag, PIXEL_SCRIPT_URL,
} = tiktok;
const { injectTikTokPixel } = await import('../inject-pixel.mjs');

const PROD_PIXEL_ID = 'DA3Q4VRC77U14HQM5R50';
const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

/* ── id البيكسل ────────────────────────────────────────────────────── */

delete process.env.TIKTOK_PIXEL_ID;
ok('بلا متغيّر بيئة → id الإنتاج', tiktokPixelId() === PROD_PIXEL_ID, tiktokPixelId());

process.env.TIKTOK_PIXEL_ID = '';
ok('متغيّر فارغ → البيكسل مطفي', tiktokPixelId() === '' && tiktokPixelSnippet() === '');

process.env.TIKTOK_PIXEL_ID = '</script><script>alert(1)</script>';
ok('id فيه وسم → يتردّ', tiktokPixelId() === '' && tiktokPixelSnippet() === '');

process.env.TIKTOK_PIXEL_ID = 'TESTPIXEL123';
ok('id صحيح → يتقبّل', tiktokPixelId() === 'TESTPIXEL123');

delete process.env.TIKTOK_PIXEL_ID;

/* ── وسم البيكسل ───────────────────────────────────────────────────── */

const snippet = tiktokPixelSnippet();
ok('الوسم فيه id البيكسل', snippet.includes(`ttq.load('${PROD_PIXEL_ID}')`));
ok('الوسم يطلق ttq.page()', snippet.includes('ttq.page()'));
ok('الوسم عندو حارس ضدّ التحميل مرّتين', snippet.includes('window.__qitiTtq'));
ok('السكريبت async (ما يوقّفش الرسم)', snippet.includes('n.async=!0'));

/* ── الحقن في الصفحة الستاتيك ──────────────────────────────────────── */

/*
 * الصفحة الرئيسية ما تاخذش الـ id في البناء — تاخذ وسم ينادي
 * /api/render?pixel=1. علاش: الـ id يتبدّل من اللوحة، والملف الستاتيك
 * ما يتبدّلش حتى تعاود تنشر.
 */
const page = '<!DOCTYPE html><html><head><title>x</title></head><body>hi</body></html>';
const once = injectTikTokPixel(page);
const twice = injectTikTokPixel(once);

const countLoads = (html) => (html.match(/ttq\.load\(/g) ?? []).length;
const countTags = (html) => (html.match(/api\/render\?pixel=1/g) ?? []).length;

ok('الحقن يدخل قبل </head>', once.indexOf(PIXEL_SCRIPT_URL) < once.indexOf('</head>'));
ok('الوسم ما فيهش id محروق', !once.includes('ttq.load('));
ok('حقنة وحدة = وسم واحد', countTags(once) === 1, String(countTags(once)));
ok('حقنتين = وسم واحد برك', countTags(twice) === 1, String(countTags(twice)));
ok('الوسم defer (ما يوقّفش الرسم)', tiktokPixelLoaderTag().includes('defer'));

/* ── كود البيكسل كملف جافاسكريبت (اللي يرجّعو /api/render?pixel=1) ── */

const scriptBody = pixelScriptBody();
ok('الملف فيه id الإنتاج', scriptBody.includes(`ttq.load('${PROD_PIXEL_ID}')`));
ok('الملف بلا وسم <script>', !scriptBody.includes('<script'));
ok('الملف عندو حارس ضدّ التحميل مرّتين', scriptBody.includes('window.__qitiTtq'));

process.env.TIKTOK_PIXEL_ID = '';
ok('البيكسل مطفي → ملف فارغ', pixelScriptBody() === '');
delete process.env.TIKTOK_PIXEL_ID;

const renderSource = readFileSync(join(repo, 'api', 'render.mjs'), 'utf8');
ok('render.mjs يجاوب على ?pixel', /searchParams\.get\('pixel'\)/.test(renderSource));
ok('الجواب يمرّ على الإعدادات', /pixelScriptBody\(resolvePixelId\(\{ settings \}\)\)/.test(renderSource));
ok('كل صفحة معروضة تاخذ pixelId', (renderSource.match(/pixelId: await pixelFor\(/g) ?? []).length === 3);

/* ── الغلاف المعروض من الخادم ──────────────────────────────────────── */

const { renderPage } = await import('../../lib/render/layout.mjs');
const rendered = renderPage({ content: '<p>x</p>', product: { name: 'Qiti', price: 3900 }, pixelId: PROD_PIXEL_ID });
ok('الصفحة المعروضة فيها البيكسل', rendered.includes(`ttq.load('${PROD_PIXEL_ID}')`));
ok('الصفحة المعروضة فيها نسخة وحدة', countLoads(rendered) === 1, String(countLoads(rendered)));
ok('البيكسل في <head>', rendered.indexOf('__qitiTtq') < rendered.indexOf('</head>'));
ok('بلا pixelId → بلا بيكسل', countLoads(renderPage({ content: '<p>x</p>' })) === 0);

/* ── بيكسل لكل صفحة ────────────────────────────────────────────────── */

ok('بلا والو → الافتراضي', resolvePixelId({}) === PROD_PIXEL_ID);
ok('بيكسل الرئيسية من الإعدادات',
  resolvePixelId({ settings: { tiktokPixelMain: 'MAINPIXEL1' } }) === 'MAINPIXEL1');
ok('بيكسل الحملة يغلب تاع الرئيسية',
  resolvePixelId({ campaign: { tiktokPixelId: 'CAMPAIGNPIXEL1' }, settings: { tiktokPixelMain: 'MAINPIXEL1' } })
    === 'CAMPAIGNPIXEL1');
ok('حملة بلا بيكسل ترث الرئيسية',
  resolvePixelId({ campaign: { name: 'x' }, settings: { tiktokPixelMain: 'MAINPIXEL1' } }) === 'MAINPIXEL1');
ok('بيكسل حملة مكسّر → يرجع للي وراه',
  resolvePixelId({ campaign: { tiktokPixelId: '</script>' }, settings: { tiktokPixelMain: 'MAINPIXEL1' } })
    === 'MAINPIXEL1');
ok('بيكسل رئيسية مكسّر → الافتراضي',
  resolvePixelId({ settings: { tiktokPixelMain: 'BROKEN PIXEL!' } }) === PROD_PIXEL_ID);
ok('الكود كامل ملصوق في الخانة → يتردّ', sanitizePixelId(tiktokPixelSnippet()) === '');
ok('فراغات حوالي الـ id تتحيّد', sanitizePixelId('  ABC123  ') === 'ABC123');

const campaignPage = renderPage({
  content: '<p>x</p>',
  campaign: { name: 'promo' },
  product: { name: 'Qiti', price: 3900 },
  pixelId: 'CAMPAIGNPIXEL1',
});
ok('الصفحة تحمّل بيكسل الحملة', campaignPage.includes("ttq.load('CAMPAIGNPIXEL1')"));
ok('الصفحة ما تحمّلش الافتراضي معاه', !campaignPage.includes(`ttq.load('${PROD_PIXEL_ID}')`));
ok('نسخة وحدة برك', countLoads(campaignPage) === 1, String(countLoads(campaignPage)));

const previewPage = renderPage({
  content: '<p>x</p>',
  campaign: { name: 'promo' },
  product: { name: 'Qiti', price: 3900 },
  pixelId: 'CAMPAIGNPIXEL1',
  preview: true,
});
ok('معاينة اللوحة بلا بيكسل', countLoads(previewPage) === 0);

const adminApi = readFileSync(join(repo, 'api', 'admin-api.mjs'), 'utf8');
ok('المعاينة في admin-api تمرّر preview:true', /renderPage\(\{[^}]*preview: true/.test(adminApi));

/* ── اللوحة: صفحة البيكسلات، ماشي محرّر الحملة ─────────────────────── */

const adminPixels = readFileSync(join(repo, 'admin', 'js', 'pages', 'pixels.js'), 'utf8');
const adminCampaigns = readFileSync(join(repo, 'admin', 'js', 'pages', 'campaigns.js'), 'utf8');
const adminNav = readFileSync(join(repo, 'admin', 'js', 'ui', 'shell.js'), 'utf8');
const adminRouter = readFileSync(join(repo, 'admin', 'js', 'router.js'), 'utf8');

ok('صفحة البيكسلات في القائمة', /view: 'pixels'/.test(adminNav));
ok('الراوتر يعرف الصفحة', /state\.view === 'pixels'/.test(adminRouter));
ok('الصفحة تجيب الإعدادات والحملات',
  /api\('settings\.get'\)/.test(adminRouter) && /api\('campaigns\.list'\)/.test(adminRouter));
ok('الرئيسية تتخزّن في الإعدادات', /settings\.save'[^)]*tiktokPixelMain/.test(adminPixels));
ok('الحملة تتخزّن في سجلّها', /campaigns\.save'[\s\S]{0,200}tiktokPixelId/.test(adminPixels));
ok('اللوحة تفحص الـ id قبل ما تبعث', /PIXEL_RE\.test/.test(adminPixels));
ok('محرّر الحملة ما فيهش البيكسل', !adminCampaigns.includes('tiktokPixel'));

const settingsSource = readFileSync(join(repo, 'lib', 'settings.mjs'), 'utf8');
ok('الإعدادات فيها tiktokPixelMain', /tiktokPixelMain: ''/.test(settingsSource));
ok('الإعدادات تنظّف الـ id', /tiktokPixelMain: sanitizePixelId\(/.test(settingsSource));

const catalog = readFileSync(join(repo, 'lib', 'catalog.mjs'), 'utf8');
ok('الحملة تخزّن البيكسل منظّف', /tiktokPixelId: sanitizePixelId\(/.test(catalog));

const orderSource = readFileSync(join(repo, 'api', 'order.mjs'), 'utf8');
ok('الطلبية تخزّن بيكسل وقت الطلب', /tiktokPixelId: resolvePixelId\(\{/.test(orderSource));

/* ── `event_id`: السيرفر والمتصفّح لازم يتفقو ──────────────────────── */

ok('صيغة event_id تاع السيرفر', tiktokEventId('A7X2', 'PlaceAnOrder') === 'A7X2-placeanorder');

const mainJs = readFileSync(join(repo, 'assets', 'js', 'main.js'), 'utf8');
ok(
  'المتصفّح يبني نفس الصيغة',
  /function ttEventId\(orderId, name\) \{\s*return String\(orderId\) \+ '-' \+ String\(name\)\.toLowerCase\(\);/.test(mainJs),
);
ok('المتصفّح يبعث PlaceAnOrder بـ event_id', mainJs.includes("ttEventId(data.id, 'PlaceAnOrder')"));
ok('المتصفّح ما يبعثش CompletePayment (دفع عند الاستلام)', !/ttSend\(\s*'CompletePayment'/.test(mainJs));
ok('كل نداء ttq يعدّي على ttSend', (mainJs.match(/ttq\.track\(/g) ?? []).length === 1);

/* ── الإرسال من السيرفر ────────────────────────────────────────────── */

const ORDER = {
  id: 'A7X2',
  phone: '0661445566',
  qty: 2,
  total: 8400,
  productId: 'prod_1',
  attribution: { ttclid: 'TTCLID123', ttp: 'TTP456' },
};

delete process.env.TIKTOK_ACCESS_TOKEN;
const skipped = await sendTikTokEvent('PlaceAnOrder', ORDER, { value: 8400 });
ok('بلا توكن → skipped، بلا طلب شبكة', Boolean(skipped.skipped));

process.env.TIKTOK_ACCESS_TOKEN = 'test-token';

const realFetch = globalThis.fetch;
let captured = null;

const stubFetch = (result, status = 200) => {
  globalThis.fetch = async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return { ok: status >= 200 && status < 300, status, json: async () => result };
  };
};

stubFetch({ code: 0, message: 'OK' });
const sent = await sendTikTokEvent('CompletePayment', ORDER, { value: 8400 });

ok('code 0 → نجاح', sent.ok === true, JSON.stringify(sent));
ok('الرابط v1.3/event/track', captured.url === 'https://business-api.tiktok.com/open_api/v1.3/event/track/', captured.url);
ok('التوكن في هيدر Access-Token', captured.options.headers['Access-Token'] === 'test-token');

const body = captured.body;
const event = body.data[0];

ok('event_source = web', body.event_source === 'web');
ok('event_source_id = id البيكسل', body.event_source_id === PROD_PIXEL_ID);
ok('اسم الحدث CompletePayment', event.event === 'CompletePayment');
ok('event_id مبني من رقم الطلب', event.event_id === 'A7X2-completepayment');
ok('event_time بالثواني ماشي بالميلي', event.event_time < 1e11 && event.event_time > 1e9, String(event.event_time));
ok('العملة DZD', event.properties.currency === 'DZD');
ok('القيمة = المجموع', event.properties.value === 8400);
ok('contents فيه المنتج والكمية',
  event.properties.contents[0].content_id === 'prod_1' && event.properties.contents[0].quantity === 2);

ok('الهاتف مهروس بصيغة E.164 مع +', event.user.phone === sha256('+213661445566'), event.user.phone);
ok('الهاتف الخام ما يخرجش أبداً', !JSON.stringify(body).includes('0661445566'));
ok('external_id مهروس من نفس الرقم الدولي', event.user.external_id === sha256('213661445566'));
ok('ttclid يتبعث خام', event.user.ttclid === 'TTCLID123');
ok('ttp يتبعث خام', event.user.ttp === 'TTP456');
ok('الاسم والولاية ما يتبعثوش',
  !('name' in event.user) && !('city' in event.user) && !('ip' in event.user));

/* الطلبية اللي جات من حملة عندها بيكسل تاعها — الحدث يمشي لذاك الحساب */
stubFetch({ code: 0 });
await sendTikTokEvent('CompletePayment', { ...ORDER, tiktokPixelId: 'CAMPAIGNPIXEL1' }, { value: 100 });
ok('الحدث يمشي لبيكسل الطلبية', captured.body.event_source_id === 'CAMPAIGNPIXEL1');

stubFetch({ code: 0 });
await sendTikTokEvent('CompletePayment', { ...ORDER, tiktokPixelId: 'BROKEN PIXEL!' }, { value: 100 });
ok('بيكسل طلبية مكسّر → الافتراضي', captured.body.event_source_id === PROD_PIXEL_ID);

/* بلا توكن مطابقة (زيارة مباشرة بلا ttclid ولا هاتف) — ما نضيّعوش طلب */
captured = null;
const noKeys = await sendTikTokEvent('PlaceAnOrder', { id: 'B1', attribution: null }, { value: 100 });
ok('بلا مفتاح مطابقة → skipped', Boolean(noKeys.skipped) && captured === null);

/* ── الأخطاء ──────────────────────────────────────────────────────── */

stubFetch({ code: 40001, message: 'Invalid access token' });
const apiError = await sendTikTokEvent('PlaceAnOrder', ORDER, { value: 100 });
ok('HTTP 200 مع code ≠ 0 → خطأ', Boolean(apiError.error) && apiError.error.includes('40001'), apiError.error);

stubFetch({}, 500);
const httpError = await sendTikTokEvent('PlaceAnOrder', ORDER, { value: 100 });
ok('HTTP 500 → خطأ', Boolean(httpError.error));

globalThis.fetch = async () => { throw new Error('network down'); };
const thrown = await sendTikTokEvent('PlaceAnOrder', ORDER, { value: 100 });
ok('الشبكة طايحة → { error } ماشي رمي خطأ', thrown.error === 'network down');

globalThis.fetch = realFetch;
delete process.env.TIKTOK_ACCESS_TOKEN;

/* ── الربط في تدفّق الطلب ──────────────────────────────────────────── */

const orderApi = readFileSync(join(repo, 'api', 'order.mjs'), 'utf8');
const decisions = readFileSync(join(repo, 'lib', 'decisions.mjs'), 'utf8');

ok('الطلب يبعث PlaceAnOrder', orderApi.includes("sendTikTokEvent('PlaceAnOrder'"));
ok('الطلب ما يبعثش CompletePayment', !/sendTikTokEvent\(\s*'CompletePayment'/.test(orderApi));
ok('CompletePayment يتبعث من قرار التوصيل', decisions.includes("sendTikTokEvent('CompletePayment'"));
ok(
  'CompletePayment داخل شرط delivered',
  /deliveryStatus === 'delivered'[\s\S]{0,600}sendTikTokEvent\('CompletePayment'/.test(decisions),
);
ok('التتبّع ما يوقّفش الطلب (allSettled)', /Promise\.allSettled\([\s\S]{0,800}sendTikTokEvent/.test(orderApi));

console.log(failed ? `\n${failed} فحص طاح` : '\nكلش مليح');
process.exit(failed ? 1 : 0);
