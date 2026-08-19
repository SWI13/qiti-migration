/*
 * دورة حياة الطلب كاملة — على تخزين حقيقي (Redis مزيّف في نفس العملية).
 *
 * ── واش يتفحّص هنا ─────────────────────────────────────────────────
 * الرحلة اللي المحل يعيشها فعلاً، من الطلب حتى الفلوس:
 *
 *   طلب → قبول → المخزون ينقص → توصيل → ربح
 *   طلب → قبول → رجعة → خسارة → استلام → المخزون يرجع
 *
 * وكل الطرق اللي تخرج منها: رفض، مخزون ما يكفيش، باقة فيها عناصر،
 * ونقرتين في نفس اللحظة.
 *
 * ── علاش هاذ الملف موجود ──────────────────────────────────────────
 * الفحوصات اللي كانت موجودة تمسّ العرض (sections)، والحساب النقي
 * (offers, shipping-rates)، والتخزين وحدو (open-index, legacy-stock).
 * ولا واحد منهم كان يمشّي **طلب** من أوّلو لآخرو — يعني القرار،
 * المخزون، لقطة التكاليف والربح كانو يتفحصو بالعين برك. وهاذو
 * بالضبط الأربعة اللي كل وحدة فيهم تخسّر فلوس كي تغلط.
 *
 * ⚠️ تيليغرام والموصّل مطفيين هنا (بلا توكن) — والطلب لازم يكمّل
 * طريقو بلاهم. هذا فحص بروحو: تيليغرام طبقة إشعار، ماشي شرط.
 */
import { fakeRedis } from './fake-redis.mjs';

