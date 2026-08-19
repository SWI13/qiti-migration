/*
 * نداء تيليغرام — نسخة وحدة يستعملوها الكلّ.
 *
 * ⚠️ علاش انفصل: نفس الفنكشن كان مكتوب ثلاث مرّات (الويبهوك، leads،
 * وأي بلاصة جديدة تحتاجو). كي القرار (قبول/رفض/توصيل) خرج من الويبهوك
 * لـ decisions.mjs باش اللوحة تقدر تقرّر تاني، ولّى لازم نسخة وحدة —
 * وإلا رسالة الطلب تتعاود ترسم بشكل مختلف حسب البلاصة اللي نقرت فيها.
 *
 * ── environment variables ────────────────────────────────────────────
 *   TELEGRAM_BOT_TOKEN — توكن البوت
 *   TELEGRAM_CHAT_ID   — الشات تاعك (الگروب ولا الخاص)، وجهة كل إشعار
 */
import { ownerMessage, buttonsFor } from './message.mjs';

const TIMEOUT_MS = 10_000;

/** واش البوت مركّب أصلاً — بلا توكن كل نداء يطيح، فالنداءات الاختيارية تسأل قبل */
export const telegramConfigured = () =>
  Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

/** الشات الافتراضي — كل إشعار يخرج منّا كي ما تكونش نقرة جايّة من شات معيّن */
export const ownerChatId = () => process.env.TELEGRAM_CHAT_ID ?? null;

export async function telegram(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(`Telegram ${method} ${response.status}: ${result.description ?? 'unknown error'}`);
  }
  return result.result;
}

/**
 * يعاود يرسم رسالة الطلب من الطلب المخزّن (ماشي من نص تيليغرام) — هكذا
 * التنسيق يبقى مضبوط وما نعتمدوش على واش يرجّعلنا تيليغرام.
 *
 * `chatId` اختياري: النقرة الجايّة من تيليغرام تعطي الشات اللي فيه
 * الرسالة، واللوحة ما عندهاش شات فتاخذ الافتراضي.
 */
export async function repaintOrder(record, chatId = ownerChatId()) {
  if (!record?.messageId || !chatId) return;
  await telegram('editMessageText', {
    chat_id: chatId,
    message_id: record.messageId,
    text: ownerMessage(record),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: buttonsFor(record),
  });
}

/**
 * رسم مجدّد ما يطيّحش اللي نادى عليه.
 *
 * ⚠️ تيليغرام يرمي خطأ على تعديل بلا تبديل، وعلى رسالة قديمة بزّاف، وكي
 * الشبكة تقطع. ولا واحدة من هذوما تستاهل تطيّح قبول طلب راه تسجّل خلاص
 * في التخزين — التخزين هو الحقيقة، والرسالة غير مرآة عليه.
 */
export const repaintOrderQuietly = (record, chatId) =>
  repaintOrder(record, chatId).catch((error) =>
    console.error('Order repaint failed:', error.message, '| order:', record?.id));
