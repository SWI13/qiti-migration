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
  getOrder, updateOrder, deleteOrder, listOrdersByPhone,
  stockCheckForOrder, adjustStockForOrder, markLowStockAlertedForOrder, stockRefsForOrder,
  getCosts,
} from './store.mjs';
import { getProduct } from './catalog.mjs';
import { getSettings } from './settings.mjs';
import { withClaim } from './locks.mjs';
import { sendShipment, cancelShipment } from './ecotrack/shipments.mjs';
import { configured as ecotrackConfigured } from './ecotrack/client.mjs';
import { shipmentCreated, shipmentError, shipmentCancelled } from './notify.mjs';
import { esc, costSnapshotOf } from './message.mjs';
import { STAGE_LABEL, isFinalStage } from './ecotrack/status.mjs';
import { wilayaId } from './wilayas.mjs';
import { sendMetaEvent } from './meta.mjs';
import { sendTikTokEvent } from './tiktok.mjs';
import { logEvent, diff } from './audit.mjs';
import { telegram, repaintOrderQuietly, ownerChatId } from './telegram.mjs';

/** اللي يقرّر من اللوحة ما عندوش اسم — تسجيل واحد لواحد، مقابل أسماء تيليغرام */
export const DASHBOARD_ACTOR = 'اللوحة';

const fail = (error) => ({ ok: false, error });

/* ── سجلّ التدقيق ─────────────────────────────────────────────────
 *
 * ⚠️ القرارات تتسجّل هنا وماشي عند اللي ينادي. علاش: نفس القرار
 * يتنادى من ثلاث بلايص (زرّ تيليغرام، اللوحة، ومزامنة الموصّل)،
 * والتسجيل عند النادي معناه ثلاث نسخ — وحدة منهم تنسى نهار من
 * النهارات، والسجلّ يولّي ناقص بلا ما حتى واحد يلاحظ.
 *
 * `source` يجي مع الخيارات (`{ by, source }`): 'telegram' من الزرّ،
 * 'admin' من اللوحة، 'cron' من المزامنة. بلاه = 'system'.
 */
const auditOrder = (action, order, { by, source, requestId, chatId } = {}, extra = {}) =>
  logEvent({
    action,
    source: source ?? 'system',
    actorName: by ?? DASHBOARD_ACTOR,
    actorType: source === 'telegram' ? 'telegram' : (source === 'admin' ? 'admin' : 'system'),
    entityType: 'order',
    entityId: order?.id ?? null,
    orderId: order?.id ?? null,
    productId: order?.productId ?? null,
    customerPhone: order?.phone ?? null,
    requestId,
    telegramChatId: source === 'telegram' ? chatId ?? null : null,
    telegramMessageId: order?.messageId ?? null,
    ...extra,
  });

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
export const confirmOrder = (orderId, options = {}) =>
  withClaim(orderId, 'confirm', () => confirmOrderNow(orderId, options),
    fail('الطلب راه يتعالج دروك — استنّى ثانية وشوف الرسالة.'));

