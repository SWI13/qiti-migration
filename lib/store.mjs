/*
 * تخزين الطلبات في Netlify Blobs — بلا قاعدة بيانات وبلا حساب برّاني.
 * هذا الملف مشترك بين الفنكشنز (برّا فولدر functions باش ما يتحسبش فنكشن).
 */
import { randomUUID } from 'node:crypto';
import { getStore } from './blobs.mjs';
import {
  getVariantStock, adjustVariantStock, markVariantLowStockAlerted, SIMPLE_SKU,
} from './catalog.mjs';

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

/** طلبات لسّا بلا قرار قبول/رفض، مهما كان يوم وصولها. */
export async function listPendingOrders() {
  const all = await listAllOrders();
  return all.filter((order) => order.status === 'pending');
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

export async function getStockForOrder(order) {
  const ref = orderStockRef(order);
  return ref ? getVariantStock(ref.productId, ref.sku) : getStock();
}

export async function adjustStockForOrder(order, delta) {
  const ref = orderStockRef(order);
  return ref ? adjustVariantStock(ref.productId, ref.sku, delta) : adjustStock(delta);
}

export async function markLowStockAlertedForOrder(order, value) {
  const ref = orderStockRef(order);
  return ref ? markVariantLowStockAlerted(ref.productId, ref.sku, value) : markLowStockAlerted(value);
}

/* ── /clear — يمسح كل شيء (خطر، بلا تراجع) ──────────────────────── */

/** يمسح كل الطلبات من التخزين — يرجع عدد الطلبات اللي تمسحو */
export async function clearAllOrders() {
  const { blobs } = await orders().list();
  await Promise.all(blobs.map((blob) => orders().delete(blob.key)));
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
