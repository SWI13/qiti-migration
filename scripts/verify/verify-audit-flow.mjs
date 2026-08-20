/*
 * السجلّ من الباب: نداء حقيقي على اللوحة، ونقرة حقيقية من تيليغرام.
 *
 * ── علاش هاذ الملف موجود حذا verify-audit ──────────────────────────
 * `verify-audit.mjs` يفحص المحرّك: الكتابة، الحجب، الفلترة. بصح
 * المحرّك يقدر يكون سليم والسطر ما يتكتبش أصلاً — أكشن ما دخلش
 * لقائمة `AUDITED`، ولا الويبهوك ما ينادّيش، ولا الجواب يتقرا مرّتين
 * فيطيح. هنا ندخلو من فوق: HTTP على الفنكشن الحقيقية، ونشوفو واش
 * تبدّل في السجلّ وواش رجع للمتصفّح.
 */
import { fakeRedis } from './fake-redis.mjs';

const ok = (label, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);

const OWNER_CHAT = '5150';
const WEBHOOK_SECRET = 'flow-secret';

process.env.ADMIN_PASSWORD_HASH = 'a'.repeat(64);
process.env.ADMIN_SESSION_SECRET = 'flow-session-secret-that-is-long-enough';
process.env.TELEGRAM_BOT_TOKEN = 'flow-token';
process.env.TELEGRAM_CHAT_ID = OWNER_CHAT;
process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET;
delete process.env.ECOTRACK_URL;
delete process.env.ECOTRACK_TOKEN;

const redis = await fakeRedis().start();

/* تيليغرام مزوّر — ما نحبّوش نداء حقيقي، ونحبّو نشوفو واش تبعث */
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const href = String(url);
  if (href.includes('127.0.0.1')) return realFetch(url, options);
  return new Response(JSON.stringify({ ok: true, result: { message_id: 900 } }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
};

const lib = (path) => import(new URL(`../../lib/${path}`, import.meta.url).href);
const { sessionCookie, COOKIE_NAME } = await lib('auth.mjs');
const { listEvents, eventsForOrder } = await lib('audit.mjs');
const { saveOrder, getOrder, algiersDate } = await lib('store.mjs');
const { saveProduct, setVariantStock, getVariantStock, SIMPLE_SKU } = await lib('catalog.mjs');

const adminApi = (await import(new URL('../../api/admin-api.mjs', import.meta.url).href)).default;
const webhook = (await import(new URL('../../api/telegram-webhook.mjs', import.meta.url).href)).default;

const cookie = sessionCookie();

const call = (action, payload = {}, { authed = true } = {}) =>
  adminApi(new Request('https://qiti.test/api/admin-api', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'VerifyBot/1.0',
      'x-forwarded-for': '41.100.0.7',
      ...(authed ? { cookie: cookie.split(';')[0] } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  }));

const tap = (data) => webhook(new Request('https://qiti.test/api/telegram-webhook', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
  body: JSON.stringify({
    update_id: Math.floor(Math.random() * 1e6),
    callback_query: {
      id: 'cb', from: { first_name: 'كريم', id: 77 }, data,
      message: { message_id: 12, chat: { id: Number(OWNER_CHAT) }, text: 'طلب' },
    },
  }),
}));

/* ── بيانات الفحص ─────────────────────────────────────────────────── */

const product = await saveProduct({
  name: 'Flow Collar', slug: 'flow-collar', type: 'pet',
  price: 4000, unitCost: 1500, status: 'active',
});
await setVariantStock(product.id, SIMPLE_SKU, 12, 3);

let seq = 0;
const makeOrder = async (patch = {}) => {
  const id = `${algiersDate().replace(/-/g, '').slice(2)}-f${(seq += 1).toString().padStart(4, '0')}`;
  const record = {
    id, name: 'زبونة فحص', phone: '0770112244', wilaya: 'الجزائر', commune: 'باب الوادي',
    shipping: 'home', qty: 1, productId: product.id, productName: product.name, variant: null,
    unitPrice: 4000, total: 4600, shippingFee: 600,
    lines: [{
      kind: 'product', productId: product.id, sku: SIMPLE_SKU, name: product.name,
      qty: 1, unitPrice: 4000, lineTotal: 4000, items: null,
    }],
    day: algiersDate(), createdAt: new Date().toISOString(),
    status: 'pending', actor: null, reason: null, decidedAt: null,
    confirmedAt: null, messageId: null,
    deliveryStatus: null, deliveryActor: null, deliveryDecidedAt: null, returnReceivedAt: null,
    ...patch,
  };
  await saveOrder(record);
  return record;
};

/* ═══ 1. فعل من اللوحة يكتب سطر ══════════════════════════════════ */
console.log('══ 1. اللوحة ══');

