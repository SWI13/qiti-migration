/*
 * هجرة الطوق + الأرقام التسلسلية — الفحوصات.
 *
 * منطق تخزين خالص، فيتفحص على مخزن حقيقي (Redis مزيّف في نفس العملية،
 * نفس الطريقة تاع verify-open-index). اللي يهمّ هنا:
 *
 *   • الكمية اللي في العدّاد العام ما تضيعش — تمشي للمنتج.
 *   • الهجرة تصرا مرّة وحدة، والنداء الثاني ما يعاودش يحوّل.
 *   • الرقم التسلسلي يتعطى مرّة وحدة ويبقى — حفظ المنتج ما يبدّلوش.
 *   • حفظ المنتج ما يمسحش المخزون (هذا كان عطب حقيقي: onlyIfNew
 *     ما كانتش تتطبّق، فكل حفظ يرجّع الكمية لصفر).
 */
import { createServer } from 'node:http';

const ok = (label, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);

/* ── Redis مزيّف ──────────────────────────────────────────────────── */

const db = new Map();
const hashes = new Map();

function run(command) {
  const [name, ...args] = command;
  const op = String(name).toUpperCase();

  if (op === 'SET') {
    const nx = args.slice(2).some((arg) => String(arg).toUpperCase() === 'NX');
    if (nx && db.has(args[0])) return null;
    db.set(args[0], args[1]);
    return 'OK';
  }
  if (op === 'GET') return db.has(args[0]) ? db.get(args[0]) : null;
  if (op === 'DEL') return db.delete(args[0]) ? 1 : 0;
  if (op === 'HINCRBY') {
    const hash = hashes.get(args[0]) ?? new Map();
    const next = (Number(hash.get(args[1])) || 0) + Number(args[2]);
    hash.set(args[1], next);
    hashes.set(args[0], hash);
    return next;
  }
  if (op === 'HGET') return hashes.get(args[0])?.get(args[1]) ?? null;
  if (op === 'SCAN') {
    const matchAt = args.findIndex((arg) => String(arg).toUpperCase() === 'MATCH');
    const prefix = (matchAt >= 0 ? String(args[matchAt + 1]) : '*').replace(/\*$/, '');
    return ['0', [...db.keys()].filter((key) => key.startsWith(prefix))];
  }
  throw new Error(`fake redis: unsupported command ${op}`);
}

const server = createServer((request, response) => {
  let body = '';
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    const parsed = body ? JSON.parse(body) : [];
    const isPipeline = request.url.includes('pipeline') || Array.isArray(parsed[0]);
    const result = isPipeline ? parsed.map((command) => ({ result: run(command) })) : { result: run(parsed) };
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(result));
  });
});

