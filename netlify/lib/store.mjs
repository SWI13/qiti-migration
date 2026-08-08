/*
 * تخزين الطلبات في Netlify Blobs — بلا قاعدة بيانات وبلا حساب برّاني.
 * هذا الملف مشترك بين الفنكشنز (برّا فولدر functions باش ما يتحسبش فنكشن).
 */
import { getStore } from '@netlify/blobs';

const ORDERS = 'orders';
/* ربط رسالة "علاش رفضتو؟" بالطلب اللي تخصّها، باش نعرفو الجواب لمن يرجع */
const REPLIES = 'reply-prompts';

const orders = () => getStore(ORDERS);
const replies = () => getStore(REPLIES);

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
