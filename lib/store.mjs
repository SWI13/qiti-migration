/*
 * تخزين الطلبات في Netlify Blobs — بلا قاعدة بيانات وبلا حساب برّاني.
 * هذا الملف مشترك بين الفنكشنز (برّا فولدر functions باش ما يتحسبش فنكشن).
 */
import { randomUUID } from 'node:crypto';
import { getStore } from './blobs.mjs';
import {
  getVariantStock, adjustVariantStock, markVariantLowStockAlerted, SIMPLE_SKU,
} from './catalog.mjs';
import { orderStockRefs as refsFromLines } from './offers.mjs';

const ORDERS = 'orders';
/* ربط رسالة "علاش رفضتو؟" بالطلب اللي تخصّها، باش نعرفو الجواب لمن يرجع */
const REPLIES = 'reply-prompts';
/* عدّاد المخزون — قيمة وحدة مخزّنة تحت مفتاح ثابت */
const STOCK = 'stock';
const STOCK_KEY = 'current';
const DEFAULT_STOCK_THRESHOLD = 10;
/* تكاليف الربح — قابلة للتعديل من /cost في تيليغرام، ماشي ثوابت في الكود */
const COSTS = 'costs';
const COSTS_KEY = 'current';
/* قائمة الحظر اليدوية — تكملة لفحص الثقة البرّاني، ماشي بديل عليه */
const BLOCKLIST = 'blocklist';
/* courierCost = 0 بالتلقائي: في الدفع عند الاستلام، الزبون هو اللي
   يخلّص التوصيل — ما يخرجش من هامش التاجر. اللي يخلّص التوصيل بروحو
   يبدّلها بـ /cost courier 350. */
const DEFAULT_COSTS = { productCost: 1500, adsCost: 300, returnLoss: 700, courierCost: 0, updatedAt: null };

const orders = () => getStore(ORDERS);
const replies = () => getStore(REPLIES);
const stockStore = () => getStore(STOCK);
const costsStore = () => getStore(COSTS);
const blocklistStore = () => getStore(BLOCKLIST);

/** id قصير: التاريخ + عشوائي. لازم يكون قصير على خاطر callback_data محدود بـ 64 بايت. */
export function newOrderId(now = new Date()) {
  const day = algiersDate(now).replace(/-/g, '').slice(2);   // 260808
  return `${day}-${Math.random().toString(36).slice(2, 7)}`;
}

