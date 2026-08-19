/*
 * قرارات الطلب — قبول، رفض، نتيجة التوصيل، استلام الرجعة.
 *
 * ⚠️ علاش هاذ الملف موجود: هاذ القرارات كانو ساكنين جوّا معالج نقرات
 * تيليغرام. كل قرار يجرّ وراه أربع حوايج ماشي وحدة — يكتب في التخزين،
 * ينقّص ولا يزيد المخزون، ياخذ لقطة التكاليف، ويبعث Purchase لميتا.
 * ساعة ما اللوحة ولّات تقدر تقرّر تاني، كان عندنا زوج طرق: نكرّرو
 * الأربعة (وننساو وحدة نهار من النهارات)، ولا نخرّجوهم لبلاصة وحدة.
 *
 * القاعدة هنا: هاذ الفنكشنات ما تعرفش منين جات النقرة. ترجّع
 * `{ ok, error }` بدل ما تجاوب تيليغرام، والنادي هو اللي يترجم النتيجة
 * لجواب زرّ ولا لـ JSON. الرسم المجدّد وتنبيه المخزون يدخلو هنا على
 * خاطر الزوج لازمين في كل الحالات، مهما كانت البلاصة اللي نقرت.
 *
 * الأخطاء مكتوبة بالدارجة للمشغّل روحو — نفس القاعدة تاع admin-api.
 */
import {
  getOrder, updateOrder,
  stockCheckForOrder, adjustStockForOrder, markLowStockAlertedForOrder, stockRefsForOrder,
  getCosts,
} from './store.mjs';
import { getProduct } from './catalog.mjs';
import { getSettings } from './settings.mjs';
import { sendShipment } from './ecotrack/shipments.mjs';
import { configured as ecotrackConfigured } from './ecotrack/client.mjs';
import { shipmentCreated, shipmentError } from './notify.mjs';
import { esc, costSnapshotOf } from './message.mjs';
import { sendMetaEvent } from './meta.mjs';
import { telegram, repaintOrderQuietly, ownerChatId } from './telegram.mjs';

/** اللي يقرّر من اللوحة ما عندوش اسم — تسجيل واحد لواحد، مقابل أسماء تيليغرام */
export const DASHBOARD_ACTOR = 'اللوحة';

const fail = (error) => ({ ok: false, error });

/* ── تنبيه المخزون القليل ─────────────────────────────────────────── */

/** كي المخزون يهبط للحدّ أو تحتو، يتبعث تنبيه وحدة برك (ماشي في كل طلب) */
export async function checkLowStock(stock, order = null, chatId = ownerChatId()) {
  if (!stock || !chatId || stock.qty > stock.threshold || stock.lowStockAlerted) return;
  /* نسمّيو الفاريانت باش تعرف أشمن مقاس خلص، ماشي "المخزون" برك */
  const what = order?.variant?.options && Object.keys(order.variant.options).length
    ? Object.values(order.variant.options).join(' / ')
    : 'المنتج';
  await telegram('sendMessage', {
    chat_id: chatId,
    text: `⚠️ <b>تنبيه مخزون</b>\n${esc(what)}: باقي <b>${stock.qty}</b> فقط — وقت التزويد!`,
    parse_mode: 'HTML',
  }).catch((error) => console.error('Low stock alert failed:', error.message));
  await markLowStockAlertedForOrder(order, true)
    .catch((error) => console.error('markLowStockAlerted failed:', error.message));
}

/* ── تأكيد هاتفي ──────────────────────────────────────────────────── */

/**
 * يسجّل بلي الزبون أكّد في التيليفون. ما يقرّرش الطلب — يبقى pending
 * وأزرار القبول/الرفض تبقى.
 *
 * ما نمنعوش القبول بلا تأكيد قصداً: نسجّلو برك، باش من بعد تقارن نسبة
 * الرجعات بين المؤكّد وماشي المؤكّد وتشوف بأرقامك واش المكالمة تستاهل.
 */
export async function confirmOrder(orderId, { by, chatId } = {}) {
  const order = await getOrder(orderId).catch(() => null);
  if (!order) return fail('الطلب غير موجود.');
  if (order.confirmedAt) return fail(`تمّ التأكيد مسبقاً — ${order.confirmedBy ?? ''}`);

  const updated = await updateOrder(orderId, {
    confirmedAt: new Date().toISOString(), confirmedBy: by ?? DASHBOARD_ACTOR,
  });
  if (!updated) return fail('الطلب غير موجود.');

  await repaintOrderQuietly(updated, chatId);
  return { ok: true, order: updated };
}

/* ── قبول ─────────────────────────────────────────────────────────── */

