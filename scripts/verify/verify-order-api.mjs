/*
 * `api/order` من برّا — طلب HTTP حقيقي يدخل، وجواب يخرج.
 *
 * ── علاش على مستوى الطريق وماشي الفنكشن ────────────────────────────
 * أخطر عطب لقيناه في التدقيق كان في الجواب روحو، ماشي في المنطق:
 * الطلب يتخزّن مليح، ومن بعد تيليغرام يطيح، والفنكشن ترجّع 502 بـ
 * «ما قدرناش نسجّلو الطلب دروك. عاود حاول». الزبونة تعاود، ويولّي
 * عندك زوج طلبات على نفس السلعة.
 *
 * فحص على مستوى المنطق ما كانش يشوفو: `saveOrder` نجحت، والمخزون
 * صحيح، والرسالة تبنات مليح. اللي كان غالط هو **رمز الجواب**. علاش
 * هاذ السويت تنادي الهاندلر بـ Request وتقرا الـ Response.
 *
 * ⚠️ `fetch` مزوّر هنا: تيليغرام، Twilio، ميتا، وخدمة الثقة كامل
 * يعدّيو منّو. هكذا نقدرو نطيّحو وحدة وحدة ونشوفو واش يصرا.
 */
import { fakeRedis } from './fake-redis.mjs';

const ok = (label, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);

const redis = await fakeRedis().start();

process.env.TELEGRAM_BOT_TOKEN = 'test:token';
process.env.TELEGRAM_CHAT_ID = '-100123';
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.ECOTRACK_URL;
delete process.env.ECOTRACK_TOKEN;

/* ── fetch مزوّر ──────────────────────────────────────────────────── */

let telegramUp = true;
let telegramCalls = 0;

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const href = String(url);

  /* Redis المزيّف سيرفر حقيقي — نخلّيوه يعدّي */
  if (href.includes('127.0.0.1')) return realFetch(url, options);

  if (href.includes('api.telegram.org')) {
    telegramCalls += 1;
    if (!telegramUp) throw new Error('getaddrinfo ENOTFOUND api.telegram.org');
    return new Response(JSON.stringify({ ok: true, result: { message_id: 4242 } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }

  /* أي خدمة أخرى (ميتا، الثقة) — جواب فارغ مقبول */
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
};

const lib = (path) => import(new URL(`../../lib/${path}`, import.meta.url).href);
const { getOrder, listOrders } = await lib('store.mjs');
const { saveProduct, setVariantStock, SIMPLE_SKU } = await lib('catalog.mjs');

const orderApi = (await import(new URL('../../api/order.mjs', import.meta.url).href)).default;

const product = await saveProduct({
  name: 'API Test Product', slug: 'api-test-product', type: 'tech',
  price: 5000, unitCost: 2000, status: 'active',
});
await setVariantStock(product.id, SIMPLE_SKU, 50, 5);

/* الهاندلر ملفوف بـ toVercel: ينادى بـ Request وحدو، بلا res */
/* ⚠️ كل قسم بـ IP وحدو: تحديد المعدّل حقيقي هنا، وIP مشترك يخلّي
   القسم الرابع يطيح على حبس سبّبو القسم الأوّل — فحص يكذب على روحو */
let ipSeq = 0;
const post = (body, headers = {}) => orderApi(new Request('https://qiti.test/api/order', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-forwarded-for': `10.0.${Math.floor(ipSeq / 250)}.${(ipSeq += 1) % 250}`,
    ...headers,
  },
  body: JSON.stringify(body),
}));

const validOrder = (patch = {}) => ({
  name: 'أمينة بن علي', phone: '0661112233', wilaya: 'الجزائر', commune: 'باب الوادي',
  shipping: 'home', qty: 1, productId: product.id, ...patch,
});

/* ═══ 1. الطريق العادي ═════════════════════════════════════════════ */
console.log('══ 1. طلب عادي ══');

const good = await post(validOrder());
const goodBody = await good.json();
ok('الطلب الصحيح يرجّع 200', good.status === 200, String(good.status));
ok('الجواب فيه رقم الطلب', Boolean(goodBody.id));

const stored = await getOrder(goodBody.id);
ok('الطلب تخزّن', Boolean(stored));
ok('السومة تتحسب في السيرفر', stored.total === 5000 + stored.shippingFee,
  `${stored.total} (سلعة 5000 + توصيل ${stored.shippingFee})`);
ok('message_id تخزّن', stored.messageId === 4242);
ok('ما كاينش خطأ إشعار', stored.notifyError === null);

/* ═══ 2. تيليغرام طايح ═════════════════════════════════════════════ */
console.log('══ 2. تيليغرام طايح ══');

telegramUp = false;
const callsBefore = telegramCalls;

const down = await post(validOrder({ phone: '0661112244' }));
const downBody = await down.json();

/*
 * ⚠️ هذا هو الفحص. كان يرجّع 502 و«عاود حاول» — والطلب راه مخزّن.
 * الزبونة تعاود، ويولّي عندك زوج طلبات. تيليغرام طبقة إشعار، ماشي
 * جزء من البيعة.
 */
ok('الطلب ينجح حتى وتيليغرام طايح', down.status === 200, String(down.status));
ok('الزبونة تاخذ رقم طلبها', Boolean(downBody.id));
ok('تيليغرام تنادى فعلاً (وطاح)', telegramCalls > callsBefore);

