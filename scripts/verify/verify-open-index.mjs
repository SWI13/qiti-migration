/*
 * فهرس الطلبات المفتوحة — الفحوصات.
 *
 * ⚠️ هذا السويت الوحيد اللي يلمس التخزين، وبقصد: الفهرس كامل هو
 * منطق تخزين. فنكشن نقي ما عندوش شنو يفحص فيه — الغلط الوحيد اللي
 * يقدر يصرا هو "المفتاح تكتب ولا ما تكتبش"، وهذا ما يبان غير على
 * مخزن حقيقي.
 *
 * علاش ما نحتاجوش Redis: العميل (Upstash) يهدر REST فوق HTTP. نطلقو
 * سيرفر صغير في نفس العملية يفهم أربع أوامر (SET/GET/DEL/SCAN) على
 * Map، ونوجّهو له المتغيّرات. بلا حساب، بلا شبكة، بلا حاجة تتنصّب.
 *
 * اللي يتفحص هنا هو الوعد اللي بنى عليه صفّ المكالمات: قراءة الصفّ
 * تكون بقدّ الشغل المفتوح، ماشي بقدّ الأرشيف. والانحراف (مفتاح زائد،
 * مفتاح ناقص) يتصلّح وحدو بدل ما يخبّي طلب على المشغّل.
 */
import { createServer } from 'node:http';

const ok = (label, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);

/* ── Redis مزيّف: Map + أربع أوامر ────────────────────────────────── */

const db = new Map();

function run(command) {
  const [name, ...args] = command;
  const op = String(name).toUpperCase();
  if (op === 'SET') { db.set(args[0], args[1]); return 'OK'; }
  if (op === 'GET') return db.has(args[0]) ? db.get(args[0]) : null;
  if (op === 'DEL') return db.delete(args[0]) ? 1 : 0;
  if (op === 'SCAN') {
    const matchAt = args.findIndex((arg) => String(arg).toUpperCase() === 'MATCH');
    const prefix = (matchAt >= 0 ? String(args[matchAt + 1]) : '*').replace(/\*$/, '');
    /* المؤشّر يرجع 0 ديما — كلش في دورة وحدة، والمخزن هنا صغير */
    return ['0', [...db.keys()].filter((key) => key.startsWith(prefix))];
  }
  throw new Error(`fake redis: unsupported command ${op}`);
}

const server = createServer((request, response) => {
  let body = '';
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    const parsed = body ? JSON.parse(body) : [];
    /* الأنبوب (pipeline) يبعث لائحة أوامر، والنداء العادي أمر واحد */
    const isPipeline = request.url.includes('pipeline') || Array.isArray(parsed[0]);
    const result = isPipeline ? parsed.map((command) => ({ result: run(command) })) : { result: run(parsed) };
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(result));
  });
});