/** التاريخ بتوقيت الجزائر بصيغة YYYY-MM-DD — الأساس اللي يتبنى عليه تقرير اليوم. */
export function algiersDate(date = new Date()) {
  /* en-CA يعطي YYYY-MM-DD مباشرة */
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export async function saveOrder(record) {
  await orders().setJSON(record.id, record);
  await syncOpenIndex(record);
  return record;
}

export async function getOrder(id) {
  return orders().get(id, { type: 'json' });
}

export async function updateOrder(id, patch) {
  const existing = await getOrder(id);
  if (!existing) return null;
  const merged = { ...existing, ...patch };
  await orders().setJSON(id, merged);
  await syncOpenIndex(merged);
  return merged;
}

export async function listOrdersForDay(day) {
  const { blobs } = await orders().list();
  /* الـ id يبدا بتاريخ اليوم (260808-xxxxx) فنصفّيو قبل ما نقراو كل واحد */
  const prefix = day.replace(/-/g, '').slice(2);
  const todays = blobs.filter((blob) => blob.key.startsWith(`${prefix}-`));

  const records = await Promise.all(todays.map((blob) => orders().get(blob.key, { type: 'json' })));
  return records.filter(Boolean);
}

/** طلبات بين يومين (شاملين). نفس منطق مفتاح YYMMDD-xxxxx تاع listOrdersForDay،
    بصح بمدى بدل يوم وحدو — أرخص من نداء listOrdersForDay لكل يوم في المدى. */
export async function listOrdersInRange(startDay, endDay) {
  const { blobs } = await orders().list();
  const startPrefix = startDay.replace(/-/g, '').slice(2); // YYMMDD
  const endPrefix = endDay.replace(/-/g, '').slice(2);
  const inRange = blobs.filter((blob) => {
    const keyPrefix = blob.key.slice(0, 6);
    return keyPrefix >= startPrefix && keyPrefix <= endPrefix;
  });
  const records = await Promise.all(inRange.map((blob) => orders().get(blob.key, { type: 'json' })));
  return records.filter(Boolean);
}

/** كل الطلبات عبر كل الأيام — أساس لكل استعلام "عبر الأرشيف كامل" (/state، تقرير آخر النهار). */
async function listAllOrders() {
  const { blobs } = await orders().list();
  const records = await Promise.all(blobs.map((blob) => orders().get(blob.key, { type: 'json' })));
  return records.filter(Boolean);
}

/** نفس listAllOrders، مرتّبة الأحدث أوّلاً — أساس صفحة Orders في اللوحة. */
export async function listOrders() {
  const all = await listAllOrders();
  return all.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

/* ── فهرس الطلبات بلا قرار ────────────────────────────────────────
 *
 * ⚠️ علاش كاين: "الطلبات اللي تستنّى قرار" كانت تتحسب بمسح الأرشيف
 * كامل — تقرا كل طلب صرا في تاريخ المحل باش تلقى العشرة اللي مازال
 * ما تقرّروش. كان يخدم كي كان /state يتنادى مرّة في النهار. صفّ
 * المكالمات يتنادى على كل نقرة، وعلى مايتين طلب في النهار يولّي
 * المسح عشرات الآلاف من القراءات في كل مرّة تنقر فيها "ما جاوبش".
 *
 * دروك كاين فهرس صغير: مفاتيح الطلبات المفتوحة برك. القراءة تولّي
 * بقدّ الشغل اللي راه قدّامك، ماشي بقدّ التاريخ كامل.
 *
 * ⚠️ الفهرس يتحدّث في saveOrder/updateOrder روحهم، ماشي عند اللي
 * ينادي عليهم. أي مسار جديد (تيليغرام، اللوحة، سكريبت) يجي مضبوط
 * وحدو — والفهرس اللي يعتمد على "ما تنساش تنادي عليّا" ينسى.
 */
const OPEN_INDEX = 'open-orders';
const openIndex = () => getStore(OPEN_INDEX);
/* علامة "الفهرس مبني" — تسكن في نفس المخزن، وتتصفّى من المفاتيح
   على خاطر id الطلب عمرو ما يبدا بـ _ */
const OPEN_BUILT_KEY = '_built';

async function syncOpenIndex(record) {
  if (!record?.id) return;
  try {
    if (record.status === 'pending') await openIndex().set(record.id, '1');
    else await openIndex().delete(record.id);
  } catch (error) {
    /* الفهرس تسريع، ماشي حقيقة — فشلو ما يقدرش يطيّح تسجيل طلب.
       listPendingOrders تصلّح روحها من الطلبات اللي تقراهم. */
    console.error('Open-order index sync failed:', error.message, '| order:', record.id);
  }
}

/**
 * يعاود يبني الفهرس من الأرشيف كامل. يتنادى مرّة كي يكون ناقص (أوّل
 * قراءة بعد النشر، ولا بعد /clear)، ومرّة في النهار من تقرير آخر
 * النهار — باش أي انحراف يتصلّح وحدو في أقلّ من 24 ساعة بدل ما
 * يعيش للأبد.
 */
export async function rebuildOpenIndex() {
  const pending = (await listAllOrders()).filter((order) => order.status === 'pending');
  const index = openIndex();
  const { blobs } = await index.list();
  const wanted = new Set(pending.map((order) => order.id));

  await Promise.all(blobs
    .filter((blob) => blob.key !== OPEN_BUILT_KEY && !wanted.has(blob.key))
    .map((blob) => index.delete(blob.key)));
  await Promise.all(pending.map((order) => index.set(order.id, '1')));
  await index.set(OPEN_BUILT_KEY, new Date().toISOString());

  return pending;
}

/**
 * طلبات لسّا بلا قرار قبول/رفض، مهما كان يوم وصولها.
 *
 * الطلب اللي في الفهرس وتقرّر خلاص (انحراف نادر: كتابة طاحت في النص)
 * يتصفّى هنا ويخرج من الفهرس — القراءة تصلّح اللي تلقاه.
 */
export async function listPendingOrders() {
  const index = openIndex();
  const built = await index.get(OPEN_BUILT_KEY).catch(() => null);
  if (!built) return rebuildOpenIndex();

  const { blobs } = await index.list();
  const ids = blobs.map((blob) => blob.key).filter((key) => key !== OPEN_BUILT_KEY);
  const records = await Promise.all(ids.map((id) => getOrder(id)));

  const pending = [];
  const stale = [];
  records.forEach((order, position) => {
    if (order?.status === 'pending') pending.push(order);
    else stale.push(ids[position]);
  });

  await Promise.all(stale.map((id) => index.delete(id)))
    .catch((error) => console.error('Open-order index cleanup failed:', error.message));

  return pending;
}

/**
 * طلبات مقبولة ما زال بلا نتيجة توصيل (لا "توصّل" لا "رجعت")، مهما كان
 * يوم إنشاءهم — التوصيل يقدر يتأخّر يومين ولا ثلاثة، فما نحبّوش نضيّعوهم
 * وراء أرشيف الأيام.
 */
export async function listAwaitingDelivery() {
  const all = await listAllOrders();
  return all.filter((order) => order.status === 'accepted' && !order.deliveryStatus);
}

/**
 * طلبات "رجعت" مع المُوصّل بصح لسّا ما وصلاتش فيزيائياً للمحل — المخزون
 * ما يتزادش حتى تتأكّد بـ "استلمت الرجعة"، باش المخزون المكتوب يبقى مطابق
 * للي عندك بين يديك فعلاً.
 */
export async function listAwaitingReturnReceipt() {
  const all = await listAllOrders();
  return all.filter((order) => order.status === 'accepted' && order.deliveryStatus === 'returned' && !order.returnReceivedAt);
}

/**
 * كل الطلبات السابقة بنفس رقم الهاتف — أساس لتنبيه "زبون عندو تاريخ" كي
 * يجي طلب جديد بنفس الرقم (رفض ولا رجعة قبل هذا).
 */
export async function listOrdersByPhone(phone) {
  const all = await listAllOrders();
  return all.filter((order) => order.phone === phone);
}

/* ── المخزون ──────────────────────────────────────────────────────── */

export async function getStock() {
  const record = await stockStore().get(STOCK_KEY, { type: 'json' });
  return record ?? { qty: 0, threshold: DEFAULT_STOCK_THRESHOLD, lowStockAlerted: false, updatedAt: null };
}

/**
 * يبدّل الكمية بـ delta (سلبي عند القبول، إيجابي عند الرجوع/التزويد).
 * كي الكمية تطلع فوق الحد، ينسى تنبيه المخزون القليل تلقائياً باش يعاود
 * يبان إذا رجعت تهبط.
 */
export async function adjustStock(delta) {
  const current = await getStock();
  const qty = Math.max(0, current.qty + delta);
  const lowStockAlerted = qty > current.threshold ? false : current.lowStockAlerted;
  const updated = { ...current, qty, lowStockAlerted, updatedAt: new Date().toISOString() };
  await stockStore().setJSON(STOCK_KEY, updated);
  return updated;
}

export async function setStock(qty, threshold) {
  const current = await getStock();
  const updated = {
    ...current,
    qty: Math.max(0, qty),
    threshold: threshold ?? current.threshold,
    lowStockAlerted: false,
    updatedAt: new Date().toISOString(),
  };
  await stockStore().setJSON(STOCK_KEY, updated);
  return updated;
}

export async function markLowStockAlerted(value) {
  const current = await getStock();
  await stockStore().setJSON(STOCK_KEY, { ...current, lowStockAlerted: value });
}

/** يمسح الكمية كاملة — يرجع لصفر (وحد التنبيه الافتراضي) في next getStock() */
export async function resetStock() {
  await stockStore().delete(STOCK_KEY);
}

/* ── المخزون حسب الطلب ────────────────────────────────────────────
 *
 * عدّاد واحد للمحل كامل كان يخدم كي كان منتج واحد. بزوج منتجات يولّي
 * غالط بالسكات: تقبل طلبية هودي وتنقص من عدّاد الطوق، وتزوّد الطوق
 * فيبان الهودي متوفّر.
 *
 * دروك كل فاريانت عندو عدّادو. الطلبات القديمة (والصفحة الحالية) ما
 * فيهمش productId، فيبقاو على العدّاد القديم — بلا هجرة وبلا خطر على
 * اللي راهو خدّام.
 */

/** يرجع مرجع المخزون تاع الطلب، ولا null إذا الطلب قديم (بلا منتج) */
export const orderStockRef = (order) =>
  (order?.productId ? { productId: order.productId, sku: order.variant?.sku ?? SIMPLE_SKU } : null);

/*
 * الطلب ولّى يقدر يحمل أكثر من سلعة: منتج + باقة (فيها عناصر) + عرض
 * إضافي. المراجع تتبنى في offers.mjs، فنفس الحساب يخدم للطلب الجديد
 * وللقديم اللي فيه منتج واحد.
 */
export const stockRefsForOrder = (order) => refsFromLines(order);

/*
 * الطلب الجاي من index.html ما فيهش productId — والمخزون تاعو كان
 * في العدّاد العام. الهجرة (lib/legacy-stock.mjs) حوّلت الكمية لمنتج
 * "Qiti Collar" وصفّرت العدّاد، فالقراية من العدّاد ولّات ترجع 0
 * والقبول يترفض بـ "المتبقّي 0" والكمية موجودة في اللوحة.
 *
 * فالمراجع تتحلّ هنا: بلا productId، نقلّبو على منتج الطوق ونستعملو
 * مخزونو. ما لقيناهش (الهجرة ما صراتش) نرجعو للعدّاد القديم كيما كان.
 *
 * ⚠️ الاستيراد داخل الفنكشن بقصد: legacy-stock.mjs يستورد من هنا،
 * والاستيراد الساكن يدير حلقة.
 */
async function resolvedStockRefs(order) {
  const refs = stockRefsForOrder(order);
  if (refs.length) return refs;

  const { legacyProductId } = await import('./legacy-stock.mjs');
  const productId = await legacyProductId().catch(() => null);
  if (!productId) return [];

  return [{ productId, sku: SIMPLE_SKU, qty: order?.qty ?? 1 }];
}

/**
 * واش المخزون يكفي كل عنصر في الطلب. `shortages` فارغة = يقدر يتقبّل.
 * الطلب القديم بلا منتج يرجع للعدّاد العام كيما كان.
 */
export async function stockCheckForOrder(order) {
  const refs = await resolvedStockRefs(order);

  if (!refs.length) {
    const stock = await getStock();
    const needed = order?.qty ?? 1;
    const row = { productId: null, sku: null, needed, qty: stock.qty };
    return { rows: [row], shortages: stock.qty < needed ? [row] : [] };
  }

  const rows = await Promise.all(refs.map(async (ref) => {
    const stock = await getVariantStock(ref.productId, ref.sku);
    return { ...ref, needed: ref.qty, qty: stock?.qty ?? 0 };
  }));

  return { rows, shortages: rows.filter((row) => row.qty < row.needed) };
}

export async function getStockForOrder(order) {
  const [ref] = await resolvedStockRefs(order);
  return ref ? getVariantStock(ref.productId, ref.sku) : getStock();
}

/*
 * `delta` هنا هو الاتجاه لكل وحدة: سالب كي نقبلو الطلب، موجب كي ترجع
 * السلعة لليد. الكمية الحقيقية تجي من السطور — باقة فيها منتج ×2 تنقّص
 * زوج، ماشي وحدة.
 */
export async function adjustStockForOrder(order, delta) {
  const refs = await resolvedStockRefs(order);
  const sign = delta < 0 ? -1 : 1;

  /* العدّاد العام القديم: الكمية تجي من الطلب روحو، ماشي من delta */
  if (!refs.length) return adjustStock(sign * (order?.qty ?? 1));

  const rows = [];
  for (const ref of refs) {
    rows.push(await adjustVariantStock(ref.productId, ref.sku, sign * ref.qty));
  }

  /* الجالب القديم كان يستنّى صفّ واحد — نرجّعو صفّ أوّل عنصر باش تنبيه
     المخزون القليل يبقى يخدم كيما كان. */
  return rows[0] ?? null;
}

export async function markLowStockAlertedForOrder(order, value) {
  const [ref] = await resolvedStockRefs(order);
  return ref ? markVariantLowStockAlerted(ref.productId, ref.sku, value) : markLowStockAlerted(value);
}

/* ── /clear — يمسح كل شيء (خطر، بلا تراجع) ──────────────────────── */

/** يمسح كل الطلبات من التخزين — يرجع عدد الطلبات اللي تمسحو */
export async function clearAllOrders() {
  const { blobs } = await orders().list();
  await Promise.all(blobs.map((blob) => orders().delete(blob.key)));

  /* الفهرس يمشي معاهم — فهرس يشير لطلبات ما بقاوش يخلّي الصفّ يوري
     سطور فارغة حتى تجي أوّل قراءة تنظّف */
  const index = openIndex();
  const stale = await index.list();
  await Promise.all(stale.blobs.map((blob) => index.delete(blob.key)));

  return blobs.length;
}

/** طلبات الرد على سبب الرفض ما بقاتش يلزمها بعد ما الطلبات راحو */
export async function clearAllReplyPrompts() {
  const { blobs } = await replies().list();
  await Promise.all(blobs.map((blob) => replies().delete(blob.key)));
}

/* ── تكاليف الربح (سوما البضاعة، الإعلانات، خسارة الرجعة) ──────────── */

export async function getCosts() {
  const record = await costsStore().get(COSTS_KEY, { type: 'json' });
  return record ?? DEFAULT_COSTS;
}

/** field يكون 'productCost' ولا 'adsCost' ولا 'returnLoss' ولا 'courierCost' */
export async function setCost(field, value) {
  const current = await getCosts();
  const updated = { ...current, [field]: value, updatedAt: new Date().toISOString() };
  await costsStore().setJSON(COSTS_KEY, updated);
  return updated;
}

/* ── قائمة الحظر اليدوية ──────────────────────────────────────────
 *
 * علاش نحتاجوها حتى مع فحص الثقة البرّاني:
 *  1. الفحص يغلط أحياناً — لازم طريقة تحكم بيها انت في الأخير.
 *  2. زبون نصب عليك انت وما زال ماشي معروف عند الخدمة.
 *  3. إذا الخدمة طاحت ولا حبستي الاشتراك، تبقى عندك قائمتك.
 */

/**
 * توحيد الرقم: `+213661445566` / `213661445566` / `0661445566` كلهم
 * يولّيو `0661445566`. بلا هذا، نفس الزبون يتخزّن بزوج مفاتيح مختلفة
 * والحظر ما يخدمش. يرجع null إذا الرقم ماشي صحيح.
 */
export function normalizeDzPhone(input) {
  let digits = String(input ?? '').replace(/\D/g, '');
  if (digits.startsWith('213')) digits = digits.slice(3);
  if (!digits.startsWith('0')) digits = `0${digits}`;
  return /^0[5-7]\d{8}$/.test(digits) ? digits : null;
}

/** يرجع تفاصيل الحظر إذا الرقم محظور، ولا null */
export async function getBlockEntry(phone) {
  const key = normalizeDzPhone(phone);
  if (!key) return null;
  return blocklistStore().get(key, { type: 'json' });
}

export async function blockPhone(phone, { reason, addedBy } = {}) {
  const key = normalizeDzPhone(phone);
  if (!key) return null;
  const entry = {
    phone: key,
    reason: reason ? String(reason).slice(0, 200) : null,
    addedBy: addedBy ?? null,
    addedAt: new Date().toISOString(),
  };
  await blocklistStore().setJSON(key, entry);
  return entry;
}

export async function unblockPhone(phone) {
  const key = normalizeDzPhone(phone);
  if (!key) return false;
  const existing = await blocklistStore().get(key, { type: 'json' });
  if (!existing) return false;
  await blocklistStore().delete(key);
  return true;
}

export async function listBlocked() {
  const { blobs } = await blocklistStore().list();
  const entries = await Promise.all(blobs.map((blob) => blocklistStore().get(blob.key, { type: 'json' })));
  return entries.filter(Boolean);
}

/* ── ربط رسالة طلب السبب بالطلب ─────────────────────────────────── */

export async function rememberReplyPrompt(chatId, messageId, orderId) {
  await replies().set(`${chatId}:${messageId}`, orderId);
}

export async function resolveReplyPrompt(chatId, messageId) {
  return replies().get(`${chatId}:${messageId}`);
}

export async function forgetReplyPrompt(chatId, messageId) {
  await replies().delete(`${chatId}:${messageId}`);
}

/* ── مسودّات المنتجات (قراءة رسالة عادية في تيليغرام) ──────────────────
 *
 * كي البوت يفهم "عندي 9 طوق تتبّع، زيدو" لازم يوري للتاجر واش فهم قبل
 * ما يكتب حتى حاجة — والزر يحتاج يعرف المسودّة كي تتنقر.
 *
 * ⚠️ callback_data تاع تيليغرام محدود بـ 64 بايت — اسم منتج بالعربية
 * وحدو يفوتو. علاش المسودّة تتخزّن هنا والزر يحمل الـ id برك.
 */
const DRAFTS = 'product-drafts';
const drafts = () => getStore(DRAFTS);

export async function saveProductDraft(draft) {
  const id = randomUUID().slice(0, 8);
  await drafts().setJSON(id, { ...draft, createdAt: new Date().toISOString() });
  return id;
}

export const getProductDraft = (id) => drafts().get(id, { type: 'json' });

export async function forgetProductDraft(id) {
  await drafts().delete(id);
}
