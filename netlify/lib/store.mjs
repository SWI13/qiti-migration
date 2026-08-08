/*
 * تخزين الطلبات في Netlify Blobs — بلا قاعدة بيانات وبلا حساب برّاني.
 * هذا الملف مشترك بين الفنكشنز (برّا فولدر functions باش ما يتحسبش فنكشن).
 */
import { getStore } from '@netlify/blobs';

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
const DEFAULT_COSTS = { productCost: 1500, adsCost: 300, returnLoss: 700, updatedAt: null };

const orders = () => getStore(ORDERS);
const replies = () => getStore(REPLIES);
const stockStore = () => getStore(STOCK);
const costsStore = () => getStore(COSTS);

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

/** كل الطلبات عبر كل الأيام — أساس لكل استعلام "عبر الأرشيف كامل" (/state، تقرير آخر النهار). */
async function listAllOrders() {
  const { blobs } = await orders().list();
  const records = await Promise.all(blobs.map((blob) => orders().get(blob.key, { type: 'json' })));
  return records.filter(Boolean);
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

/* ── تكاليف الربح (سوما البضاعة، الإعلانات، خسارة الرجعة) ──────────── */

export async function getCosts() {
  const record = await costsStore().get(COSTS_KEY, { type: 'json' });
  return record ?? DEFAULT_COSTS;
}

/** field يكون 'productCost' ولا 'adsCost' ولا 'returnLoss' */
export async function setCost(field, value) {
  const current = await getCosts();
  const updated = { ...current, [field]: value, updatedAt: new Date().toISOString() };
  await costsStore().setJSON(COSTS_KEY, updated);
  return updated;
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