async function confirmOrderNow(orderId, options = {}) {
  const { by, chatId } = options;
  const order = await getOrder(orderId).catch(() => null);
  if (!order) return fail('الطلب غير موجود.');
  if (order.confirmedAt) return fail(`تمّ التأكيد مسبقاً — ${order.confirmedBy ?? ''}`);

  const updated = await updateOrder(orderId, {
    confirmedAt: new Date().toISOString(), confirmedBy: by ?? DASHBOARD_ACTOR,
  });
  if (!updated) return fail('الطلب غير موجود.');

  await repaintOrderQuietly(updated, chatId);

  await auditOrder('order.confirmed', updated, options, {
    description: 'الزبون أكّد الطلب في التيليفون',
    ...diff({ confirmedAt: null }, { confirmedAt: updated.confirmedAt, confirmedBy: updated.confirmedBy }),
  });

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
export const acceptOrder = (orderId, options = {}) =>
  withClaim(orderId, 'accept', () => acceptOrderNow(orderId, options),
    fail('الطلب راه يتعالج دروك — استنّى ثانية وشوف الرسالة.'));

async function acceptOrderNow(orderId, options = {}) {
  const { by, chatId } = options;
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

    /*
     * ⚠️ الرفض على المخزون يتسجّل: هو أكثر سبب يخلّي طلب يقعد بلا
     * قرار، والمشغّل اللي يشوف "علاش هاذ الطلب باقي معلّق من نهارين"
     * يلقى الجواب هنا بدل ما يخمّن.
     */
    await auditOrder('order.accept', order, options, {
      status: 'failed',
      error: 'المخزون غير كافٍ',
      description: 'القبول ترفض — المخزون ما يكفيش',
      metadata: { shortages: check.shortages },
    });

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
  const shipment = await shipOnAccept(updated, by, options.source);

  await auditOrder('order.accepted', shipment.order ?? updated, options, {
    description: `الطلب تقبل — ${by ?? DASHBOARD_ACTOR}`,
    ...diff({ status: order.status }, { status: 'accepted', actor: updated.actor }),
    metadata: {
      stockAfter: stock?.qty ?? null,
      shipment: shipment.skipped ? `متقفز: ${shipment.skipped}` : (shipment.ok ? 'تخلقت' : `طاحت: ${shipment.error ?? ''}`),
      tracking: shipment.order?.shipment?.tracking ?? null,
    },
  });

  return { ok: true, order: shipment.order ?? updated, stock, shipment };
}

/*
 * الإرسال التلقائي — ينطفي من الإعدادات، وما يخدمش أصلاً بلا توكن.
 * كل خطأ هنا يتبلّغ ويتخزّن، وما يوقّف حتى حاجة.
 */
async function shipOnAccept(order, by, source = 'system') {
  if (!ecotrackConfigured()) return { skipped: 'ecotrack not configured' };

  const settings = await getSettings().catch(() => null);
  if (settings?.autoShip === false) return { skipped: 'auto ship off' };

  const result = await sendShipment(order.id, { by, source })
    .catch((error) => ({ ok: false, error: error.message }));

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
export const denyOrder = (orderId, options = {}) =>
  withClaim(orderId, 'deny', () => denyOrderNow(orderId, options),
    fail('الطلب راه يتعالج دروك — استنّى ثانية وشوف الرسالة.'));

async function denyOrderNow(orderId, options = {}) {
  const { by, reason, chatId } = options;
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

  await auditOrder('order.denied', updated, options, {
    description: `الطلب ترفض — ${clean}`,
    ...diff({ status: order.status }, { status: 'denied', reason: clean, actor: updated.actor }),
  });

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
/*
 * ── شكون يقدر يقول "وصلت" ────────────────────────────────────────
 *
 * ⚠️ الزرّ كان يسبق الموصّل. تنقر "📦 وصلت" على طردة لسّا في الطريق،
 * واللقطة المالية تتاخذ في تلك الثانية: بيعة تدخل المداخيل، الربح
 * يطلع، وما كاين حتى طريق يرجّعك لور — `setDeliveryOutcome` ترفض
 * التبديل الثاني بقصد. النتيجة: رقم غالط يعيش في تقارير الشهر.
 *
 * دروك الموصّل هو المرجع: ما تقدرش تعلّم "وصلت" حتى تقولها الطردة
 * عندو (`shipment.stage === 'delivered'`، اللي تجي من livred /
 * encaissed / payed).
 *
 * ── الاستثناء ──────────────────────────────────────────────────────
 * الولاية اللي توصّل فيها بيدك ما عندهاش موصّل يسأل — انت اللي شفت
 * الزبونة، وكلمتك هي الوحيدة الموجودة. باتنة بالتلقائي، وتزيد غيرها
 * بـ /settings selfdelivery.
 *
 * ── واش ما يتحبسش ─────────────────────────────────────────────────
 *   • "أُرجعت" — الخسارة ما يزوّرها حتى واحد، وحبسها يخلّي طلبات
 *     تبقى مفتوحة للأبد.
 *   • المزامنة روحها (`source: 'carrier'`) — هي اللي تجيب الخبر.
 *   • محل بلا ربط مع الموصّل أصلاً — بلا هاذ الشرط، اللي ما عندوش
 *     ECOTRACK ما يقدر يغلق حتى طلب.
 */
async function deliveryGate(order, settings) {
  if (!ecotrackConfigured()) return { ok: true };

  const self = settings?.selfDeliveredWilayas ?? [];
  if (self.includes(wilayaId(order.wilaya))) return { ok: true };

  if (order.shipment?.stage === 'delivered') return { ok: true };

  const where = order.shipment?.tracking
    ? `الموصّل يقول: <b>${esc(STAGE_LABEL[order.shipment.stage] ?? order.shipment.stage ?? 'ما زال ما بدا')}</b>`
    : 'ما كاينش طردة عند الموصّل لهاذ الطلب.';

  return fail([
    '🚫 <b>ما نقدروش نعلّموه وصل</b>',
    '',
    where,
    '',
    'الطردة تتعلّم "وصلت" وحدها كي يأكّد الموصّل — نقر «زامن» في اللوحة',
    'ولا اكتب /sync باش تسألو دروك.',
    order.shipment?.tracking ? '' : `ابعث الطردة: <code>/ship ${esc(order.id)}</code>`,
    '',
    `إذا وصّلتها بيدك، زيد ولايتها: <code>/settings selfdelivery ${esc(order.wilaya)}</code>`,
  ].filter(Boolean).join('\n'));
}

export const setDeliveryOutcome = (orderId, deliveryStatus, options = {}) =>
  withClaim(orderId, 'delivery', () => setDeliveryOutcomeNow(orderId, deliveryStatus, options),
    fail('الطلب راه يتعالج دروك — استنّى ثانية وشوف الرسالة.'));

async function setDeliveryOutcomeNow(orderId, deliveryStatus, options = {}) {
  const { by, chatId, source = null } = options;
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

  /*
   * الحاجز قبل اللقطة، ماشي بعدها — اللقطة هي اللي تكتب الفلوس، فلازم
   * ما توصلش أصلاً على طردة ما وصلاتش. `source: 'carrier'` تجي من
   * المزامنة وحدها، والويبهوك عمرو ما يبعثها.
   */
  if (deliveryStatus === 'delivered' && source !== 'carrier') {
    const gate = await deliveryGate(order, settings);
    if (!gate.ok) return gate;
  }
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
    /* عند تيك توك الشراء اسمو CompletePayment ماشي Purchase — اسم غالط
       يولّي حدث مخصّص ما تعرفوش المنصّة، والحملة ما تتحسّنش عليه */
    const [meta, tiktok] = await Promise.all([
      sendMetaEvent('Purchase', updated, { value: updated.total }),
      sendTikTokEvent('CompletePayment', updated, { value: updated.total }),
    ]);
    if (meta?.error) console.error('Meta CAPI Purchase failed:', meta.error, '| order:', orderId);
    if (tiktok?.error) console.error('TikTok Events CompletePayment failed:', tiktok.error, '| order:', orderId);
  }

  /*
   * ⚠️ `source: 'carrier'` تجي من المزامنة — نسمّيوها 'cron' في
   * السجلّ باش يبان بلّي الموصّل هو اللي بدّل الحالة، ماشي واحد نقر.
   */
  await auditOrder(deliveryStatus === 'delivered' ? 'order.delivered' : 'order.returned', updated,
    { ...options, source: source === 'carrier' ? 'cron' : options.source }, {
      description: deliveryStatus === 'delivered' ? 'الطردة وصلت للزبون' : 'الطردة رجعت',
      ...diff({ deliveryStatus: order.deliveryStatus ?? null },
        { deliveryStatus, deliveryActor: updated.deliveryActor }),
      metadata: {
        by: source === 'carrier' ? 'الموصّل (مزامنة)' : (by ?? DASHBOARD_ACTOR),
        tracking: updated.shipment?.tracking ?? null,
      },
    });

  return { ok: true, order: updated };
}

/* ── إلغاء من الدفاتر ─────────────────────────────────────────────── */

/**
 * يخرّج الطلب من الحساب: ما يعدّش في المداخيل، الربح، الوحدات، ولا
 * في نسب التحويل. السجلّ يبقى كيما هو.
 *
 * ⚠️ علاش لازم: نتيجة التوصيل ما ترجعش لور. `setDeliveryOutcome` ترفض
 * كي `deliveryStatus` يكون متسجّل خلاص — وهذا صحيح، اللقطة المالية
 * تتاخذ ساعتها وما يلزمهاش تتعاود تتكتب. بصح معناه طلب تجريبي علّمتو
 * "وصل" بالغلط يبقى بيعة حقيقية في كل تقرير، للأبد. الوحيد اللي كان
 * يحيّدو هو /clear — يمسح التاريخ كامل.
 *
 * ⚠️ ما يمسّش المخزون بقصد. الإلغاء حكم محاسبي، ماشي تراجع فيزيائي:
 * الطلب اللي خرج فعلاً وعلّمتو بالغلط، السلعة راهي برّا. اللي كان
 * تجريبي وما خرجش، ترجّع كميتو بـ /restock. نفس القاعدة تاع الرجعة —
 * الفلوس والمخزون يتحرّكو كل واحد بأمرو.
 */
export const voidOrder = (orderId, options = {}) =>
  withClaim(orderId, 'void', () => voidOrderNow(orderId, options),
    fail('الطلب راه يتعالج دروك — استنّى ثانية وشوف الرسالة.'), { holdOnSuccess: false });

async function voidOrderNow(orderId, options = {}) {
  const { by, reason, chatId } = options;
  const order = await getOrder(orderId).catch(() => null);
  if (!order) return fail('الطلب غير موجود.');
  if (order.voidedAt) return fail(`مُلغى من الدفاتر مسبقاً — ${order.voidedBy ?? ''}`);

  const updated = await updateOrder(orderId, {
    voidedAt: new Date().toISOString(),
    voidedBy: by ?? DASHBOARD_ACTOR,
    voidReason: reason ? String(reason).trim().slice(0, MAX_REASON_LENGTH) : null,
  });
  if (!updated) return fail('الطلب غير موجود.');

  await repaintOrderQuietly(updated, chatId);

  await auditOrder('order.voided', updated, options, {
    description: `خرج من الدفاتر${updated.voidReason ? ` — ${updated.voidReason}` : ''}`,
    ...diff({ voidedAt: null }, { voidedAt: updated.voidedAt, voidReason: updated.voidReason }),
  });

  return { ok: true, order: updated };
}

/** يرجّع الطلب للدفاتر — إذا ألغيتيه بالغلط */
export const unvoidOrder = (orderId, options = {}) =>
  withClaim(orderId, 'void', () => unvoidOrderNow(orderId, options),
    fail('الطلب راه يتعالج دروك — استنّى ثانية وشوف الرسالة.'), { holdOnSuccess: false });

async function unvoidOrderNow(orderId, options = {}) {
  const { chatId } = options;
  const order = await getOrder(orderId).catch(() => null);
  if (!order) return fail('الطلب غير موجود.');
  if (!order.voidedAt) return fail('الطلب ماشي ملغى.');

  const updated = await updateOrder(orderId, { voidedAt: null, voidedBy: null, voidReason: null });
  if (!updated) return fail('الطلب غير موجود.');

  await repaintOrderQuietly(updated, chatId);

  await auditOrder('order.unvoided', updated, options, {
    description: 'رجع للدفاتر — يتحسب من جديد',
    ...diff({ voidedAt: order.voidedAt, voidReason: order.voidReason }, { voidedAt: null, voidReason: null }),
  });

  return { ok: true, order: updated };
}

/* ── استلام الرجعة ────────────────────────────────────────────────── */

/** الطلبية رجعت للمحل فعلاً — دروك برك تزيد للمخزون */
export const receiveReturn = (orderId, options = {}) =>
  withClaim(orderId, 'receive-return', () => receiveReturnNow(orderId, options),
    fail('الطلب راه يتعالج دروك — استنّى ثانية وشوف الرسالة.'));

async function receiveReturnNow(orderId, options = {}) {
  const { by, chatId } = options;
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

  await auditOrder('order.returnReceived', updated, options, {
    description: 'الرجعة وصلت للمحل — المخزون رجع',
    ...diff({ returnReceivedAt: null }, { returnReceivedAt: updated.returnReceivedAt }),
    metadata: { restocked: purgeQty(updated) },
  });

  return { ok: true, order: updated };
}

/* ── المحو الكامل (/void) ─────────────────────────────────────────
 *
 * ثلاث خطوات في نداء واحد، بالترتيب اللي ما يخسّرش والو:
 *
 *   1. الطردة تتلغى عند الموصّل — **قبل** المحو. الـ tracking ساكن في
 *      الطلب، فمحو الطلب أوّل معناه طردة ماشية عند الموصّل بلا مفتاح
 *      تلغيها بيه. هاذي كانت الخطوة اللي المشغّل ينساها.
 *   2. المخزون يرجع — القبول نقّصو (`acceptOrder`)، والمحو وحدو ما
 *      يرجّعوش. يرجع غير كي يكون القبول نقّصو فعلاً وما رجعش من قبل
 *      بـ `receiveReturn`، وإلا نزيدو وحدة ما كانتش.
 *   3. الطلب يتمسح من التخزين ومن الفهارس (`deleteOrder`).
 *
 * ⚠️ الطردة اللي فشل إلغاؤها توقّف كلش. المحو بلا تراجع، والطردة
 * الماشية بلا طلب ما عندها حتى طريق ترجع بيه — خير يشوف المشغّل
 * الخطأ ويقرّر، من طلب يختفي وطردة تكمّل طريقها لعند الزبون.
 *
 * ⚠️ الطردة اللي كملت (وصلت ولا رجعت وسكرات) ما تتلغاش — ما بقى
 * والو تلغيه. نعدّيو ونكمّلو المحو، والنتيجة تقول 'final'.
 */
const purgeQty = (order) => {
  const refs = stockRefsForOrder(order);
  if (!refs.length) return order?.qty ?? 1;
  return refs.reduce((sum, ref) => sum + (ref.qty ?? 1), 0);
};

export const purgeOrder = (orderId, options = {}) =>
  withClaim(orderId, 'purge', () => purgeOrderNow(orderId, options),
    fail('الطلب راه يتعالج دروك — استنّى ثانية وشوف الرسالة.'), { holdOnSuccess: false });

async function purgeOrderNow(orderId, options = {}) {
  const { by, skipShipment = false } = options;
  const order = await getOrder(orderId).catch(() => null);
  if (!order) return fail('الطلب غير موجود.');

  /* 1) الطردة */
  let shipment = 'none';
  if (order.shipment?.tracking) {
    /*
     * ⚠️ `skipShipment` هو مخرج المشغّل كي الموصّل يرفض. النطاق يقدر
     * يقول "Le retour ne peut pas être demandé" على طردة راهي في
     * حالة ما تقبلش لا الحذف لا طلب الرجعة — وساعتها المحو يتحبس
     * للأبد على حاجة ما تتصلّحش من هنا. القرار يرجع للمشغّل: يمحي
     * ويتكفّل بالطردة من لوحة الموصّل بيدو.
     */
    if (skipShipment) {
      shipment = 'skipped';
    } else if (isFinalStage(order.shipment.stage)) {
      shipment = 'final';
    } else {
      const result = await cancelShipment(orderId, { by, source: options.source })
        .catch((error) => ({ ok: false, error: error.message }));
      if (!result.ok) {
        await auditOrder('order.purge', order, options, {
          status: 'failed',
          error: result.error,
          description: 'المحو توقّف — الموصّل رفض يلغي الطردة',
          metadata: { tracking: order.shipment.tracking, stage: order.shipment.stage ?? null },
        });
        return { ...fail(`الطردة ما تلغاتش: ${result.error}`), tracking: order.shipment.tracking };
      }

      await shipmentCancelled(result.order).catch(() => {});
      shipment = result.order?.shipment?.stage === 'return_asked' ? 'return_asked' : 'cancelled';
    }
  }

  /* 2) المخزون */
  let restocked = 0;
  if (order.status === 'accepted' && !order.returnReceivedAt) {
    const done = await adjustStockForOrder(order, 1)
      .then(() => true)
      .catch((error) => {
        console.error('Restock before purge failed:', error.message, '| order:', orderId);
        return false;
      });
    if (done) restocked = purgeQty(order);
  }

  /* 3) المحو */
  const removed = await deleteOrder(orderId).catch((error) => {
    console.error('Purge delete failed:', error.message, '| order:', orderId);
    return null;
  });
  if (!removed) return fail('المحو طاح — الطلب ما تمسحش.');

  console.log('Order purged:', orderId, '| by:', by ?? DASHBOARD_ACTOR,
    '| shipment:', shipment, '| restocked:', restocked);

  /*
   * ⚠️ الطلب راح، والسجلّ يبقى — وهذا هو بالضبط سبب وجود السجلّ.
   * "شكون محا هاذ الطلب ووقتاش؟" ما عندها حتى جواب آخر بعد المحو،
   * فنكتبو لقطة صغيرة من الطلب (السومة، الحالة، الزبون) معاه.
   */
  await auditOrder('order.purged', removed, options, {
    description: `الطلب تمسح نهائياً — ${by ?? DASHBOARD_ACTOR}`,
    oldValues: {
      status: removed.status,
      total: removed.total,
      deliveryStatus: removed.deliveryStatus ?? null,
      customer: removed.name ?? null,
    },
    newValues: { deleted: true },
    metadata: { shipment, restocked, tracking: removed.shipment?.tracking ?? null },
  });

  return { ok: true, order: removed, shipment, restocked };
}

/**
 * نفس الشيء على كل طلبات رقم واحد — الرقم يتوحّد في `listOrdersByPhone`،
 * فـ `0661445566` و`+213661445566` نفس الزبون.
 *
 * ⚠️ الطلب اللي يطيح ما يوقّفش الباقي: كل واحد يتعالج وحدو، والنتيجة
 * ترجع اللي تمسح واللي طاح بسببو. محو نصف طلبات وسكات على الباقي
 * أخطر من قائمة فيها خطأ واضح.
 */
export async function purgeOrdersByPhone(phone, { by, skipShipment = false } = {}) {
  const found = await listOrdersByPhone(phone).catch(() => []);
  if (!found.length) return { ok: false, error: 'ما لقيت حتى طلب بهاذ الرقم.', purged: [], failed: [] };

  const purged = [];
  const failed = [];
  for (const order of found) {
    const result = await purgeOrder(order.id, { by, skipShipment });
    if (result.ok) purged.push(result);
    else failed.push({ id: order.id, error: result.error });
  }

  return { ok: purged.length > 0, purged, failed };
}