await new Promise((resolve) => server.listen(0, resolve));
process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${server.address().port}`;
process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

const lib = (path) => import(new URL(`../../lib/${path}`, import.meta.url).href);
const { setStock, getStock } = await lib('store.mjs');
const {
  saveProduct, getProduct, listProducts, getVariantStock, setVariantStock, SIMPLE_SKU,
} = await lib('catalog.mjs');
const { ensureLegacyProduct, legacyProduct, legacyProductId, LEGACY_NAME } = await lib('legacy-stock.mjs');
const { stockTargets } = await lib('stock-view.mjs');
const { PRODUCT_PRICE } = await lib('message.mjs');

console.log('══ 1. الرقم التسلسلي ══');
const first = await saveProduct({ name: 'Toji Outfit', slug: 'toji-outfit', price: 5500 });
const second = await saveProduct({ name: 'Cat Bowl', slug: 'cat-bowl', price: 1200 });
ok('أوّل منتج ياخذ #1', first.serial === 1, String(first.serial));
ok('الثاني ياخذ #2', second.serial === 2, String(second.serial));

const renamed = await saveProduct({ id: first.id, name: 'AAA Outfit' });
ok('الحفظ ما يبدّلش الرقم', renamed.serial === 1, String(renamed.serial));
ok('حتى لو بدّلت الاسم لحرف يجي قبل', renamed.name === 'AAA Outfit');

console.log('\n══ 2. حفظ المنتج ما يمسحش المخزون ══');
/*
 * العطب اللي كان: seedVariantStock تكتب بـ onlyIfNew، وطبقة التخزين
 * كانت تتجاهلها — فكل حفظ يبذر الصفّ من جديد بـ qty 0. تعمّر 40 في
 * تيليغرام، تبدّل السومة في اللوحة، ويولّي المخزون صفر بلا ما يبان.
 */
await setVariantStock(second.id, SIMPLE_SKU, 40);
await saveProduct({ id: second.id, price: 1300 });
const kept = await getVariantStock(second.id, SIMPLE_SKU);
ok('الكمية تبقى بعد حفظ المنتج', kept.qty === 40, String(kept.qty));

console.log('\n══ 3. هجرة الطوق ══');
await setStock(14, 5);
ok('العدّاد العام فيه 14 قبل الهجرة', (await getStock()).qty === 14);

const migration = await ensureLegacyProduct();
ok('صنعت منتج الطوق', migration.product?.name === LEGACY_NAME, String(migration.product?.name));
ok('وقالت بلي الهجرة صرات', migration.migrated === true);
ok('حوّلت 14', migration.movedQty === 14, String(migration.movedQty));

const collarStock = await getVariantStock(migration.product.id, SIMPLE_SKU);
ok('الكمية ولّات في مخزون المنتج', collarStock.qty === 14, String(collarStock.qty));
ok('وحدّ التنبيه جا معاها', collarStock.threshold === 5, String(collarStock.threshold));
ok('والعدّاد العام رجع صفر', (await getStock()).qty === 0);
ok('السومة هي سومة الصفحة الستاتيك', migration.product.price === PRODUCT_PRICE, String(migration.product.price));
/* الصفحة اللي تبيع الطوق راهي index.html — منتج active معناه صفحة
   ثانية تبيع نفس السلعة في /p/qiti-collar */
ok('المنتج مسودّة، ما يصنعش صفحة ثانية', migration.product.status === 'draft');
ok('وياخذ رقم تسلسلي كيف الباقي', Number(migration.product.serial) > 0, String(migration.product.serial));

console.log('\n══ 4. الهجرة تصرا مرّة وحدة ══');
await setStock(7, 5);
const again = await ensureLegacyProduct();
ok('النداء الثاني ما يعاودش يحوّل', again.migrated === false && again.movedQty === 0);
ok('ويرجّع نفس المنتج', again.product.id === migration.product.id);
ok('والكمية ما تتزادش مرّتين', (await getVariantStock(migration.product.id, SIMPLE_SKU)).qty === 14);
ok('legacyProduct() ترجّع نفس الواحد', (await legacyProduct())?.id === migration.product.id);
ok('legacyProductId() تعرفو', (await legacyProductId()) === migration.product.id);

console.log('\n══ 5. أرقام /stock و /restock ══');
const targets = await stockTargets();
const collarTarget = targets.find((target) => target.productId === migration.product.id);
ok('الطوق عندو سطر في /stock', Boolean(collarTarget));
ok('ورقمو هو رقمو التسلسلي', collarTarget.index === String(migration.product.serial), collarTarget.index);
ok('كل سطر عندو رقم', targets.every((target) => target.index));

/* منتج بفاريانتات: الرقم يتفرّع 2.1, 2.2 — والرقم الأصلي يبقى ثابت */
const sized = await saveProduct({
  name: 'Sized Hoodie', slug: 'sized-hoodie', price: 4000,
  options: [{ name: 'المقاس', values: ['M', 'L'] }],
});
const sizedTargets = (await stockTargets()).filter((target) => target.productId === sized.id);
ok('الفاريانتات تاخذ أرقام فرعية',
  sizedTargets.length === 2
  && sizedTargets[0].index === `${sized.serial}.1`
  && sizedTargets[1].index === `${sized.serial}.2`,
  sizedTargets.map((target) => target.index).join(','));

console.log('\n══ 6. تبنّي منتج موجود بدل ما نصنعو ثاني ══');
/* محل صنع "Qiti Collar" بيدو قبل الهجرة — نتبنّاوه، وإلا يولّيو زوج
   منتجات بنفس الاسم وزوج مخزونات وواحد منهم غالط ديما */
db.delete('qiti:catalog-meta:legacy-product');
const before = (await listProducts()).length;
const adopted = await ensureLegacyProduct();
ok('ما صنعناش منتج ثاني', (await listProducts()).length === before, String(before));
ok('وتبنّينا نفس الواحد', adopted.product.id === migration.product.id);

server.close();
