/*
 * تقرير آخر النهار — يتبعث أوتوماتيكياً كل يوم على 00:00 بتوقيت الجزائر.
 *
 * الـ cron تاع Netlify يخدم بـ UTC، والجزائر UTC+1 بلا توقيت صيفي، يعني
 * 23:00 UTC = 00:00 عندنا. علاش `0 23 * * *`.
 *
 * التقرير يغطّي **النهار اللي كمل**: كي يجي 00:00، النهار تبدّل من ثواني،
 * فنحسبو التاريخ من ساعة لور (23:00 تاع البارح) باش نجيبو النهار الصح.
 *
 * تقدر تشغّلو باليد للتجريب:
 *   curl "https://<موقعك>.netlify.app/.netlify/functions/daily-report?key=<SECRET>"
 */
import { listOrdersForDay, algiersDate } from '../lib/store.mjs';
import { dz, esc } from '../lib/message.mjs';

export const config = { schedule: '0 23 * * *' };

const TELEGRAM_TIMEOUT_MS = 10_000;

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not configured');

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(`Telegram ${response.status}: ${result.description ?? 'unknown error'}`);
  }
}

export function buildReport(day, orders) {
  const accepted = orders.filter((o) => o.status === 'accepted');
  const denied = orders.filter((o) => o.status === 'denied');
  const pending = orders.filter((o) => o.status === 'pending');

  const revenue = accepted.reduce((sum, o) => sum + (o.total ?? 0), 0);
  const units = accepted.reduce((sum, o) => sum + (o.qty ?? 0), 0);

  const lines = [
    `<b>📊 تقرير ${day}</b>`,
    '',
    `📥 الطلبات: <b>${orders.length}</b>`,
    `✅ مقبولة: <b>${accepted.length}</b>${units ? ` (${units} طوق)` : ''}`,
    `❌ مرفوضة: <b>${denied.length}</b>`,
  ];

  if (pending.length) lines.push(`⏳ ما زال بلا قرار: <b>${pending.length}</b>`);

  lines.push('', `💰 مداخيل الطلبات المقبولة: <b>${dz(revenue)}</b>`);

  if (denied.length) {
    lines.push('', '<b>أسباب الرفض:</b>');
    for (const order of denied) {
      lines.push(`• ${esc(order.name)} — ${esc(order.reason || 'بلا سبب')}`);
    }
  }

  if (pending.length) {
    lines.push('', '<b>طلبات تستنّى قرار:</b>');
    for (const order of pending) {
      lines.push(`• ${esc(order.name)} — ${esc(order.wilaya)} — ${dz(order.total ?? 0)}`);
    }
  }

  if (!orders.length) {
    return [`<b>📊 تقرير ${day}</b>`, '', 'ما كان حتى طلب اليوم.'].join('\n');
  }

  return lines.join('\n');
}

export default async function handler(request) {
  /*
   * كي يشغّلو الـ cron ما كاينش request عادي. كي تشغّلو انت باليد عبر URL،
   * نطلبو المفتاح باش حتى واحد ما يقدر يستهلك التقرير كيما يحب.
   */
  const url = request?.url ? new URL(request.url) : null;
  const manualKey = url?.searchParams.get('key');
  if (manualKey !== null) {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret || manualKey !== secret) return new Response('Forbidden', { status: 403 });
  }

  /* ساعة لور = ما زلنا في النهار اللي كمل، حتى لو تشغّل على 00:00 بالضبط */
  const dayJustEnded = algiersDate(new Date(Date.now() - 60 * 60 * 1000));

  try {
    const orders = await listOrdersForDay(dayJustEnded);
    const report = buildReport(dayJustEnded, orders);
    await sendTelegram(report);
    console.log(`Daily report sent for ${dayJustEnded}: ${orders.length} orders`);
    return new Response(JSON.stringify({ ok: true, day: dayJustEnded, orders: orders.length }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    console.error('Daily report failed:', error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