const downStored = await getOrder(downBody.id);
ok('الطلب تخزّن رغم الفشل', Boolean(downStored));
ok('الفشل تعلّم على الطلب', Boolean(downStored.notifyError), downStored?.notifyError ?? '');
ok('الطلب يبقى pending، قابل للقرار', downStored.status === 'pending');
ok('المجموع صحيح رغم الفشل', downStored.total === 5000 + downStored.shippingFee);

telegramUp = true;

/* ═══ 3. التحقّق ═══════════════════════════════════════════════════ */
console.log('══ 3. التحقّق من المدخلات ══');

/*
 * ⚠️ الترتيب في الهاندلر مقصود: `validate()` تجي قبل حدّ الرقم، فطلب
 * غالط ياخذ 400 بلا ما ياكل من رصيد الرقم. لو كان العكس، الزبونة
 * اللي تغلط ثلاث مرّات في الفورم تولّي محبوسة.
 */
const cases = [
  ['اسم قصير', validOrder({ name: 'أ', phone: '0770112201' })],
  ['رقم غالط', validOrder({ phone: '0123456789' })],
  ['بلدية فارغة', validOrder({ commune: '', phone: '0770112202' })],
  /* اسم ولاية ما كاينش في الـ58 — كان يعدّي ويتخزّن بتسعيرة افتراضية،
     ويطيح من بعد عند إنشاء الطردة بـ "الولاية غير معروفة" */
  ['ولاية ما كايناش', validOrder({ wilaya: 'لا-وجود', phone: '0770112203' })],
  ['ولاية ما نوصّلوهاش', validOrder({ wilaya: 'جانت', phone: '0770112204' })],
];

for (const [label, body] of cases) {
  const response = await post(body);
  ok(`${label} يترفض بـ 400`, response.status === 400, String(response.status));
}

/* فخّ البوتات: نجاح كاذب، بلا تخزين */
const countBefore = (await listOrders()).length;
const bot = await post({ ...validOrder({ phone: '0770998877' }), website: 'http://spam' });
ok('فخّ البوتات يرجّع نجاح', bot.status === 200);
ok('فخّ البوتات ما يخزّنش', (await listOrders()).length === countBefore);

/* ═══ 4. السومة تجي من السيرفر ═════════════════════════════════════ */
console.log('══ 4. السومة ما تجيش من المتصفّح ══');

/*
 * ⚠️ المتصفّح يبعث `total` و`unitPrice` — ولازم يتجاهلو كامل. لو
 * السيرفر يثق فيهم، أي واحد يفتح devtools يشري بـ 1 دج.
 */
const cheat = await post(validOrder({ phone: '0661119999', total: 1, unitPrice: 1, shippingFee: 0 }));
const cheatBody = await cheat.json();
const cheatStored = await getOrder(cheatBody.id);
ok('السومة المبعوثة من المتصفّح تتجاهل', cheatStored.unitPrice === 5000, String(cheatStored.unitPrice));
ok('المجموع يتحسب من الكاتالوغ', cheatStored.total === 5000 + cheatStored.shippingFee,
  String(cheatStored.total));

/* الكمية تتحصر — 999 وحدة على منتج ما تعدّيش */
const bulk = await post(validOrder({ phone: '0661118888', qty: 999 }));
const bulkStored = await getOrder((await bulk.json()).id);
ok('الكمية تتحصر في 10', bulkStored.qty === 10, String(bulkStored.qty));

/* ═══ 5. تحديد المعدّل ═════════════════════════════════════════════ */
console.log('══ 5. تحديد المعدّل ══');

/*
 * ⚠️ ما كانش كاين تحديد معدّل أصلاً. `api/order` مفتوحة للعالم،
 * وكل نداء يكتب في Redis ويبعث رسالة تيليغرام — سكريبت تاع عشرة
 * أسطر يقدر يغرق الگروب ويخلّي الطلبات الحقيقية تضيع بيناتهم.
 */
let limited = null;
for (let i = 0; i < 12 && !limited; i += 1) {
  const response = await post(validOrder({ phone: `066111${String(3000 + i).padStart(4, '0')}` }),
    { 'x-forwarded-for': '10.9.9.9' });
  if (response.status === 429) limited = response;
}

ok('الـ IP اللي يقصف يتحبس', Boolean(limited));
ok('الحبس يرجّع Retry-After', Boolean(limited?.headers.get('retry-after')),
  limited?.headers.get('retry-after') ?? '');

/* IP آخر ما يتأثّرش — الحبس على القاصف برك */
const other = await post(validOrder({ phone: '0661117777' }), { 'x-forwarded-for': '10.8.8.8' });
ok('IP آخر يبقى يخدم', other.status === 200, String(other.status));

/* نفس الرقم يتحبس هو تاني، حتى من IP جديد */
let phoneLimited = null;
for (let i = 0; i < 6 && !phoneLimited; i += 1) {
  const response = await post(validOrder({ phone: '0661116666' }),
    { 'x-forwarded-for': `10.7.7.${i}` });
  if (response.status === 429) phoneLimited = response;
}
ok('نفس الرقم يتحبس حتى بـ IP جديد', Boolean(phoneLimited));

globalThis.fetch = realFetch;
redis.stop();