/**
 * قبول الطلب: يعلّمو مقبول، يعاود يرسم الرسالة، وينقّص المخزون.
 *
 * ⚠️ ما نقبلوش طلب المخزون ما يكفيهش — يبقى بلا قرار حتى تزوّد. الطلب
 * اللي فيه باقة يحتاج **كل** عناصرها: باقة فيها طوق ×2 وغطاء ×1 ما
 * تتقبّلش إذا الغطاء خلص، حتى لو الطوق عندك بزّاف.
 */
export async function acceptOrder(orderId, { by, chatId } = {}) {
  const order = await getOrder(orderId).catch(() => null);
  if (!order) return fail('الطلب غير موجود.');
  if (order.status !== 'pending') {
    return fail(`الطلب ${order.status === 'accepted' ? 'مقبول' : 'مرفوض'} مسبقاً — ${order.actor ?? ''}`);
  }

  const check = await stockCheckForOrder(order).catch(() => null);
  if (check?.shortages?.length) {
    const rows = await Promise.all(check.shortages.map(async (row) => {
      const item = row.productId ? await getProduct(row.productId).catch(() => null) : null;
      return `• ${esc(item?.name ?? 'المنتج')} — المتبقّي ${row.qty}، والطلب يحتاج ${row.needed}`;
    }));
    return { ...fail(`🚫 المخزون غير كافٍ:\n${rows.join('\n')}\nأضف كمية بـ /restock.`), shortages: check.shortages };
  }

  const updated = await updateOrder(orderId, {
    status: 'accepted', actor: by ?? DASHBOARD_ACTOR, decidedAt: new Date().toISOString(), reason: null,
    /* لقطة: واش هاذ الطلب تأكّد بالتيليفون قبل ما يتقبّل؟ هذا اللي
       يخلّينا من بعد نقارنو نسبة الرجعات مؤكّد ضدّ ماشي مؤكّد. */
    confirmedBeforeAccept: Boolean(order.confirmedAt),
  });
  if (!updated) return fail('الطلب غير موجود.');

  await repaintOrderQuietly(updated, chatId);

  const stock = await adjustStockForOrder(updated, -1).catch((error) => {
    console.error('Stock decrement failed:', error.message, '| order:', orderId);
    return null;
  });
  await checkLowStock(stock, updated, chatId);

  /*
   * الطردة تخرج للموصّل هنا — القبول هو اللحظة اللي فيها الطلب يولّي
   * شحنة. تطيح؟ الطلب يبقى مقبول والمخزون منقّص، والغلطة تتخزّن عليه
   * مع زرّ إعادة. ما نرجعوش القبول لور: الطلب راه متّفق عليه مع
   * الزبونة، والطردة تفاصيل تقنية تتصلّح.
   */
  const shipment = await shipOnAccept(updated, by);

  return { ok: true, order: shipment.order ?? updated, stock, shipment };
}

/*
 * الإرسال التلقائي — ينطفي من الإعدادات، وما يخدمش أصلاً بلا توكن.
 * كل خطأ هنا يتبلّغ ويتخزّن، وما يوقّف حتى حاجة.
 */
async function shipOnAccept(order, by) {
  if (!ecotrackConfigured()) return { skipped: 'ecotrack not configured' };

  const settings = await getSettings().catch(() => null);
  if (settings?.autoShip === false) return { skipped: 'auto ship off' };

  const result = await sendShipment(order.id, { by }).catch((error) => ({ ok: false, error: error.message }));

  if (result.ok && !result.already) await shipmentCreated(result.order).catch(() => {});
  if (!result.ok) {
    await shipmentError(result.order ?? order, { operation: 'إنشاء الطردة', reason: result.error }).catch(() => {});
  }

  return result;
}

/* ── رفض ──────────────────────────────────────────────────────────── */

export const MAX_REASON_LENGTH = 200;

/**
 * رفض الطلب. السبب مطلوب — هو الحاجة الوحيدة اللي تخلّي لائحة الرفض
 * تنفع من بعد ("ما جاوبش" ماشي كيف "السومة غالية" كيف "طلب بالغلط").
 */
export async function denyOrder(orderId, { by, reason, chatId } = {}) {
  const clean = String(reason ?? '').trim().slice(0, MAX_REASON_LENGTH);
  if (!clean) return fail('اكتب سبب الرفض.');

  const order = await getOrder(orderId).catch(() => null);
  if (!order) return fail('الطلب غير موجود.');
  if (order.status !== 'pending') {
    return fail(`الطلب ${order.status === 'accepted' ? 'مقبول' : 'مرفوض'} مسبقاً — ${order.actor ?? ''}`);
  }

  const updated = await updateOrder(orderId, {
    status: 'denied', actor: by ?? DASHBOARD_ACTOR, reason: clean, decidedAt: new Date().toISOString(),
  });
  if (!updated) return fail('الطلب غير موجود.');

  await repaintOrderQuietly(updated, chatId);
  return { ok: true, order: updated };
}

