/*
 * إشعارات تيليغرام — الأحداث اللي تستاهل رنّة.
 *
 * ── الفرق مع message.mjs ───────────────────────────────────────────
 * `message.mjs` يبني **رسالة الطلب** — هي وحدة، تتعاود ترسم في بلاصتها
 * كل ما يتبدّل شي. هنا رسائل **الأحداث**: الطردة خرجت، وصلت، رجعت،
 * ولا الموصّل رفض. هاذو رسائل جداد تنزل في الگروب.
 *
 * ── القاعدة: قليل ومفيد ────────────────────────────────────────────
 * كل حدث يقدر يتطفى من الإعدادات. الإشعار اللي يجي على كل حركة يولّي
 * ضجيج، والضجيج يتقرا كيف كيف: ما يتقراش. والفشل هنا ما يوقّف والو —
 * تيليغرام يطيح، الطلب والطردة يكملو طريقهم.
 */
import { telegram, ownerChatId } from './telegram.mjs';
import { getSettings, notifies, returnLossFor } from './settings.mjs';
import { dz, esc, goodsTotal, profitFor, shippingFeeOf } from './message.mjs';
import { STAGE_LABEL } from './ecotrack/status.mjs';

/** يبعث نص للگروب — يرجع { ok } ولا { error }، عمرو ما يرمي */
async function send(text, { event = null, chatId = null } = {}) {
  const settings = await getSettings().catch(() => null);
  if (event && settings && !notifies(settings, event)) return { skipped: 'event off' };

  const target = chatId ?? ownerChatId();
  if (!target) return { skipped: 'no chat id' };

  try {
    await telegram('sendMessage', {
      chat_id: target,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    return { ok: true };
  } catch (error) {
    console.error('Notify failed:', error.message, '| event:', event);
    return { error: error.message };
  }
}

const orderLabel = (order) => `#${esc(order.id)}`;

/* ── الشحن ─────────────────────────────────────────────────────────── */

export const shipmentCreated = (order) => send([
  '🚚 <b>الطردة خرجت للموصّل</b>',
  '',
  `الطلب: ${orderLabel(order)}`,
  `التتبّع: <code>${esc(order.shipment?.tracking ?? '')}</code>`,
  `الوجهة: ${esc(order.wilaya)} / ${esc(order.shipment?.commune ?? order.commune)}`,
  order.shipment?.stopDesk ? 'التسليم: مكتب' : 'التسليم: للمنزل',
  `التحصيل: <b>${dz(order.total)}</b>`,
].join('\n'), { event: 'shipment.created' });

export const shipmentMoved = (order, stage) => send([
  `📍 <b>${esc(STAGE_LABEL[stage] ?? stage)}</b>`,
  '',
  `الطلب: ${orderLabel(order)} — ${esc(order.name)}`,
  `التتبّع: <code>${esc(order.shipment?.tracking ?? '')}</code>`,
].join('\n'), { event: `shipment.${stage}` });

export const shipmentDelivered = (order, costs) => send([
  '📦 <b>وصلت</b>',
  '',
  `الطلب: ${orderLabel(order)} — ${esc(order.name)}`,
  `تحصّل: <b>${dz(order.total)}</b>`,
  `مدخول السلعة: ${dz(goodsTotal(order))}`,
  `الربح التقديري: <b>${dz(profitFor(order, costs))}</b>`,
].join('\n'), { event: 'shipment.delivered' });

/**
 * الرجعة — بالتفصيل، ماشي "رجعت" برك.
 *
 * الخسارة الحقيقية هي اللي تخلّي التاجر يقرّر: يوقّف الإعلان على هاذ
 * الولاية، ولا يطلب تأكيد بالتيليفون قبل كل قبول. رقم واحد بلا تفصيل
 * ما يعلّم والو.
 */
export async function shipmentReturned(order, costs, settings) {
  const snapshot = order.costSnapshot ?? {};
  const breakdown = returnLossFor({
    shippingFee: shippingFeeOf(order),
    outboundCost: snapshot.courierCost ?? 0,
    goodsCost: snapshot.goodsCost ?? 0,
  }, settings);

  return send([
    '🔴 <b>رجعت</b>',
    '',
    `الطلب: ${orderLabel(order)} — ${esc(order.name)}`,
    `الوجهة: ${esc(order.wilaya)}`,
    '',
    `توصيل ذهاب: ${dz(breakdown.outbound)}`,
    `توصيل رجعة (${settings?.returnShipPercent ?? 0}%): ${dz(breakdown.returnShip)}`,
    ...(breakdown.extra ? [`تكاليف أخرى: ${dz(breakdown.extra)}`] : []),
    ...(breakdown.goods ? [`سومة السلعة: ${dz(breakdown.goods)}`] : []),
    '',
    `<b>الخسارة: ${dz(breakdown.total)}</b>`,
    ...(settings?.returnIncludesProduct ? [] : ['السلعة ترجع للمخزون كي تنقر «استلمت الرجعة».']),
  ].join('\n'), { event: 'shipment.returned' });
}

export const shipmentError = (order, { operation, reason }) => send([
  '⚠️ <b>الموصّل رفض</b>',
  '',
  `الطلب: ${orderLabel(order)} — ${esc(order.name)}`,
  `العملية: ${esc(operation)}`,
  `السبب: ${esc(String(reason).slice(0, 300))}`,
  '',
  `أعد المحاولة: <code>/ship ${esc(order.id)}</code> ولا من اللوحة.`,
].join('\n'), { event: 'ecotrack.error' });

/* ── الشحن بالجملة ─────────────────────────────────────────────────── */

export const bulkResult = ({ sent, failed, skipped }) => send([
  '🚚 <b>إرسال بالجملة</b>',
  '',
  `نجحو: ${sent}`,
  `طاحو: ${failed}`,
  `تخطّاو: ${skipped}`,
].join('\n'), { event: 'shipment.created' });