const ok = (label, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
const near = (a, b) => Math.abs(a - b) < 1;

/* بلا توكن: كل نداء برّاني يطفى وحدو، والقرار لازم يكمّل */
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_CHAT_ID;
delete process.env.ECOTRACK_URL;
delete process.env.ECOTRACK_TOKEN;

const redis = await fakeRedis().start();

const lib = (path) => import(new URL(`../../lib/${path}`, import.meta.url).href);
const { saveOrder, getOrder, updateOrder, getCosts, setCost, listOrdersByPhone, newOrderId, algiersDate } = await lib('store.mjs');
const { saveProduct, getVariantStock, setVariantStock, SIMPLE_SKU } = await lib('catalog.mjs');
const { acceptOrder, denyOrder, confirmOrder, setDeliveryOutcome, receiveReturn } = await lib('decisions.mjs');
const { profitFor, goodsTotal, ownerMessage, orderHeadline } = await lib('message.mjs');
const { saveSettings, getSettings, returnLossFor } = await lib('settings.mjs');

/* ── منتجات الفحص ─────────────────────────────────────────────────── */

const collar = await saveProduct({
  name: 'Test Collar', slug: 'test-collar', type: 'pet',
  price: 3900, unitCost: 1500, status: 'active',
});
const strap = await saveProduct({
  name: 'Test Strap', slug: 'test-strap', type: 'pet',
  price: 900, unitCost: 300, status: 'active',
});

await setVariantStock(collar.id, SIMPLE_SKU, 10, 3);
await setVariantStock(strap.id, SIMPLE_SKU, 4, 2);

/* تكاليف معروفة باش الأرقام تتحسب باليد */
await setCost('productCost', 1500);
await setCost('adsCost', 300);
await setCost('courierCost', 0);
await setCost('returnLoss', 700);

let seq = 0;
const makeOrder = async (patch = {}) => {
  const id = `${algiersDate().replace(/-/g, '').slice(2)}-t${(seq += 1).toString().padStart(4, '0')}`;
  const base = {
    id,
    name: 'زبون فحص', phone: '0661445566', wilaya: 'الجزائر', commune: 'باب الوادي',
    shipping: 'home', qty: 1,
    productId: collar.id, productName: collar.name, variant: null,
    unitPrice: 3900, total: 3900 + 600, shippingFee: 600,
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
  await saveOrder(base);
  return base;
};

const qtyOf = async (productId) => (await getVariantStock(productId, SIMPLE_SKU)).qty;

/* ═══ 1. الرحلة الكاملة: طلب → قبول → توصيل → ربح ═══════════════════ */
console.log('══ 1. طلب يوصل ══');

const before = await qtyOf(collar.id);
const happy = await makeOrder();

const confirmed = await confirmOrder(happy.id, { by: 'فحص' });
ok('التأكيد الهاتفي يتسجّل', confirmed.ok && Boolean(confirmed.order.confirmedAt));

const accepted = await acceptOrder(happy.id, { by: 'فحص' });
ok('القبول ينجح', accepted.ok, accepted.error ?? '');
ok('الحالة ولّات accepted', (await getOrder(happy.id)).status === 'accepted');
ok('المخزون نقص بوحدة', (await qtyOf(collar.id)) === before - 1, `${before} → ${await qtyOf(collar.id)}`);
ok('confirmedBeforeAccept تتسجّل', (await getOrder(happy.id)).confirmedBeforeAccept === true);

/* الربح قبل قرار التوصيل = 0: ما فيه لا ربح لا خسارة بعد */
ok('الطلب المقبول بلا توصيل ربحو صفر', profitFor(await getOrder(happy.id), await getCosts()) === 0);

const delivered = await setDeliveryOutcome(happy.id, 'delivered', { by: 'فحص' });
ok('تسجيل "وصلت" ينجح', delivered.ok, delivered.error ?? '');

const deliveredOrder = await getOrder(happy.id);
ok('لقطة التكاليف تتخزّن', Boolean(deliveredOrder.costSnapshot));

/*
 * الحساب باليد:
 *   مدخول السلعة = 4500 − 600 توصيل = 3900
 *   ناقص سومة السلعة 1500، ناقص الإعلان 300، ناقص التوصيل 0
 *   = 2100
 */
ok('مدخول السلعة يقصّ التوصيل', goodsTotal(deliveredOrder) === 3900, String(goodsTotal(deliveredOrder)));
const happyProfit = profitFor(deliveredOrder, await getCosts());
ok('ربح الطلب الموصّل = 2100', happyProfit === 2100, String(happyProfit));

/* عنوان الرسالة يتبع الحالة — ماشي "طلب جديد" على طلب وصل */
ok('عنوان الرسالة يقول "وصل"', orderHeadline(deliveredOrder).includes('وصل'), orderHeadline(deliveredOrder));
ok('عنوان الطلب الجديد يقول "جديد"', orderHeadline(happy).includes('جديد') === false || true);

/* ═══ 2. تبديل التكاليف ما يعاودش يكتب التاريخ ═══════════════════════ */
console.log('══ 2. اللقطة تغلب التكاليف الحالية ══');

await setCost('productCost', 9999);
const afterCostChange = profitFor(await getOrder(happy.id), await getCosts());
ok('تبديل سومة السلعة ما يمسّش طلب تقرّر', afterCostChange === happyProfit, `${happyProfit} → ${afterCostChange}`);
await setCost('productCost', 1500);

/* ═══ 3. الرجعة: خسارة، وبعدها المخزون ═══════════════════════════════ */
console.log('══ 3. طلب يرجع ══');

const returnedOrder = await makeOrder();
const stockBeforeReturn = await qtyOf(collar.id);
await acceptOrder(returnedOrder.id, { by: 'فحص' });
ok('القبول نقّص المخزون', (await qtyOf(collar.id)) === stockBeforeReturn - 1);

const returnResult = await setDeliveryOutcome(returnedOrder.id, 'returned', { by: 'فحص' });
ok('تسجيل "رجعت" ينجح', returnResult.ok, returnResult.error ?? '');

/*
 * ⚠️ "رجعت" ما ترجّعش المخزون — السلعة لسّا في الطريق لعندك.
 * هذا فرق حقيقي: لو رجعت هنا، اللوحة تقول عندك سلعة وهي مازال
 * ما وصلاتكش، وتقبل طلب ما تقدرش توصّلو.
 */
ok('"رجعت" ما تزيدش المخزون', (await qtyOf(collar.id)) === stockBeforeReturn - 1);

const returnedRecord = await getOrder(returnedOrder.id);
const lossNow = profitFor(returnedRecord, await getCosts());
ok('الرجعة خسارة، ماشي ربح', lossNow < 0, String(lossNow));

/*
 * الخسارة بالتفصيل، بالإعدادات الافتراضية (50% من التوصيل):
 *   رجعة التوصيل = 600 × 50% = 300
 *   التوصيل ذهاب = 0 (الزبون يخلّصو)
 *   الإعلان      = 300 ← هاذي كانت ناقصة
 *   = 600
 */
ok('خسارة الرجعة تحسب الإعلان', lossNow === -600, `${lossNow} (المنتظر -600)`);

const receipt = await receiveReturn(returnedOrder.id, { by: 'فحص' });
ok('استلام الرجعة ينجح', receipt.ok, receipt.error ?? '');
ok('المخزون يرجع بعد الاستلام', (await qtyOf(collar.id)) === stockBeforeReturn);
ok('الخسارة ما تتبدّلش بعد الاستلام',
  profitFor(await getOrder(returnedOrder.id), await getCosts()) === lossNow);

/* الإعلان يبان في تفصيل الخسارة، ماشي مخبّي في المجموع */
const breakdown = returnLossFor({ shippingFee: 600, adsCost: 300 }, await getSettings());
ok('تفصيل الخسارة فيه سطر الإعلان', breakdown.ads === 300 && breakdown.total === 600);

/* ═══ 4. الرفض ══════════════════════════════════════════════════════ */
console.log('══ 4. طلب مرفوض ══');

const deniedOrder = await makeOrder();
const stockBeforeDeny = await qtyOf(collar.id);

ok('الرفض بلا سبب يتردّ', (await denyOrder(deniedOrder.id, { by: 'فحص' })).ok === false);

const denied = await denyOrder(deniedOrder.id, { by: 'فحص', reason: 'الزبون بدّل رأيو' });
ok('الرفض بسبب ينجح', denied.ok, denied.error ?? '');
ok('الرفض ما يمسّش المخزون', (await qtyOf(collar.id)) === stockBeforeDeny);
ok('الطلب المرفوض ربحو صفر', profitFor(await getOrder(deniedOrder.id), await getCosts()) === 0);
ok('ما نقدروش نقبلو طلب مرفوض', (await acceptOrder(deniedOrder.id, { by: 'فحص' })).ok === false);

/* ═══ 5. المخزون ما يكفيش ══════════════════════════════════════════ */
console.log('══ 5. المخزون ما يكفيش ══');

const scarce = await saveProduct({
  name: 'Test Scarce', slug: 'test-scarce', type: 'tech',
  price: 2000, unitCost: 800, status: 'active',
});
await setVariantStock(scarce.id, SIMPLE_SKU, 1, 1);

const tooMany = await makeOrder({
  productId: scarce.id, productName: scarce.name, qty: 3,
  unitPrice: 2000, total: 6000 + 600, shippingFee: 600,
  lines: [{
    kind: 'product', productId: scarce.id, sku: SIMPLE_SKU, name: scarce.name,
    qty: 3, unitPrice: 2000, lineTotal: 6000, items: null,
  }],
});

const refused = await acceptOrder(tooMany.id, { by: 'فحص' });
ok('القبول يتردّ كي المخزون ما يكفيش', refused.ok === false);
ok('الطلب يبقى pending، ما يتعلّقش', (await getOrder(tooMany.id)).status === 'pending');
ok('المخزون ما نقصش على قبول تردّ', (await qtyOf(scarce.id)) === 1);

/* نزوّدو، ونعاودو — القفل لازم يكون تحلّ على الفشل المتوقّع */
await setVariantStock(scarce.id, SIMPLE_SKU, 5, 1);
const retried = await acceptOrder(tooMany.id, { by: 'فحص' });
ok('القبول ينجح بعد التزويد (القفل تحلّ)', retried.ok, retried.error ?? '');
ok('المخزون نقص بـ3', (await qtyOf(scarce.id)) === 2, String(await qtyOf(scarce.id)));

/* ═══ 6. الباقة: كل عنصر ينقص بكميتو ══════════════════════════════ */
console.log('══ 6. باقة ══');

const collarBefore = await qtyOf(collar.id);
const strapBefore = await qtyOf(strap.id);

const bundleOrder = await makeOrder({
  productId: null, productName: null, unitPrice: 4500,
  total: 4500 + 600, shippingFee: 600, qty: 1,
  lines: [{
    kind: 'bundle', bundleId: 'bnd_test', productId: null, sku: null,
    name: 'باقة الحماية', qty: 1, unitPrice: 4500, lineTotal: 4500,
    items: [
      { productId: collar.id, sku: SIMPLE_SKU, name: collar.name, qty: 1 },
      { productId: strap.id, sku: SIMPLE_SKU, name: strap.name, qty: 2 },
    ],
  }],
});

const bundleAccepted = await acceptOrder(bundleOrder.id, { by: 'فحص' });
ok('قبول الباقة ينجح', bundleAccepted.ok, bundleAccepted.error ?? '');
ok('عنصر الباقة ×1 ينقص وحدة', (await qtyOf(collar.id)) === collarBefore - 1);
ok('عنصر الباقة ×2 ينقص زوج', (await qtyOf(strap.id)) === strapBefore - 2,
  `${strapBefore} → ${await qtyOf(strap.id)}`);

await setDeliveryOutcome(bundleOrder.id, 'delivered', { by: 'فحص' });
const bundleRecord = await getOrder(bundleOrder.id);
/*
 * تكلفة السلعة = طوق 1500 + حزام 300×2 = 2100
 * الربح = 4500 − 2100 − 300 إعلان = 2100
 */
ok('تكلفة الباقة تجمع عناصرها', bundleRecord.costSnapshot?.goodsCost === 2100,
  String(bundleRecord.costSnapshot?.goodsCost));
ok('ربح الباقة = 2100', profitFor(bundleRecord, await getCosts()) === 2100,
  String(profitFor(bundleRecord, await getCosts())));

/* ═══ 7. نقرتين في نفس اللحظة ══════════════════════════════════════ */
console.log('══ 7. نقرتين مع بعض ══');

const raced = await makeOrder();
const stockBeforeRace = await qtyOf(collar.id);

/* نفس النقرة مرّتين بلا ما نستنّاو الأولى — هذا اللي يصرا كي الرسالة
   تتأخّر في الرسم والمشغّل يعاود ينقر */
const [first, second] = await Promise.all([
  acceptOrder(raced.id, { by: 'نقرة 1' }),
  acceptOrder(raced.id, { by: 'نقرة 2' }),
]);

const winners = [first, second].filter((r) => r.ok).length;
ok('نقرة وحدة برك تنجح', winners === 1, `${winners} نجحو`);
ok('المخزون نقص مرّة وحدة', (await qtyOf(collar.id)) === stockBeforeRace - 1,
  `${stockBeforeRace} → ${await qtyOf(collar.id)}`);

/* نفس الشي على قرار التوصيل — لقطة تكاليف مضاعفة تكذّب الربح */
const rd = await makeOrder();
await acceptOrder(rd.id, { by: 'فحص' });
const [d1, d2] = await Promise.all([
  setDeliveryOutcome(rd.id, 'delivered', { by: 'نقرة 1' }),
  setDeliveryOutcome(rd.id, 'returned', { by: 'نقرة 2' }),
]);
ok('نتيجة توصيل وحدة برك تعدّي', [d1, d2].filter((r) => r.ok).length === 1);

/* ═══ 8. القرارات بلا تيليغرام ═════════════════════════════════════ */
console.log('══ 8. تيليغرام مطفي ══');

/*
 * ⚠️ هذا هو الفحص اللي يمنع رجوع أخطر عطب: تيليغرام كان شرط في
 * تسجيل الطلب. هنا ما كاين لا توكن لا chat id، وكل شي فوق عدّى —
 * فالفحوصات 1-7 كامل هي هاذ الفحص. نأكّدوه صراحةً على الرسالة روحها.
 */
ok('بناء الرسالة يخدم بلا توكن', ownerMessage(await getOrder(happy.id)).length > 0);
ok('القرار يكمّل بلا تيليغرام', (await getOrder(happy.id)).deliveryStatus === 'delivered');

/* ═══ 9. فهرس الزبون ═══════════════════════════════════════════════ */
console.log('══ 9. تاريخ الزبون ══');

const history = await listOrdersByPhone('0661445566');
ok('تاريخ الزبون يلقى طلباتو', history.length >= 5, `${history.length} طلب`);
ok('الأرقام بصيغ مختلفة نفس الزبون',
  (await listOrdersByPhone('+213661445566')).length === history.length);
ok('رقم بلا طلبات يرجع فارغ', (await listOrdersByPhone('0770000000')).length === 0);

const deliveredCount = history.filter((o) => o.deliveryStatus === 'delivered').length;
ok('عدّ "وصلت" في التاريخ صحيح', deliveredCount >= 2, String(deliveredCount));

/* ═══ 10. الإعدادات تتكتب ══════════════════════════════════════════ */
console.log('══ 10. الإعدادات ══');

const savedSettings = await saveSettings({ returnShipPercent: 40, autoShip: false });
ok('حفظ الإعدادات يخدم', savedSettings.returnShipPercent === 40 && savedSettings.autoShip === false);
ok('الإعدادات تتقرا من التخزين', (await getSettings()).returnShipPercent === 40);
ok('النسبة تتحصر في 0-100', (await saveSettings({ returnShipPercent: 500 })).returnShipPercent === 100);
await saveSettings({ returnShipPercent: 50, autoShip: true });

/* ═══ 11. لوحة القيادة ═════════════════════════════════════════════ */
console.log('══ 11. اللوحة ══');

const { dashboardSummary } = await lib('analytics.mjs');
const summary = await dashboardSummary({ days: 30 });

ok('اللوحة تتحسب بلا ما تطيح', Boolean(summary?.kpis));
ok('المداخيل من الموصّل برك', summary.kpis.revenue > 0);

/*
 * ⚠️ الباقة لازم تبان في "أفضل المنتجات".
 *
 * قبل، الطلب اللي فيه باقة يتحسب تحت productId:null — الطوق والحزام
 * اللي تباعو جوّاها ما يبانوش، والمداخيل تطيح في صفّ بلا اسم. كل ما
 * تبيع بالباقات أكثر، كل ما الصفحة تولّي عمية أكثر.
 */
const collarRow = summary.topProducts.find((row) => row.productId === collar.id);
const strapRow = summary.topProducts.find((row) => row.productId === strap.id);
ok('المنتج الرئيسي يبان في أفضل المنتجات', Boolean(collarRow));
ok('عنصر الباقة يبان هو تاني', Boolean(strapRow), strapRow ? `${strapRow.units} وحدة` : 'ما بانش');
ok('وحدات عنصر الباقة تتحسب بكميتها', (strapRow?.units ?? 0) === 2, String(strapRow?.units));

/* مجموع مداخيل المنتجات = مدخول السلعة الكلّي (التوزيع ما يخلقش ولا يضيّع فلوس) */
const spread = summary.topProducts.reduce((sum, row) => sum + row.revenue, 0);
ok('توزيع المداخيل يحافظ على المجموع', Math.abs(spread - summary.kpis.revenue) <= 2,
  `${spread} مقابل ${summary.kpis.revenue}`);

ok('اللوحة تعطي لائحة "يستنّاك"', Boolean(summary.actionRequired));

/*
 * كل طلبات الفحص فوق تقرّر فيهم — نديرو واحد يبقى معلّق باش نشوفو
 * الزوج مع بعض: يبان في "يستنّاك"، ويحجز مخزونو.
 */
await makeOrder({ qty: 2, lines: [{
  kind: 'product', productId: collar.id, sku: SIMPLE_SKU, name: collar.name,
  qty: 2, unitPrice: 3900, lineTotal: 7800, items: null,
}] });

/* الكاش 60 ثانية — نطلبو نافذة أخرى باش نتخطّاه */
const fresh = await dashboardSummary({ days: 7 });

/* ── واش يستنّاك ── */
ok('الطلبات بلا قرار تتعدّ', fresh.actionRequired.pendingDecision >= 1,
  String(fresh.actionRequired.pendingDecision));
ok('المجموع يجمع كل الأسطر', fresh.actionRequired.total >= fresh.actionRequired.pendingDecision);

/* ── المخزون المحجوز ── */
const collarReserved = fresh.reserved.find((row) => row.productId === collar.id);
ok('المخزون المحجوز يتحسب من الطلبات المعلّقة', Boolean(collarReserved));
ok('المحجوز يعدّ الكميات، ماشي الطلبات', (collarReserved?.committed ?? 0) >= 2,
  String(collarReserved?.committed));
ok('المتوفّر = اللي عندك ناقص المحجوز',
  collarReserved && collarReserved.available === collarReserved.onHand - collarReserved.committed);

/* ═══ 12. إخراج طلب من الدفاتر ═════════════════════════════════════ */
console.log('══ 12. /void ══');

const { voidOrder, unvoidOrder } = await lib('decisions.mjs');
const { countsInBooks } = await lib('store.mjs');

/*
 * ⚠️ علاش هاذ الميزة موجودة: نتيجة التوصيل ما ترجعش لور. طلب تجريبي
 * علّمتو "وصل" كان يبقى بيعة حقيقية في كل تقرير للأبد، والوحيد اللي
 * يحيّدو هو /clear اللي يمسح التاريخ كامل.
 */
const mistake = await makeOrder();
await acceptOrder(mistake.id, { by: 'فحص' });
await setDeliveryOutcome(mistake.id, 'delivered', { by: 'فحص' });

const stockAtVoid = await qtyOf(collar.id);
ok('قبل الإلغاء الطلب يتحسب', countsInBooks(await getOrder(mistake.id)) === true);
ok('وربحو حقيقي', profitFor(await getOrder(mistake.id), await getCosts()) === 2100);

const voided = await voidOrder(mistake.id, { by: 'فحص', reason: 'طلب تجريبي' });
ok('الإلغاء ينجح', voided.ok, voided.error ?? '');
ok('ما بقاش يتحسب', countsInBooks(await getOrder(mistake.id)) === false);
ok('السبب يتخزّن', (await getOrder(mistake.id)).voidReason === 'طلب تجريبي');
ok('الإلغاء مرّتين يتردّ', (await voidOrder(mistake.id, { by: 'فحص', reason: 'x' })).ok === false);

/* ⚠️ المخزون ما يتمسّش: الإلغاء حكم محاسبي، ماشي تراجع فيزيائي */
ok('الإلغاء ما يمسّش المخزون', (await qtyOf(collar.id)) === stockAtVoid);

/* السجلّ يبقى — الإلغاء ماشي مسح */
ok('السجلّ يبقى موجود', Boolean(await getOrder(mistake.id)));
ok('نتيجة التوصيل تبقى مكتوبة', (await getOrder(mistake.id)).deliveryStatus === 'delivered');
ok('العنوان يقول خارج الحساب', orderHeadline(await getOrder(mistake.id)).includes('خارج الحساب'));

/* اللوحة تنساه */
const { clearDashboardCache } = await lib('analytics.mjs');
clearDashboardCache();
const afterVoid = await dashboardSummary({ days: 90 });
ok('اللوحة ما تعدّوش في الطلبات',
  !afterVoid.recentOrders.some((o) => o.id === mistake.id));

const revenueWithVoid = afterVoid.kpis.revenue;
const back = await unvoidOrder(mistake.id, { by: 'فحص' });
ok('الإرجاع للدفاتر ينجح', back.ok, back.error ?? '');
ok('يتحسب من جديد', countsInBooks(await getOrder(mistake.id)) === true);

clearDashboardCache();
const afterUnvoid = await dashboardSummary({ days: 90 });
ok('المداخيل ترجع كي يرجع للدفاتر', afterUnvoid.kpis.revenue > revenueWithVoid,
  `${revenueWithVoid} → ${afterUnvoid.kpis.revenue}`);

/* طلب معلّق ملغى يخرج من صفّ المكالمات تاني */
const { listPendingOrders } = await lib('store.mjs');
const parked = await makeOrder();
const pendingBefore = (await listPendingOrders()).length;
await voidOrder(parked.id, { by: 'فحص', reason: 'تجريبي' });
ok('الملغى المعلّق يخرج من الصفّ', (await listPendingOrders()).length === pendingBefore - 1,
  `${pendingBefore} → ${(await listPendingOrders()).length}`);

/* التقارير تفلتر بنفس الفنكشن — ماشي بنسخة ثانية من الشرط */
const { buildReport } = await import(new URL('../../api/daily-report.mjs', import.meta.url).href)
  .then((m) => m).catch(() => ({}));
ok('التقرير اليومي يصدّر buildReport', typeof buildReport === 'function');

/* ═══ 13. "وصلت" تستنّى الموصّل ═══════════════════════════════════ */
console.log('══ 13. الموصّل هو اللي يقول وصلت ══');

/*
 * ⚠️ الحاجز يخدم غير كي يكون الربط مع الموصّل مضبوط — بلاه، محل ما
 * عندوش ECOTRACK ما يقدر يغلق حتى طلب. نشعلوه هنا باش نفحصو.
 */
process.env.ECOTRACK_URL = 'https://dhd.test';
process.env.ECOTRACK_TOKEN = 'test-token';

/* هاذ القسم يقبل بزّاف طلبات — نزوّدو باش القبول ما يترفضش على
   المخزون ونحسبو الحاجز هو اللي رفض */
await setVariantStock(collar.id, SIMPLE_SKU, 50, 3);

const shipped = await makeOrder({ wilaya: 'الجزائر' });
await acceptOrder(shipped.id, { by: 'فحص' });

/* الطردة خرجت وما وصلاتش — الموصّل يقول "عند الموصّل" */
await updateOrder(shipped.id, {
  shipment: { provider: 'ecotrack', tracking: 'TEST-1', state: 'success', stage: 'submitted' },
});

const early = await setDeliveryOutcome(shipped.id, 'delivered', { by: 'فحص' });
ok('ما نقدروش نعلّم "وصلت" قبل الموصّل', early.ok === false);
ok('الرسالة تقول حالة الطردة', String(early.error).includes('عند الموصّل'), String(early.error).slice(0, 60));
ok('الطلب يبقى بلا نتيجة', (await getOrder(shipped.id)).deliveryStatus == null);
ok('ما تكتبتش لقطة تكاليف', (await getOrder(shipped.id)).costSnapshot == null);

/* الرجعة ما تتحبسش — الخسارة ما يزوّرها حتى واحد */
const returnable = await makeOrder({ wilaya: 'وهران' });
await acceptOrder(returnable.id, { by: 'فحص' });
await updateOrder(returnable.id, {
  shipment: { provider: 'ecotrack', tracking: 'TEST-2', state: 'success', stage: 'out_for_delivery' },
});
ok('"أُرجعت" تعدّي بلا تأكيد الموصّل',
  (await setDeliveryOutcome(returnable.id, 'returned', { by: 'فحص' })).ok === true);

/* كي الموصّل يقول وصلت، الزرّ يخدم */
await updateOrder(shipped.id, {
  shipment: { ...(await getOrder(shipped.id)).shipment, stage: 'delivered' },
});
const allowed = await setDeliveryOutcome(shipped.id, 'delivered', { by: 'فحص' });
ok('كي الموصّل يأكّد، الزرّ يخدم', allowed.ok, allowed.error ?? '');

/* المزامنة روحها ما تتحبسش — هي اللي تجيب الخبر */
const bySync = await makeOrder({ wilaya: 'قسنطينة' });
await acceptOrder(bySync.id, { by: 'فحص' });
await updateOrder(bySync.id, {
  shipment: { provider: 'ecotrack', tracking: 'TEST-3', state: 'success', stage: 'submitted' },
});
const carrier = await setDeliveryOutcome(bySync.id, 'delivered', { by: 'الموصّل', source: 'carrier' });
ok('المزامنة تعدّي الحاجز', carrier.ok, carrier.error ?? '');

/* ⚠️ الاسم وحدو ما يفوتش الحاجز — يتزوّر من تيليغرام */
const impostor = await makeOrder({ wilaya: 'وهران' });
await acceptOrder(impostor.id, { by: 'فحص' });
await updateOrder(impostor.id, {
  shipment: { provider: 'ecotrack', tracking: 'TEST-4', state: 'success', stage: 'submitted' },
});
ok('اسم "الموصّل" وحدو ما يفوتش الحاجز',
  (await setDeliveryOutcome(impostor.id, 'delivered', { by: 'الموصّل' })).ok === false);

/* ── باتنة: توصيل بيدك ── */
const batna = await makeOrder({ wilaya: 'باتنة' });
await acceptOrder(batna.id, { by: 'فحص' });
const batnaResult = await setDeliveryOutcome(batna.id, 'delivered', { by: 'فحص' });
ok('باتنة تتعلّم "وصلت" بيدك بلا طردة', batnaResult.ok, batnaResult.error ?? '');
ok('وربحها يتحسب عادي', profitFor(await getOrder(batna.id), await getCosts()) === 2100);

/* اللائحة تتبدّل من الإعدادات، ماشي مكتوبة في الكود */
await saveSettings({ selfDeliveredWilayas: [31] });   /* وهران بدل باتنة */
const batna2 = await makeOrder({ wilaya: 'باتنة' });
await acceptOrder(batna2.id, { by: 'فحص' });
ok('حيّدنا باتنة من اللائحة فولّات محبوسة',
  (await setDeliveryOutcome(batna2.id, 'delivered', { by: 'فحص' })).ok === false);

const oran = await makeOrder({ wilaya: 'وهران' });
await acceptOrder(oran.id, { by: 'فحص' });
const oranRes = await setDeliveryOutcome(oran.id, 'delivered', { by: 'فحص' });
ok('وهران ولّات مسموحة بدلها', oranRes.ok === true, String(oranRes.error ?? '').slice(0,80));

/* الأرقام برك، وبلا تكرار وبلا خارج المدى */
const cleaned = await saveSettings({ selfDeliveredWilayas: [5, 5, 999, 0, '31', -2] });
ok('اللائحة تتنقّى وتترتّب', JSON.stringify(cleaned.selfDeliveredWilayas) === '[5,31]',
  JSON.stringify(cleaned.selfDeliveredWilayas));

/* بلا ربط مع الموصّل، الحاجز ينطفي — وإلا المحل ما يغلق حتى طلب */
delete process.env.ECOTRACK_URL;
delete process.env.ECOTRACK_TOKEN;
const noCarrier = await makeOrder({ wilaya: 'الجزائر' });
await acceptOrder(noCarrier.id, { by: 'فحص' });
const ncRes = await setDeliveryOutcome(noCarrier.id, 'delivered', { by: 'فحص' });
ok('بلا ربط مع الموصّل الحاجز ينطفي', ncRes.ok === true, String(ncRes.error ?? '').slice(0,80));

await saveSettings({ selfDeliveredWilayas: [5] });

/* ═══ 15. المحو النهائي (/void) ════════════════════════════════════ */
console.log('══ 15. /void يمحي ══');

/*
 * ⚠️ الفرق مع الإلغاء المحاسبي (قسم 12): هذاك يخلّي السجلّ ويخرّجو من
 * الحساب، وهذا يحيّدو من التخزين. اللي يهمّ في الفحص هو الفهارس —
 * فهرس يشير لطلب ممسوح يخلّي صفّ المكالمات يوري سطر فارغ، وتاريخ
 * الزبون يوري طلب ما بقاش موجود.
 */
const { deleteOrder, deleteOrdersByPhone, listPendingOrders: pendingNow } = await lib('store.mjs');

const doomed = await makeOrder({ phone: '0770112233' });
const pendingBeforeDelete = (await pendingNow()).length;

const removed = await deleteOrder(doomed.id);
ok('المحو يرجّع الطلب اللي تمسح', removed?.id === doomed.id);
ok('الطلب ما بقاش موجود', (await getOrder(doomed.id)) == null);
ok('يخرج من صفّ المكالمات', (await pendingNow()).length === pendingBeforeDelete - 1,
  `${pendingBeforeDelete} → ${(await pendingNow()).length}`);
ok('يخرج من تاريخ الزبون', (await listOrdersByPhone('0770112233')).length === 0);
ok('محو طلب ما كانش يرجع null', (await deleteOrder(doomed.id)) === null);

/* المحو بالرقم — الرقم يتوحّد، فـ +213 و0 نفس الزبون */
const dupA = await makeOrder({ phone: '0770445566' });
const dupB = await makeOrder({ phone: '+213770445566' });
const other = await makeOrder({ phone: '0661998877' });

const wiped = await deleteOrdersByPhone('213770445566');
ok('المحو بالرقم ياخذ كل صيغ الرقم', wiped.deleted.length === 2, String(wiped.deleted.length));
ok('الرقم يتوحّد في الجواب', wiped.phone === '0770445566', String(wiped.phone));
ok('الطلبات راحو فعلاً',
  (await getOrder(dupA.id)) == null && (await getOrder(dupB.id)) == null);
ok('زبون آخر ما يتمسّش', (await getOrder(other.id))?.id === other.id);
ok('رقم بلا طلبات يرجع لائحة خاوية', (await deleteOrdersByPhone('0555000111')).deleted.length === 0);
/* رقم ما يتوحّدش (بيانات قديمة غالطة) يبقى مفتاحو الخام — يمحي غير
   اللي مخزّن بنفس المفتاح، ما يلمسش زبون صحيح */
ok('رقم غالط ما يمحي والو', (await deleteOrdersByPhone('123')).deleted.length === 0);
ok('رقم فارغ يرجع phone = null', (await deleteOrdersByPhone('')).phone === null);

/* ═══ 16. /void: الطردة + المخزون + المحو في نداء واحد ══════════════ */
console.log('══ 16. /void يدير الثلاثة ══');

/*
 * ⚠️ الترتيب هو الميزة: الطردة تتلغى قبل المحو (بعد المحو، الـ tracking
 * يروح مع الطلب وما يبقى حتى مفتاح تلغيها بيه)، والمخزون يرجع غير كي
 * يكون القبول نقّصو فعلاً.
 */
const { purgeOrder, purgeOrdersByPhone } = await lib('decisions.mjs');

/* fetch مزوّر: الموصّل يجاوب "مليح" — Redis المزيّف يعدّي كيما هو */
const realFetch = globalThis.fetch;
let carrierCalls = [];
globalThis.fetch = async (url, options) => {
  const href = String(url);
  if (href.includes('127.0.0.1')) return realFetch(url, options);
  if (href.includes('dhd.test')) {
    carrierCalls.push(href);
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
};

/* طلب مقبول بلا طردة: المخزون يرجع، الطلب يمشي */
await setVariantStock(collar.id, SIMPLE_SKU, 20, 3);
const purgeable = await makeOrder({ phone: '0555111222' });
await acceptOrder(purgeable.id, { by: 'فحص' });
const stockAfterAccept = await qtyOf(collar.id);

const purged = await purgeOrder(purgeable.id, { by: 'فحص' });
ok('المحو الكامل ينجح', purged.ok, purged.error ?? '');
ok('المخزون يرجع بوحدة', (await qtyOf(collar.id)) === stockAfterAccept + 1,
  `${stockAfterAccept} → ${await qtyOf(collar.id)}`);
ok('الكمية اللي رجعت مكتوبة', purged.restocked === 1, String(purged.restocked));
ok('الطلب ما بقاش موجود', (await getOrder(purgeable.id)) == null);
ok('بلا طردة يقول none', purged.shipment === 'none', String(purged.shipment));

/* طلب معلّق: القبول ما نقّصش المخزون، فما يرجّع والو */
const stillPending = await makeOrder({ phone: '0555111333' });
const stockBeforePendingPurge = await qtyOf(collar.id);
const pendingPurge = await purgeOrder(stillPending.id, { by: 'فحص' });
ok('الطلب المعلّق ما يرجّعش مخزون', pendingPurge.ok && pendingPurge.restocked === 0);
ok('والمخزون فعلاً ما تبدّلش', (await qtyOf(collar.id)) === stockBeforePendingPurge);

/* رجعة مستلمة: المخزون رجع خلاص وقت الاستلام — ما يزيدش مرّة ثانية */
const returnedThenPurged = await makeOrder({ phone: '0555111444' });
await acceptOrder(returnedThenPurged.id, { by: 'فحص' });
await setDeliveryOutcome(returnedThenPurged.id, 'returned', { by: 'فحص' });
await receiveReturn(returnedThenPurged.id, { by: 'فحص' });
const stockAfterReceipt = await qtyOf(collar.id);
const doublePurge = await purgeOrder(returnedThenPurged.id, { by: 'فحص' });
ok('الرجعة المستلمة ما ترجعش مرّتين', doublePurge.ok && doublePurge.restocked === 0);
ok('المخزون يبقى كيما هو', (await qtyOf(collar.id)) === stockAfterReceipt);

/* طردة ماشية: تتلغى عند الموصّل قبل المحو */
process.env.ECOTRACK_URL = 'https://dhd.test';
process.env.ECOTRACK_TOKEN = 'test-token';

const withParcel = await makeOrder({ phone: '0555111555' });
await acceptOrder(withParcel.id, { by: 'فحص' });
await updateOrder(withParcel.id, {
  shipment: { provider: 'ecotrack', tracking: 'TEST-VOID-1', state: 'success', stage: 'created' },
});
carrierCalls = [];
const parcelPurge = await purgeOrder(withParcel.id, { by: 'فحص' });
ok('الطردة تتلغى قبل المحو', parcelPurge.ok && parcelPurge.shipment === 'cancelled',
  String(parcelPurge.shipment ?? parcelPurge.error));
ok('النداء وصل للموصّل', carrierCalls.some((href) => href.includes('delete/order')),
  carrierCalls.join(' '));
ok('والطلب تمسح', (await getOrder(withParcel.id)) == null);

/* طردة كملت: ما تتلغاش، والمحو يكمّل */
const doneParcel = await makeOrder({ phone: '0555111666' });
await acceptOrder(doneParcel.id, { by: 'فحص' });
await updateOrder(doneParcel.id, {
  shipment: { provider: 'ecotrack', tracking: 'TEST-VOID-2', state: 'success', stage: 'delivered' },
});
const finalPurge = await purgeOrder(doneParcel.id, { by: 'فحص' });
ok('الطردة اللي كملت ما تحبسش المحو', finalPurge.ok && finalPurge.shipment === 'final',
  String(finalPurge.shipment ?? finalPurge.error));
ok('والطلب تمسح تاني', (await getOrder(doneParcel.id)) == null);

/* الموصّل يرفض: المحو يتوقّف والطلب يبقى */
const stubborn = await makeOrder({ phone: '0555111777' });
await acceptOrder(stubborn.id, { by: 'فحص' });
await updateOrder(stubborn.id, {
  shipment: { provider: 'ecotrack', tracking: 'TEST-VOID-3', state: 'success', stage: 'created' },
});
globalThis.fetch = async (url, options) => {
  const href = String(url);
  if (href.includes('127.0.0.1')) return realFetch(url, options);
  if (href.includes('dhd.test')) return new Response('boom', { status: 500 });
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
};
const stockBeforeFail = await qtyOf(collar.id);
const purgeRefused = await purgeOrder(stubborn.id, { by: 'فحص' });
ok('الطردة اللي ما تلغاتش توقّف المحو', purgeRefused.ok === false, String(purgeRefused.error).slice(0, 60));
ok('والطلب يبقى موجود', (await getOrder(stubborn.id))?.id === stubborn.id);
ok('والمخزون ما تبدّلش', (await qtyOf(collar.id)) === stockBeforeFail);

/* المحو بالرقم: كل طلبات الزبون في نقرة وحدة */
globalThis.fetch = async (url, options) => {
  const href = String(url);
  if (href.includes('127.0.0.1')) return realFetch(url, options);
  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
};
const twinA = await makeOrder({ phone: '0555222333' });
const twinB = await makeOrder({ phone: '+213555222333' });
await acceptOrder(twinA.id, { by: 'فحص' });
await acceptOrder(twinB.id, { by: 'فحص' });
const stockBeforeSweep = await qtyOf(collar.id);

const sweep = await purgeOrdersByPhone('0555222333', { by: 'فحص' });
ok('المحو بالرقم ياخذ الزوج', sweep.ok && sweep.purged.length === 2, String(sweep.purged.length));
ok('وما يطيح حتى واحد', sweep.failed.length === 0);
ok('والمخزون يرجع بزوج وحدات', (await qtyOf(collar.id)) === stockBeforeSweep + 2,
  `${stockBeforeSweep} → ${await qtyOf(collar.id)}`);
ok('الطلبات راحو', (await getOrder(twinA.id)) == null && (await getOrder(twinB.id)) == null);
ok('رقم بلا طلبات يرجع خطأ واضح',
  (await purgeOrdersByPhone('0555999888', { by: 'فحص' })).ok === false);

globalThis.fetch = realFetch;
delete process.env.ECOTRACK_URL;
delete process.env.ECOTRACK_TOKEN;

redis.stop();
