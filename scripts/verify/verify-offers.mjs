/*
 * فحص الباقات والعرض الإضافي.
 *
 * التركيز على اللي يخسّر فلوس إذا طاح: كمية المخزون تاع كل عنصر،
 * تكلفة السلعة في الربح، والطلبات القديمة اللي لازم تبقى تتقرا كيما
 * كانت بلا هجرة.
 */
import { pathToFileURL } from 'node:url';

const lib = (p) => import(new URL(`../../lib/${p}`, import.meta.url).href);

const offers = await lib('offers.mjs');
const { ownerMessage, profitFor, costSnapshotOf, goodsTotal } = await lib('message.mjs');
const { renderSections } = await lib('render/index.mjs');

let failures = 0;
const ok = (label, pass, extra = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
  if (!pass) failures++;
};

/* ── معطيات ──────────────────────────────────────────────────────────── */

const tracker = {
  id: 'p_tracker', name: 'Cat Tracker', price: 2500, unitCost: 1200,
  options: [], variants: [{ sku: 'default', options: {}, priceDelta: 0 }],
};
const kase = {
  id: 'p_case', name: 'Case', price: 1000, unitCost: 400,
  options: [], variants: [{ sku: 'default', options: {}, priceDelta: 0 }],
};
const offerProducts = { p_tracker: tracker, p_case: kase };

const campaign = {
  id: 'cmp_1', slug: 'tracker', productId: 'p_tracker',
  sections: [{ type: 'order', enabled: true, order: 1, data: {} }],
  bundles: {
    enabled: true,
    items: [{
      id: 'bnd_1', name: 'Protection Bundle', price: 4500, active: true, order: 1,
      items: [{ productId: 'p_tracker', sku: 'default', qty: 2 }, { productId: 'p_case', sku: 'default', qty: 1 }],
    }],
  },
  upsell: { enabled: true, productId: 'p_case', sku: 'default', title: 'Extra Case', price: 1000, trigger: 'after-order' },
};

const bundleOrder = {
  id: 'QT-1', name: 'Ahmed', phone: '0555112233', wilaya: 'البليدة', commune: 'أولاد يعيش',
  shipping: 'home', shippingFee: 600, qty: 1, total: 5500, status: 'pending',
  productId: null, campaignId: 'cmp_1', upsellOffered: true,
  lines: [{
    kind: 'bundle', bundleId: 'bnd_1', name: 'Protection Bundle', qty: 1,
    unitPrice: 4500, lineTotal: 4500,
    items: [
      { productId: 'p_tracker', sku: 'default', name: 'Cat Tracker', qty: 2 },
      { productId: 'p_case', sku: 'default', name: 'Case', qty: 1 },
    ],
  }],
};

/* طلب قديم: بلا lines، كيما اللي في التخزين دروك */
const legacyOrder = {
  id: 'QT-0', name: 'Sara', phone: '0555998877', wilaya: 'الجزائر', commune: 'باب الزوار',
  shipping: 'home', shippingFee: 600, qty: 2, total: 5600, unitPrice: 2500,
  productId: 'p_tracker', variant: { sku: 'default', options: {} }, status: 'pending',
};

/* ── 1. التطبيع ──────────────────────────────────────────────────────── */
console.log('══ normalize ══');

const empty = offers.normalizeBundles(undefined, undefined);
ok('حملة قديمة بلا باقات = معطّلة ولائحة فارغة', empty.enabled === false && empty.items.length === 0);

const noItems = offers.normalizeBundles({ enabled: true, items: [{ name: 'X', price: 900, items: [] }] });
ok('باقة بلا عناصر تتحيّد', noItems.items.length === 0 && noItems.enabled === false);

const noPrice = offers.normalizeBundles({ enabled: true, items: [{ name: 'X', items: [{ ref: 'p_case:default', qty: 1 }] }] });
ok('باقة بلا سومة تتحيّد', noPrice.items.length === 0);

const good = offers.normalizeBundles({
  enabled: true,
  items: [{ name: 'Pack', price: 3000, items: [{ ref: 'p_case:default', qty: '3' }] }],
});
ok('الكمية تتحوّل لرقم', good.items[0].items[0].qty === 3, String(good.items[0].items[0].qty));
ok('id يتولّد وحدو', typeof good.items[0].id === 'string' && good.items[0].id.startsWith('bnd_'));

const upsellOff = offers.normalizeUpsell({ enabled: true, ref: '', price: 500 });
ok('عرض بلا منتج ما يتفعّلش', upsellOff.enabled === false);