await new Promise((resolve) => server.listen(0, resolve));
process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${server.address().port}`;
process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

/* الاستيراد لازم يجي **بعد** المتغيّرات — العميل يتبنى عند أوّل نداء،
   بصح المتغيّرات تتقرا وقتها، فأي استيراد بكري يخدم بلا مخزن */
const lib = (path) => import(new URL(`../../lib/${path}`, import.meta.url).href);
const store = await lib('store.mjs');
const { logOrderCall } = await lib('calls.mjs');

const KEY = (id) => `qiti:open-orders:${id}`;
const order = (id, status = 'pending') => ({
  id, status, name: 'كريم', phone: '0661445566', wilaya: 'وهران',
  qty: 1, total: 3900, createdAt: new Date().toISOString(),
});
const pendingIds = async () => (await store.listPendingOrders()).map((row) => row.id);

console.log('══ 1. الطلبات اللي كانو قبل الفهرس ══');
await store.saveOrder(order('260810-old01'));
await store.saveOrder(order('260810-old02', 'accepted'));
/* نمسحو الفهرس بيدينا = محل خدّام من قبل ما تنشر الميزة */
db.delete(KEY('260810-old01'));
db.delete(KEY('_built'));

let ids = await pendingIds();
ok('أوّل قراءة تبني الفهرس من الأرشيف', ids.length === 1 && ids[0] === '260810-old01', ids.join(','));
ok('وتخلّي علامة "مبني" باش ما تعاودش', db.has(KEY('_built')));
ok('الطلب المقرّر ما يدخلش الفهرس', !db.has(KEY('260810-old02')));

console.log('\n══ 2. الفهرس يتبع الكتابة وحدو ══');
await store.saveOrder(order('260819-new01'));
ok('طلب جديد يدخل بلا ما ينادي عليه حتى واحد', (await pendingIds()).includes('260819-new01'));

await logOrderCall('260819-new01', { outcome: 'no-answer', by: 'كريم' });
ok('تسجيل مكالمة ما يخرّجش الطلب من الصفّ', (await pendingIds()).includes('260819-new01'));
ok('والمحاولة تتخزّن على الطلب', (await store.getOrder('260819-new01')).calls.length === 1);

await store.updateOrder('260819-new01', { status: 'accepted' });
ok('القرار يخرّجو من الصفّ', !(await pendingIds()).includes('260819-new01'));
ok('والمفتاح يتمسح فعلاً', !db.has(KEY('260819-new01')));

console.log('\n══ 3. الانحراف يتصلّح وحدو ══');
/* كتابة طاحت في النص: الطلب تقرّر والمفتاح بقا */
db.set(KEY('260810-old02'), '1');
ids = await pendingIds();
ok('مفتاح لطلب مقرّر ما يبانش في الصفّ', !ids.includes('260810-old02'));
ok('ويتمسح من الفهرس ساعة ما يتقرا', !db.has(KEY('260810-old02')));

db.set(KEY('260810-ghost'), '1');
ids = await pendingIds();
ok('مفتاح لطلب ما كاينش ما يطيّحش الصفّ', Array.isArray(ids) && !db.has(KEY('260810-ghost')));

db.set(KEY('260810-ghost'), '1');
db.delete(KEY('260810-old01'));
const rebuilt = await store.rebuildOpenIndex();
ok('إعادة البناء ترجّع الطلبات المفتوحة بالضبط',
  rebuilt.length === 1 && rebuilt[0].id === '260810-old01', rebuilt.map((row) => row.id).join(','));
ok('وتمسح الزائد', !db.has(KEY('260810-ghost')));
ok('وترجّع الناقص', db.has(KEY('260810-old01')));

console.log('\n══ 4. /clear ══');
await store.clearAllOrders();
ok('يمسح الفهرس مع الطلبات', ![...db.keys()].some((key) => key.startsWith('qiti:open-orders:')));
ok('والصفّ يولّي خاوي', (await pendingIds()).length === 0);

console.log('\n══ 5. الوعد: القراءة بقدّ الشغل ماشي بقدّ الأرشيف ══');
/*
 * 200 طلب مقرّر + طلب واحد مفتوح. قبل الفهرس، هذي القراءة كانت تقرا
 * 201 طلب باش تلقى واحد — وعلى محل يدير 200 طلب في النهار، الأرشيف
 * يوصل عشرات الآلاف، وصفّ المكالمات يتنادى على كل نقرة.
 */
for (let index = 0; index < 200; index++) {
  await store.saveOrder(order(`260801-a${index}`, 'delivered'));
}
await store.saveOrder(order('260819-live1'));

const indexKeys = [...db.keys()].filter((key) => key.startsWith('qiti:open-orders:') && !key.endsWith('_built'));
ok('الفهرس فيه سطر واحد برك مقابل 201 طلب في المخزن', indexKeys.length === 1, indexKeys.join(','));
ok('والقراءة ترجّع الطلب المفتوح وحدو', (await pendingIds()).join(',') === '260819-live1');

server.close();
