/*
 * /void من الزرّ حتى التخزين — الطريق كامل كيما يمشي في تيليغرام.
 *
 * ── علاش هاذ الملف موجود ──────────────────────────────────────────
 * فحص دورة الحياة يجرّب `purgeOrder` مباشرةً، وهي تخدم. بصح اللي
 * ينقر في تيليغرام ما ينادّيش الفنكشن — ينقر زرّ، وتيليغرام يبعث
 * `callback_query` للويبهوك، والويبهوك يقرا `callback_data` ويوجّه.
 * كل حلقة في هاذ السلسلة تقدر تنقطع وحدها والفنكشن تبقى سليمة:
 * فعل ما يتعرفش في التوجيه، شرط صلاحية يرفض الشات، ولا زرّ يبعث
 * بيانات ما يقراهاش حتى واحد.
 *
 * فهنا ندخلو من فوق: تحديث تيليغرام حقيقي (JSON) على الهاندلر
 * الحقيقي، ونشوفو واش تبدّل في التخزين وواش تبعث للشات.
 */
import { fakeRedis } from './fake-redis.mjs';

const ok = (label, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);

const OWNER_CHAT = '4242';
const SECRET = 'test-secret';

process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_CHAT_ID = OWNER_CHAT;
process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
delete process.env.ECOTRACK_URL;
delete process.env.ECOTRACK_TOKEN;

const redis = await fakeRedis().start();

/* ── تيليغرام مزوّر: نجمعو كل ما يبعثو الويبهوك ─────────────────── */
const realFetch = globalThis.fetch;
let sent = [];

globalThis.fetch = async (url, options) => {
  const href = String(url);
  if (href.includes('127.0.0.1')) return realFetch(url, options);

  if (href.includes('api.telegram.org')) {
    const method = href.split('/').pop();
    let payload = {};
    try { payload = JSON.parse(options?.body ?? '{}'); } catch { /* ماشي JSON */ }
    sent.push({ method, payload });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 77 } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }

  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
};

const lib = (path) => import(new URL(`../../lib/${path}`, import.meta.url).href);
const { saveOrder, getOrder, algiersDate } = await lib('store.mjs');
const { saveProduct, setVariantStock, getVariantStock, SIMPLE_SKU } = await lib('catalog.mjs');
const { acceptOrder } = await lib('decisions.mjs');

const webhook = (await import(new URL('../../api/telegram-webhook.mjs', import.meta.url).href)).default;

/* الهاندلر ملفوف بـ toVercel — Request وحدو يعدّي (شوف lib/http.mjs) */
const post = (update, { secret = SECRET } = {}) =>
  webhook(new Request('https://qiti.test/api/telegram-webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
    body: JSON.stringify(update),
  }));

const command = (text, chatId = OWNER_CHAT) => post({
  update_id: Math.floor(Math.random() * 1e6),
  message: { message_id: 10, chat: { id: Number(chatId) }, from: { first_name: 'المالك' }, text },
});

const tap = (data, chatId = OWNER_CHAT) => post({
  update_id: Math.floor(Math.random() * 1e6),
  callback_query: {
    id: 'cb-1',
    from: { first_name: 'المالك' },
    data,
    message: { message_id: 11, chat: { id: Number(chatId) }, text: 'متأكد؟' },
  },
});

const lastText = (method = 'sendMessage') =>
  [...sent].reverse().find((call) => call.method === method)?.payload?.text ?? '';

const buttons = () => {
  const call = [...sent].reverse().find((one) => one.payload?.reply_markup?.inline_keyboard);
  return (call?.payload?.reply_markup?.inline_keyboard ?? []).flat();
};

/* ── منتج ومخزون ──────────────────────────────────────────────────── */
const collar = await saveProduct({
  name: 'Void Collar', slug: 'void-collar', type: 'pet',
  price: 3900, unitCost: 1500, status: 'active',
});
await setVariantStock(collar.id, SIMPLE_SKU, 30, 3);
const qty = async () => (await getVariantStock(collar.id, SIMPLE_SKU)).qty;

let seq = 0;
const makeOrder = async (patch = {}) => {
  const id = `${algiersDate().replace(/-/g, '').slice(2)}-v${(seq += 1).toString().padStart(4, '0')}`;
  const record = {
    id, name: 'زبون فحص', phone: '0661445566', wilaya: 'الجزائر', commune: 'باب الوادي',
    shipping: 'home', qty: 1,
    productId: collar.id, productName: collar.name, variant: null,
    unitPrice: 3900, total: 4500, shippingFee: 600,
    lines: [{
      kind: 'product', productId: collar.id, sku: SIMPLE_SKU, name: collar.name,
      qty: 1, unitPrice: 3900, lineTotal: 3900, items: null,
    }],
    day: algiersDate(), createdAt: new Date().toISOString(),
    status: 'pending', actor: null, reason: null, decidedAt: null,
    confirmedAt: null, messageId: null,
    deliveryStatus: null, deliveryActor: null, deliveryDecidedAt: null,
    returnReceivedAt: null,
    ...patch,
  };
  await saveOrder(record);
  return record;
};