const upsellOn = offers.normalizeUpsell({ enabled: true, ref: 'p_case:default', price: '1000', trigger: 'nope' });
ok('trigger غالط يرجع للافتراضي', upsellOn.trigger === 'after-order' && upsellOn.enabled === true);

/* ── 2. السطور والمخزون ──────────────────────────────────────────────── */
console.log('\n══ lines & stock ══');

const legacyLines = offers.orderLines(legacyOrder);
ok('طلب قديم يعطي سطر منتج واحد', legacyLines.length === 1 && legacyLines[0].kind === 'product' && legacyLines[0].qty === 2);

const legacyRefs = offers.orderStockRefs(legacyOrder);
ok('مخزون الطلب القديم = المنتج × الكمية',
  legacyRefs.length === 1 && legacyRefs[0].productId === 'p_tracker' && legacyRefs[0].qty === 2,
  JSON.stringify(legacyRefs));

const bundleRefs = offers.orderStockRefs(bundleOrder);
const trackerRef = bundleRefs.find((r) => r.productId === 'p_tracker');
const caseRef = bundleRefs.find((r) => r.productId === 'p_case');
ok('باقة ×1: الطوق -2 والغطاء -1', trackerRef?.qty === 2 && caseRef?.qty === 1, JSON.stringify(bundleRefs));

const twoBundles = offers.orderStockRefs({ ...bundleOrder, lines: [{ ...bundleOrder.lines[0], qty: 3 }] });
ok('باقة ×3 تضاعف كل عنصر',
  twoBundles.find((r) => r.productId === 'p_tracker').qty === 6
  && twoBundles.find((r) => r.productId === 'p_case').qty === 3);

const withUpsell = {
  ...bundleOrder,
  lines: [...bundleOrder.lines, { kind: 'upsell', productId: 'p_case', sku: 'default', name: 'Extra Case', qty: 1, unitPrice: 1000, lineTotal: 1000 }],
};
const mergedRefs = offers.orderStockRefs(withUpsell);
ok('العرض الإضافي يتجمّع مع نفس الفاريانت بدل ما يتكرّر',
  mergedRefs.length === 2 && mergedRefs.find((r) => r.productId === 'p_case').qty === 2,
  JSON.stringify(mergedRefs));

/* ── 3. الفلوس ───────────────────────────────────────────────────────── */
console.log('\n══ money ══');

const costs = { productCost: 1500, adsCost: 300, returnLoss: 700, courierCost: 0 };
const unitCostOf = (id) => ({ p_tracker: 1200, p_case: 400 }[id] ?? null);

const upsellTotal = 4500 + 1000 + 600;
const delivered = {
  ...withUpsell, total: upsellTotal, status: 'accepted', deliveryStatus: 'delivered',
};
delivered.costSnapshot = costSnapshotOf(costs, null, { order: delivered, unitCostOf });

ok('سومة التوصيل ما تدخلش في المداخيل', goodsTotal(delivered) === 5500, String(goodsTotal(delivered)));
ok('تكلفة السلعة = عناصر الباقة + العرض الإضافي',
  delivered.costSnapshot.goodsCost === 1200 * 2 + 400 + 400, String(delivered.costSnapshot.goodsCost));
ok('الربح = السلعة − التكلفة − الإعلانات',
  profitFor(delivered, costs) === 5500 - 3200 - 300, String(profitFor(delivered, costs)));

const returned = { ...delivered, deliveryStatus: 'returned' };
ok('الرجعة = خسارة returnLoss برك', profitFor(returned, costs) === -700, String(profitFor(returned, costs)));

const pendingOrder = { ...delivered, status: 'pending', deliveryStatus: null };
ok('طلب مازال ما تقرّرش = 0', profitFor(pendingOrder, costs) === 0);

/* الطلب القديم لازم يعطي نفس الرقم اللي كان يعطيه قبل الباقات */
const legacyDelivered = {
  ...legacyOrder, status: 'accepted', deliveryStatus: 'delivered',
  costSnapshot: { unitCost: 1200, adsCost: 300, courierCost: 0, returnLoss: 700 },
};
ok('طلب قديم بلقطة قديمة: نفس الحساب بالضبط',
  profitFor(legacyDelivered, costs) === 5000 - 2400 - 300, String(profitFor(legacyDelivered, costs)));

const savings = offers.bundleSavings(campaign.bundles.items[0], (item) =>
  ({ p_tracker: 2500, p_case: 1000 }[item.productId]));