const saved = await call('products.save', {
  product: { ...product, price: 4900 },
});
ok('حفظ المنتج ينجح', saved.status === 200, String(saved.status));

const savedBody = await saved.json();
ok('والجواب يوصل كامل (الجسم ما يتاكلش)', savedBody?.product?.price === 4900,
  JSON.stringify(savedBody).slice(0, 60));

const priceLog = (await listEvents({ action: 'product.saved' })).rows[0];
ok('التبديل يتسجّل', Boolean(priceLog));
ok('والمصدر اللوحة', priceLog?.source === 'admin', String(priceLog?.source));
ok('والسومة القديمة مكتوبة', priceLog?.oldValues?.price === 4000, String(priceLog?.oldValues?.price));
ok('والجديدة', priceLog?.newValues?.price === 4900, String(priceLog?.newValues?.price));
ok('والـ IP', priceLog?.ip === '41.100.0.7', String(priceLog?.ip));
ok('والمتصفّح', String(priceLog?.userAgent).includes('VerifyBot'), String(priceLog?.userAgent));
ok('والجلسة تتسمّى', String(priceLog?.actorId ?? '').startsWith('s-'), String(priceLog?.actorId));

/* الفشل من اللوحة يتسجّل كـ failed */
const badDelete = await call('products.delete', { id: 'ma-kanch' });
ok('حذف منتج ما كاينش يرجّع 400', badDelete.status === 400, String(badDelete.status));

const deleteLog = (await listEvents({ action: 'product.deleted' })).rows[0];
ok('والفشل يتسجّل', deleteLog?.status === 'failed', String(deleteLog?.status));
ok('ومعاه السبب', Boolean(deleteLog?.error), String(deleteLog?.error));

/* القراية ما تسجّلش — وإلا السجلّ يغرق */
const before = (await listEvents({ limit: 200 })).total;
await call('products.list');
await call('queue.count');
await call('orders.list');
const after = (await listEvents({ limit: 200 })).total;
ok('القراية ما تكتبش سطور', after === before, `${before} → ${after}`);

/* ═══ 2. القرار من اللوحة ════════════════════════════════════════ */
console.log('══ 2. قرار من اللوحة ══');

const adminOrder = await makeOrder();
const accepted = await call('orders.accept', { id: adminOrder.id });
ok('القبول من اللوحة ينجح', accepted.status === 200, String(accepted.status));

const acceptLog = (await eventsForOrder(adminOrder.id)).find((e) => e.action === 'order.accepted');
ok('ويتسجّل بمصدر admin', acceptLog?.source === 'admin', String(acceptLog?.source));
ok('ومربوط بالطلب', acceptLog?.orderId === adminOrder.id);
ok('وفيه الحالة قبل وبعد',
  acceptLog?.oldValues?.status === 'pending' && acceptLog?.newValues?.status === 'accepted');

/* ═══ 3. نقرة من تيليغرام ════════════════════════════════════════ */
console.log('══ 3. نقرة تيليغرام ══');

const tgOrder = await makeOrder();
const response = await tap(`ok:${tgOrder.id}`);
ok('الويبهوك يجاوب 200', response.status === 200, String(response.status));

const tgEvents = await eventsForOrder(tgOrder.id);
const tgAccept = tgEvents.find((event) => event.action === 'order.accepted');
ok('النقرة تكتب سطر', Boolean(tgAccept));
ok('ومصدرها telegram', tgAccept?.source === 'telegram', String(tgAccept?.source));
ok('وفيها اسم اللي نقر', tgAccept?.actorName === 'كريم', String(tgAccept?.actorName));
ok('وشات تيليغرام', tgAccept?.telegramChatId === OWNER_CHAT, String(tgAccept?.telegramChatId));

const received = (await listEvents({ action: 'telegram.webhook.received' })).rows[0];
ok('واستقبال التحديث يتسجّل', Boolean(received));
ok('ومعاه معرّف يربط السطور', Boolean(received?.requestId));
ok('والقرار ياخذ نفس المعرّف', tgAccept?.requestId === received?.requestId,
  `${tgAccept?.requestId} / ${received?.requestId}`);

/* ═══ 4. الويبهوك اللي يتعاود ════════════════════════════════════ */
console.log('══ 4. نفس التحديث مرّتين ══');

const repeated = {
  update_id: 424242,
  callback_query: {
    id: 'cb-dup', from: { first_name: 'كريم', id: 77 }, data: 'vdn:',
    message: { message_id: 13, chat: { id: Number(OWNER_CHAT) }, text: 'x' },
  },
};
const post = (update) => webhook(new Request('https://qiti.test/api/telegram-webhook', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
  body: JSON.stringify(update),
}));

await post(repeated);
await post(repeated);
const dupes = (await listEvents({ q: '424242', limit: 200 })).rows
  .filter((event) => event.action === 'telegram.webhook.received');