/* ═══ 1. /void يعرض التأكيد ═══════════════════════════════════════ */
console.log('══ 1. الأمر يعرض التأكيد ══');

const target = await makeOrder({ phone: '0770333444' });

sent = [];
await command(`/void ${target.id}`);
ok('/void بالـ id يجاوب', sent.length > 0);
ok('الرسالة تطلب تأكيد', lastText().includes('متأكد'), lastText().slice(0, 40));

const idButtons = buttons();
ok('كاين زرّ تأكيد', idButtons.some((b) => b.callback_data === `vdo:${target.id}`),
  idButtons.map((b) => b.callback_data).join(' '));
ok('وكاين زرّ تراجع', idButtons.some((b) => b.callback_data?.startsWith('vdn')));
ok('الطلب لسّا موجود قبل النقرة', Boolean(await getOrder(target.id)));

sent = [];
await command('/void 0770333444');
const phoneButtons = buttons();
ok('/void بالرقم يلقى الطلب', lastText().includes(target.id), lastText().slice(0, 60));
ok('زرّ الرقم يحمل الرقم الموحّد',
  phoneButtons.some((b) => b.callback_data === 'vdp:0770333444'),
  phoneButtons.map((b) => b.callback_data).join(' '));

/* ═══ 2. النقرة تمحي فعلاً ════════════════════════════════════════ */
console.log('══ 2. النقرة تمحي ══');

/*
 * ⚠️ هذا هو الفحص اللي كان ناقص: `purgeOrder` تخدم وحدها، بصح إذا
 * التوجيه ما يعرفش `vdo:` النقرة تروح في السكات — الزرّ يبان يخدم
 * وما يصرا والو.
 */
sent = [];
const before = await qty();
await tap(`vdo:${target.id}`);

ok('النقرة تمحي الطلب', (await getOrder(target.id)) == null);
ok('الرسالة تتبدّل بالنتيجة',
  sent.some((call) => call.method === 'editMessageText' && call.payload.text.includes('تمسح')),
  sent.map((call) => call.method).join(' '));
ok('الزرّ ياخذ جواب', sent.some((call) => call.method === 'answerCallbackQuery'));
ok('الطلب المعلّق ما يبدّلش المخزون', (await qty()) === before);

/* ═══ 3. النقرة على مقبول ترجّع المخزون ═══════════════════════════ */
console.log('══ 3. المخزون يرجع ══');

const acceptedOrder = await makeOrder({ phone: '0770555666' });
await acceptOrder(acceptedOrder.id, { by: 'فحص' });
const afterAccept = await qty();

sent = [];
await tap(`vdp:0770555666`);

ok('المحو بالرقم يمحي الطلب المقبول', (await getOrder(acceptedOrder.id)) == null);
ok('والمخزون يرجع بوحدة', (await qty()) === afterAccept + 1,
  `${afterAccept} → ${await qty()}`);
ok('الرسالة تقول شحال رجع',
  sent.some((call) => call.method === 'editMessageText' && call.payload.text.includes('رجّعنا')),
  lastText('editMessageText').slice(0, 60));

/* ═══ 4. التراجع ══════════════════════════════════════════════════ */
console.log('══ 4. زرّ التراجع ══');

const kept = await makeOrder({ phone: '0770777888' });
sent = [];
await tap('vdn:');
ok('التراجع ما يمحي والو', Boolean(await getOrder(kept.id)));
ok('والرسالة تقولها',
  sent.some((call) => call.method === 'editMessageText' && call.payload.text.includes('تراجعت')));

/* ═══ 5. الصلاحية ═════════════════════════════════════════════════ */
console.log('══ 5. شات آخر ما يمحيش ══');

const safe = await makeOrder({ phone: '0770999000' });

sent = [];
await tap(`vdo:${safe.id}`, '9999');
ok('شات آخر ما يمحيش', Boolean(await getOrder(safe.id)));
ok('ويتقالو ما عندوش صلاحية',
  sent.some((call) => call.method === 'answerCallbackQuery'
    && String(call.payload.text ?? '').includes('صلاحية')));

sent = [];
const forbidden = await post({ update_id: 1, callback_query: { id: 'x', from: {}, data: `vdo:${safe.id}`, message: { message_id: 1, chat: { id: Number(OWNER_CHAT) } } } }, { secret: 'wrong' });
ok('سرّ غالط يترفض', forbidden.status === 403, String(forbidden.status));
ok('والطلب يبقى', Boolean(await getOrder(safe.id)));