ok('الربح المعلن = مجموع العناصر − سومة الباقة', savings.save === 6000 - 4500, JSON.stringify(savings));

/* ── 4. رسالة تيليغرام ───────────────────────────────────────────────── */
console.log('\n══ telegram ══');

const message = ownerMessage(withUpsell);
ok('الباقة تبان في الرسالة', message.includes('Protection Bundle'));
ok('عناصر الباقة تتفصّل بكمياتها', message.includes('Cat Tracker ×2') && message.includes('Case ×1'));
ok('العرض الإضافي يبان', message.includes('عرض إضافي') && message.includes('Extra Case'));

const legacyMessage = ownerMessage(legacyOrder);
ok('طلب عادي: بلا بلوك باقة وبلا عرض',
  !legacyMessage.includes('📦 <b>') && !legacyMessage.includes('عرض إضافي'));

/* ── 5. العرض في الصفحة ──────────────────────────────────────────────── */
console.log('\n══ renderer ══');

const html = renderSections(campaign, tracker, { offerProducts });
ok('مختارات العروض تبان', html.includes('class="offers"'));
ok('اسم الباقة يبان', html.includes('Protection Bundle'));
ok('الربح يبان في البلاطة', html.includes('ربحت'));
ok('بلوك العرض الإضافي موجود ومخبّي', html.includes('id="upsellOffer"') && html.includes('hidden'));
ok('سوم الباقات تمشي للمتصفّح', html.includes('"bundles":[{"id":"bnd_1","price":4500}]'));

const plainCampaign = { id: 'cmp_2', sections: campaign.sections };
const plainHtml = renderSections(plainCampaign, tracker, {});
ok('حملة بلا عروض: الفورم كيما كان',
  !plainHtml.includes('class="offers"') && !plainHtml.includes('upsellOffer'));
ok('حملة بلا عروض: bundles فارغة في JSON', plainHtml.includes('"bundles":[]'));

/* باقة عنصرها خلص تبان معمية */
const soldOutHtml = renderSections(campaign, tracker, {
  offerProducts,
  stock: [{ sku: 'default', stock: { qty: 0, threshold: 5 } }],
});
ok('الباقة تتعمى كي يخلص المخزون',
  soldOutHtml.includes('offer--off') && soldOutHtml.includes('خلص المخزون'));


/* الطلب القديم بلا منتج: الاتجاه لازم يتضاعف بالكمية، ماشي وحدة */
const veryOld = { qty: 3, productId: null, variant: null };
ok('طلب قديم بلا منتج: بلا مراجع مخزون، يرجع للعدّاد العام',
  offers.orderStockRefs(veryOld).length === 0);
/* ── 6. اللوحة ───────────────────────────────────────────────────────── */
console.log('\n══ admin ══');

const admin = (p) => import(new URL(`../../admin/js/${p}`, import.meta.url).href);
const { BUNDLE_FIELDS, UPSELL_FIELDS } = await admin('section-fields.js');
const { fieldHtml } = await admin('ui/field-html.js');
const { state } = await admin('state.js');

ok('وصفة الباقة فيها السومة والعناصر',
  BUNDLE_FIELDS.some((f) => f.key === 'price') && BUNDLE_FIELDS.some((f) => f.key === 'items'));
ok('وصفة العرض الإضافي فيها المنتج والسومة والتوقيت',
  ['ref', 'price', 'trigger'].every((key) => UPSELL_FIELDS.some((f) => f.key === key)));

state.products = [
  { id: 'p_tracker', name: 'Cat Tracker', variants: [{ sku: 'default', options: {} }] },
  { id: 'p_tee', name: 'Tee', variants: [{ sku: '0', options: { size: 'M' } }, { sku: '1', options: { size: 'L' } }] },
];
const itemField = fieldHtml({ key: 'ref', label: 'Product', type: 'item' }, 'p_tee:1', 'bundles.items.0.ref');
ok('قائمة المنتج تعرض كل فاريانت', itemField.includes('value="p_tee:0"') && itemField.includes('Tee — L'));
ok('المختار يبقى مختار', /value="p_tee:1" selected/.test(itemField));

const parsed = offers.parseItemRef('p_tee:1');
ok('المرجع يتقرا لمنتج وفاريانت', parsed.productId === 'p_tee' && parsed.sku === '1');
console.log(`\n${failures ? `${failures} فحص طاح` : 'كل الفحوصات نجحت ✅'}`);
if (failures) process.exit(1);