ok('التحديث المكرّر ما يزيدش سطر ثاني', dupes.length === 1, String(dupes.length));

/* ═══ 5. سرّ غالط في الويبهوك ════════════════════════════════════ */
console.log('══ 5. ويبهوك مزوّر ══');

const forged = await webhook(new Request('https://qiti.test/api/telegram-webhook', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'wrong' },
  body: JSON.stringify({ update_id: 1, message: { text: '/state' } }),
}));
ok('السرّ الغالط يترفض', forged.status === 403, String(forged.status));
ok('والمحاولة تتسجّل',
  (await listEvents({ action: 'telegram.webhook.rejected' })).total >= 1);

/* ═══ 6. الصلاحية على السجلّ روحو ════════════════════════════════ */
console.log('══ 6. شكون يقرا السجلّ ══');

const denied = await call('logs.list', {}, { authed: false });
ok('بلا جلسة: 401', denied.status === 401, String(denied.status));
const deniedBody = await denied.json();
ok('وما يرجّعش سطور', deniedBody.rows === undefined);

const withBadCookie = await adminApi(new Request('https://qiti.test/api/admin-api', {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: `${COOKIE_NAME}=forged.signature` },
  body: JSON.stringify({ action: 'logs.list' }),
}));
ok('كوكي مزوّرة: 401', withBadCookie.status === 401, String(withBadCookie.status));

const allowed = await call('logs.list', { filters: { limit: 5 } });
ok('بجلسة صحيحة: 200', allowed.status === 200, String(allowed.status));
const allowedBody = await allowed.json();
ok('والسطور توصل', Array.isArray(allowedBody.rows) && allowedBody.rows.length > 0);
ok('ومعاها المجموع والصفحات', typeof allowedBody.total === 'number' && typeof allowedBody.pages === 'number');

/* الملخّص والخطّ الزمني */
const summary = await (await call('logs.summary')).json();
ok('الملخّص يوصل', summary.summary && typeof summary.summary.today.total === 'number');

const timeline = await (await call('logs.order', { id: adminOrder.id })).json();
ok('الخطّ الزمني يوصل بالطلب', Array.isArray(timeline.events) && timeline.events.length > 0);
ok('وكلّو تاع نفس الطلب', timeline.events.every((event) => event.orderId === adminOrder.id));

/* ═══ 7. ما كاينش سرّ في السجلّ ═══════════════════════════════════ */
console.log('══ 7. تفتيش على الأسرار ══');

await call('settings.save', {
  settings: { autoShip: false, telegramBotToken: 'SECRET-TOKEN-XYZ', password: 'hunter2' },
});

const everything = JSON.stringify((await listEvents({ limit: 200 })).rows);
ok('توكن البوت ما دخلش', everything.indexOf('SECRET-TOKEN-XYZ') === -1);
ok('كلمة السرّ ما دخلتش', everything.indexOf('hunter2') === -1);
ok('وسرّ الويبهوك ما دخلش', everything.indexOf(WEBHOOK_SECRET) === -1);
ok('وسرّ الجلسة ما دخلش', everything.indexOf(process.env.ADMIN_SESSION_SECRET) === -1);
ok('وهاش كلمة السرّ ما دخلش', everything.indexOf(process.env.ADMIN_PASSWORD_HASH) === -1);

const settingsLog = (await listEvents({ action: 'settings.changed' })).rows[0];
ok('وتبديل الإعدادات يتسجّل', Boolean(settingsLog));
ok('والحقل الحسّاس يبان محجوب ماشي مكتوب',
  JSON.stringify(settingsLog?.newValues ?? {}).includes('[محجوب]')
  || !JSON.stringify(settingsLog?.newValues ?? {}).includes('SECRET'),
  JSON.stringify(settingsLog?.newValues ?? {}).slice(0, 80));

/* ═══ 8. المخزون والسومة: الفرق يتسجّل ═══════════════════════════ */
console.log('══ 8. المخزون ══');

const beforeQty = (await getVariantStock(product.id, SIMPLE_SKU)).qty;
await call('stock.set', { productId: product.id, sku: SIMPLE_SKU, qty: beforeQty + 7 });

const stockLog = (await listEvents({ action: 'stock.changed' })).rows[0];
ok('تبديل المخزون يتسجّل', Boolean(stockLog));
ok('والكمية القديمة', stockLog?.oldValues?.qty === beforeQty, String(stockLog?.oldValues?.qty));
ok('والجديدة', stockLog?.newValues?.qty === beforeQty + 7, String(stockLog?.newValues?.qty));
ok('ومربوط بالمنتج', stockLog?.entityId === product.id);

globalThis.fetch = realFetch;
redis.stop();