/* ═══ 6. طلب ما كاينش ═════════════════════════════════════════════ */
console.log('══ 6. أخطاء واضحة ══');

sent = [];
await command('/void 260101-zzzzz');
ok('id ما كاينش يقول ما لقيتش', lastText().includes('ما لقيتش'), lastText().slice(0, 40));

sent = [];
await command('/void 0555000111');
ok('رقم بلا طلبات يقولها', lastText().includes('ما لقيت'), lastText().slice(0, 40));

sent = [];
await command('/void');
ok('/void بلا وسيط يشرح الاستعمال', lastText().includes('/void 0661445566'), lastText().slice(0, 60));

/* ═══ 7. زبون بزوج طلبات: لائحة اختيار ═══════════════════════════ */
console.log('══ 7. اختار أشمن طلب ══');

/*
 * ⚠️ التأكيد الواحد اللي يمحي الكل يخلّي واحد يحب يحيّد طلب غالط
 * يمحي معاه طلبات صحاح. اللائحة تعطي زرّ لكل طلب.
 */
const one = await makeOrder({ phone: '0771222333', name: 'أوّل' });
const two = await makeOrder({ phone: '0771222333', name: 'ثاني' });
const three = await makeOrder({ phone: '+213771222333', name: 'ثالث' });

sent = [];
await command('/void 0771222333');
const picks = buttons();
ok('اللائحة تعطي زرّ لكل طلب',
  [one, two, three].every((order) => picks.some((b) => b.callback_data === `vds:${order.id}`)),
  picks.map((b) => b.callback_data).join(' '));
ok('وزرّ "امحيهم كامل" يبقى موجود',
  picks.some((b) => b.callback_data === 'vdp:0771222333'));
ok('اللائحة تكتب حالة كل طلب', lastText().includes('معلّق'), lastText().slice(0, 80));

/* الاختيار يبدّل الرسالة لتأكيد طلب واحد — ما يمحيش على طول */
sent = [];
await tap(`vds:${two.id}`);
ok('الاختيار ما يمحيش على طول', Boolean(await getOrder(two.id)));
ok('يبدّل الرسالة لتأكيد',
  lastText('editMessageText').includes('متأكد') && lastText('editMessageText').includes(two.id),
  lastText('editMessageText').slice(0, 60));

const confirmButtons = buttons();
ok('والزرّ ولّى على هاذ الطلب برك',
  confirmButtons.some((b) => b.callback_data === `vdo:${two.id}`),
  confirmButtons.map((b) => b.callback_data).join(' '));

sent = [];
await tap(`vdo:${two.id}`);
ok('التأكيد يمحي المختار', (await getOrder(two.id)) == null);
ok('والباقي يبقى',
  Boolean(await getOrder(one.id)) && Boolean(await getOrder(three.id)));

/* "امحيهم كامل" يبقى يخدم */
sent = [];
await tap('vdp:0771222333');
ok('"امحيهم كامل" يمحي الباقي',
  (await getOrder(one.id)) == null && (await getOrder(three.id)) == null);

/* طلب تمسح من قبل: الاختيار يقول بصراحة بدل ما يسكت */
sent = [];
await tap(`vds:${two.id}`);
ok('اختيار طلب راح يقول ما لقيتش',
  lastText('editMessageText').includes('ما لقيتش'), lastText('editMessageText').slice(0, 50));

/* ═══ 8. الفشل يتكتب في الرسالة ═══════════════════════════════════ */
console.log('══ 8. الفشل يبان ══');

/*
 * ⚠️ الـ toast يطير في ثانيتين. كي الطردة ما تتلغاش، لازم الرسالة
 * روحها تقول علاش — وإلا المشغّل يشوف نفس الأزرار ويحسب النقرة
 * ما وصلتش أصلاً.
 */
process.env.ECOTRACK_URL = 'https://dhd.test';
process.env.ECOTRACK_TOKEN = 'test-token';

const stuck = await makeOrder({ phone: '0771444555' });
await acceptOrder(stuck.id, { by: 'فحص' });
const { updateOrder } = await lib('store.mjs');
await updateOrder(stuck.id, {
  shipment: { provider: 'ecotrack', tracking: 'TEST-WH-1', state: 'success', stage: 'created' },
});

const okFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const href = String(url);
  if (href.includes('dhd.test')) return new Response('boom', { status: 500 });
  return okFetch(url, options);
};

sent = [];
await tap(`vdo:${stuck.id}`);
ok('الطلب يبقى كي الطردة ما تلغاتش', Boolean(await getOrder(stuck.id)));
ok('والرسالة تقول علاش',
  lastText('editMessageText').includes('ما تمسحش'), lastText('editMessageText').slice(0, 60));

globalThis.fetch = okFetch;
delete process.env.ECOTRACK_URL;
delete process.env.ECOTRACK_TOKEN;

globalThis.fetch = realFetch;
redis.stop();