/* ── نتيجة التوصيل ────────────────────────────────────────────────── */

/**
 * "وصلت" ولا "أُرجعت مع المُوصّل".
 *
 * ⚠️ "أُرجعت" ما تزيدش المخزون هنا — هذا غير يعني المُوصّل قالها رجعت،
 * والطلبية فيزيائياً لسّا في الطريق لعندك. المخزون يتزاد غير في
 * receiveReturn، كي تتأكّد إنها بين يديك.
 */
export async function setDeliveryOutcome(orderId, deliveryStatus, { by, chatId } = {}) {
  if (deliveryStatus !== 'delivered' && deliveryStatus !== 'returned') {
    return fail('نتيجة توصيل غير معروفة.');
  }

  const order = await getOrder(orderId).catch(() => null);
  if (!order) return fail('الطلب غير موجود.');
  if (order.status !== 'accepted') return fail('الطلب لم يُقبل بعد.');
  if (order.deliveryStatus) {
    return fail(`الطلب ${order.deliveryStatus === 'delivered' ? 'وصل' : 'أُرجع'} مسبقاً — ${order.deliveryActor ?? ''}`);
  }

  /*
   * لقطة التكاليف — هنا بالضبط، وقت ما الفلوس تتقرّر.
   *
   * بلاها، الربح يتحسب ديما بتكاليف اليوم: تبدّل سومة السلعة بـ /cost
   * وتقارير الشهور اللي فاتو تتبدّل معاها. باللقطة، اللي تسجّل يبقى كيما هو.
   */
  const costs = await getCosts().catch(() => null);
  const settings = await getSettings().catch(() => null);
  const product = order.productId ? await getProduct(order.productId).catch(() => null) : null;

  /*
   * تكلفة السلعة تتحسب على كل اللي في الطلب: المنتج، عناصر الباقة وحدة
   * بوحدة، والعرض الإضافي. نجيبو منتجاتهم مرّة وحدة هنا باش اللقطة تكون
   * كاملة — من بعد ما نقدروش نعرفو تكلفة كانت شحال.
   */
  const costById = new Map();
  if (product) costById.set(product.id, product.unitCost);
  for (const ref of stockRefsForOrder(order)) {
    if (costById.has(ref.productId)) continue;
    const item = await getProduct(ref.productId).catch(() => null);
    costById.set(ref.productId, item?.unitCost ?? null);
  }
  const unitCostOf = (id) => costById.get(id) ?? null;

  const updated = await updateOrder(orderId, {
    deliveryStatus, deliveryActor: by ?? DASHBOARD_ACTOR, deliveryDecidedAt: new Date().toISOString(),
    ...(costs ? { costSnapshot: costSnapshotOf(costs, product, { order, unitCostOf, settings }) } : {}),
  });
  if (!updated) return fail('الطلب غير موجود.');

  await repaintOrderQuietly(updated, chatId);

  /*
   * 💰 هنا برك نبعثو Purchase لميتا — كي الفلوس تدخل فعلاً، ماشي كي
   * الطلب يتقبّل. هكذا الخوارزمية تتعلّم تجيب ناس **يخلّصو** ماشي ناس
   * يعمّرو الفورم ويرفضو عند الباب.
   */
  if (deliveryStatus === 'delivered') {
    const meta = await sendMetaEvent('Purchase', updated, { value: updated.total });
    if (meta?.error) console.error('Meta CAPI Purchase failed:', meta.error, '| order:', orderId);
  }

  return { ok: true, order: updated };
}

/* ── استلام الرجعة ────────────────────────────────────────────────── */

/** الطلبية رجعت للمحل فعلاً — دروك برك تزيد للمخزون */
export async function receiveReturn(orderId, { by, chatId } = {}) {
  const order = await getOrder(orderId).catch(() => null);
  if (!order) return fail('الطلب غير موجود.');
  if (order.deliveryStatus !== 'returned') return fail('الطلب غير مسجّل كـ "رجعت".');
  if (order.returnReceivedAt) return fail(`استُلمت مسبقاً — ${order.returnReceivedActor ?? ''}`);

  const updated = await updateOrder(orderId, {
    returnReceivedAt: new Date().toISOString(), returnReceivedActor: by ?? DASHBOARD_ACTOR,
  });
  if (!updated) return fail('الطلب غير موجود.');

  await repaintOrderQuietly(updated, chatId);

  await adjustStockForOrder(updated, 1).catch((error) =>
    console.error('Restock after receiving return failed:', error.message, '| order:', orderId));

  return { ok: true, order: updated };
}
