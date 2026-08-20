/*
 * دورة حياة الشحنة: من الطلب المقبول حتى وصلت ولا رجعت.
 *
 * ── القاعدة الأولى: الطلب أهمّ من الطردة ────────────────────────────
 * الموصّل يطيح، الشبكة تقطع، والحدود تتجاوز. ولا وحدة من هاذو تخصّر
 * الطلب: الطلب يبقى مقبول، الغلطة تتخزّن عليه، والزرّ يعاود يجرّب.
 * الفنكشنات هنا ما ترميش أبداً — يرجعو { ok } ولا { error }.
 *
 * ── القاعدة الثانية: طردة وحدة لكل طلب ─────────────────────────────
 * نقرتين على "أرسل" ما يديروش زوج طرود. `order.shipment.tracking`
 * موجود = ما نخلقوش، نرجعو اللي كاين. هذا هو كل الأمان تاع التكرار.
 *
 * ── القاعدة الثالثة: نخزّنو كلمتهم وكلمتنا ─────────────────────────
 * `shipment.status` هي حالتهم الخام، `shipment.stage` هي مرحلتنا.
 * الربح يقرا مرحلتنا. حالة جديدة عندهم ما تكسر والو.
 */
import { getOrder, updateOrder } from '../store.mjs';
import { notifies } from '../settings.mjs';
import { configured, createParcel, validateParcel, deleteParcel, askReturn, trackings, parcelFor } from './client.mjs';
import { getGeo, matchCommune, deskCommuneFor } from './geo.mjs';
import { stageFor, latestActivity, deliveryOutcomeFor, isFinalStage, isPaidStatus, STAGE_LABEL } from './status.mjs';
import { wilayaId } from '../wilayas.mjs';
import { withClaim } from '../locks.mjs';
import { logEvent } from '../audit.mjs';

/* المحاولات: 4 مرّات، وكل مرّة تستنّى أكثر (5د، 20د، ساعة، 4 سوايع).
   بلا حدّ، طردة غالطة تعاود للأبد وتاكل الحصّة اليومية. */
export const MAX_ATTEMPTS = 4;
const BACKOFF_MINUTES = [5, 20, 60, 240];

const fail = (error, extra = {}) => ({ ok: false, error, ...extra });

/** حدث في تاريخ الطلب — يتقرا حتى لو الـ API تبدّلت من بعد */
export function addEvent(order, type, text, meta = null) {
  const events = Array.isArray(order?.events) ? order.events : [];
  return [...events, { at: new Date().toISOString(), type, text, ...(meta ? { meta } : {}) }].slice(-60);
}

/* ── التحقّق قبل الإرسال ───────────────────────────────────────────── */

/**
 * واش هاذ الطلب صالح باش يولّي طردة.
 *
 * نتحقّقو هنا وماشي نخلّيو الموصّل يرفض: 422 تجي بالفرنسية حقل بحقل،
 * وأسهل نقولو "البلدية ما تطابقتش" قبل ما نستهلكو نداء.
 */
export async function validateForShipment(order, geo) {
  if (!order) return fail('الطلب غير موجود.');
  if (order.status !== 'accepted') return fail('الطلب لم يُقبل بعد.');

  const id = wilayaId(order.wilaya);
  if (!id) return fail('الولاية غير معروفة.');

  const phone = String(order.phone ?? '').replace(/\D/g, '');
  if (!/^0[5-7]\d{8}$/.test(phone)) return fail('رقم الهاتف غير صالح.');

  if (!String(order.name ?? '').trim()) return fail('اسم الزبون فارغ.');
  if (!(order.total > 0)) return fail('مبلغ التحصيل غير صالح.');

  const served = (geo?.wilayas ?? []).some((row) => row.id === id);
  if (geo?.wilayas?.length && !served) return fail('الموصّل لا يخدم هذه الولاية.');

  /*
   * البلدية: الاسم لازم يكون من قائمتهم. الطلب الجديد يخزّن الاسم
   * تاعهم (`communeRef`) فيصيب من أوّل مرّة؛ القديم يتجرّب بالمطابقة،
   * وإذا ما صابش نوقفو ونخلّيو المشغّل يختار — التخمين يبعث الطردة
   * لبلدية أخرى.
   */
  const wanted = order.communeRef ?? order.commune;
  const desk = order.shipping === 'desk';
  const commune = desk ? deskCommuneFor(geo, id, wanted) : matchCommune(geo, id, wanted);

  if (!commune) {
    return fail(desk
      ? 'لا يوجد مكتب في هذه الولاية — حوّل الطلب إلى التوصيل للمنزل.'
      : `البلدية "${order.commune}" غير معروفة عند الموصّل — اخترها من القائمة في اللوحة.`);
  }

  return { ok: true, commune, wilayaId: id };
}

/* ── الإرسال ───────────────────────────────────────────────────────── */

function shipmentPatch(order, patch) {
  return { shipment: { provider: 'ecotrack', ...(order.shipment ?? {}), ...patch } };
}

/**
 * يخلق الطردة ويثبّتها.
 *
 * الخلق والتثبيت زوج نداءات: بيناتهم الطردة موجودة وقابلة للمسح. إذا
 * التثبيت طاح، نخزّنو الـ tracking برك ونعلّمو `state: 'failed'` —
 * إعادة المحاولة تعاود التثبيت وحدو، ما تخلقش وحدة أخرى.
 */
/*
 * ⚠️ القفل هنا زيادة على فحص `tracking` تحت، ماشي بدل عليه.
 *
 * الفحص "عندو رقم تتبّع؟ ما نخلقوش" يقرا قبل ما يكتب — وبين الزوج
 * كاين نداء شبكة تاع 8 ثواني. زوج مصادر يقدرو يدخلو فيها: /ship
 * بيدك، والإعادة التلقائية تاع الكرون. الزوج يلقاو "بلا رقم تتبّع"
 * ويخلقو زوج طرود لنفس الطلب — وهاذي تتخلّص مرّتين عند الموصّل.
 */
export const sendShipment = (orderId, options = {}) =>
  withClaim(orderId, 'ship', () => sendShipmentNow(orderId, options),
    fail('الطردة راهي تتبعث دروك — استنّى ثانية.'));

async function sendShipmentNow(orderId, { by = null, force = false, source = 'system' } = {}) {
  if (!configured()) return fail('الربط مع الموصّل غير مضبوط (ECOTRACK_URL / ECOTRACK_TOKEN).');

  const order = await getOrder(orderId).catch(() => null);
  if (!order) return fail('الطلب غير موجود.');

  /* طردة موجودة ومثبّتة = خلاص. نقرة ثانية ما تدير والو. */
  if (order.shipment?.tracking && order.shipment?.state === 'success' && !force) {
    return { ok: true, order, tracking: order.shipment.tracking, already: true };
  }

  const attempts = (order.shipment?.attempts ?? 0) + 1;
  if (attempts > MAX_ATTEMPTS && !force) {
    return fail(`توقّفنا بعد ${MAX_ATTEMPTS} محاولات — صلّح السبب ثمّ أعد الإرسال يدوياً.`);
  }

  const geo = await getGeo().catch(() => null);
  const check = await validateForShipment(order, geo);
  if (!check.ok) {
    const failed = await markFailed(order, check.error, attempts, by, { source });
    return { ...fail(check.error), order: failed };
  }

  /* عندنا tracking من محاولة سابقة طاحت في التثبيت — نكمّلو منّها */
  let tracking = order.shipment?.tracking ?? null;

  if (!tracking) {
    const payload = parcelFor(order, { deskCommune: check.commune.name, communeName: check.commune.name });
    const created = await createParcel(payload);
    if (created.error) {
      const failed = await markFailed(order, created.error, attempts, by, { retryAfter: created.retryAfter, source });
      return { ...fail(created.error), order: failed };
    }

    tracking = created.data?.tracking ?? created.data?.data?.tracking ?? null;
    if (!tracking) {
      const failed = await markFailed(order, 'الموصّل لم يرجع رقم تتبّع.', attempts, by, { source });
      return { ...fail('الموصّل لم يرجع رقم تتبّع.'), order: failed };
    }
  }

  const valid = await validateParcel(tracking);
  if (valid.error) {
    /* الطردة موجودة عندهم بصح ما خرجتش — نخزّنو الرقم باش الإعادة
       تكمّل من هنا بدل ما تخلق وحدة ثانية */
    const failed = await markFailed(order, valid.error, attempts, by, { tracking, source });
    return { ...fail(valid.error), order: failed };
  }

  const now = new Date().toISOString();
  const updated = await updateOrder(orderId, {
    ...shipmentPatch(order, {
      tracking,
      state: 'success',
      status: 'order_information_received_by_carrier',
      stage: 'submitted',
      commune: check.commune.name,
      stopDesk: order.shipping === 'desk',
      montant: order.total,
      createdAt: order.shipment?.createdAt ?? now,
      submittedAt: now,
      lastSyncedAt: now,
      lastError: null,
      lastErrorAt: null,
      nextRetryAt: null,
      attempts,
    }),
    events: addEvent(order, 'shipment.created', `الطردة عند الموصّل — ${tracking}`, { by, commune: check.commune.name }),
  });

  await logEvent({
    action: 'shipment.created',
    source,
    actorType: 'system',
    actorName: by ?? null,
    entityType: 'shipment',
    entityId: tracking,
    orderId: order.id,
    customerPhone: order.phone ?? null,
    description: `الطردة خرجت للموصّل — ${tracking}`,
    newValues: { tracking, commune: check.commune.name, montant: order.total },
    metadata: { attempts },
  });

  return { ok: true, order: updated, tracking };
}

async function markFailed(order, error, attempts, by, extra = {}) {
  const wait = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length) - 1] ?? 240;
  const now = new Date();

  /*
   * ⚠️ كل طرق فشل الطردة (بيانات غالطة، الموصّل رفض، بلا رقم تتبّع،
   * التثبيت طاح) تعدّي من هنا — فسطر واحد في هاذ الفنكشن يغطّيهم
   * كامل، وما كاينش طريق فشل يخرج بلا سجلّ.
   */
  await logEvent({
    action: 'shipment.failed',
    source: extra.source ?? 'system',
    actorType: 'system',
    actorName: by ?? null,
    status: 'failed',
    error: String(error).slice(0, 300),
    entityType: 'shipment',
    entityId: extra.tracking ?? order.shipment?.tracking ?? null,
    orderId: order.id,
    description: `نداء الموصّل طاح — محاولة ${attempts}`,
    metadata: {
      attempts,
      willRetry: attempts < MAX_ATTEMPTS,
      retryInMinutes: attempts >= MAX_ATTEMPTS ? null : wait,
    },
  });

  return updateOrder(order.id, {
    ...shipmentPatch(order, {
      state: 'failed',
      attempts,
      lastError: String(error).slice(0, 400),
      lastErrorAt: now.toISOString(),
      nextRetryAt: attempts >= MAX_ATTEMPTS ? null : new Date(now.getTime() + wait * 60 * 1000).toISOString(),
      ...(extra.tracking ? { tracking: extra.tracking } : {}),
    }),
    events: addEvent(order, 'shipment.failed', String(error).slice(0, 200), { by, attempts }),
  }).catch(() => order);
}

/* ── الإلغاء ───────────────────────────────────────────────────────── */

/**
 * إلغاء الطردة.
 *
 * قبل التثبيت: `delete/order` تمسحها خلاص. بعد التثبيت: الموصّل راه
 * يعرف بيها، فأقصى ما نقدرو نديرو هو `ask/for/order/return`.
 */
export async function cancelShipment(orderId, { by = null, source = 'system' } = {}) {
  const order = await getOrder(orderId).catch(() => null);
  if (!order?.shipment?.tracking) return fail('لا توجد طردة لهذا الطلب.');
  if (isFinalStage(order.shipment.stage)) return fail('الطردة انتهت — لا يمكن إلغاؤها.');

  const submitted = Boolean(order.shipment.submittedAt);
  const result = submitted ? await askReturn(order.shipment.tracking) : await deleteParcel(order.shipment.tracking);
  if (result.error) return fail(result.error);

  const updated = await updateOrder(orderId, {
    ...shipmentPatch(order, {
      stage: submitted ? 'return_asked' : 'cancelled',
      state: 'success',
      lastSyncedAt: new Date().toISOString(),
    }),
    events: addEvent(order, submitted ? 'shipment.return_asked' : 'shipment.cancelled',
      submitted ? 'طلبنا رجعة الطردة' : 'الطردة تمسحت قبل ما تخرج', { by }),
  });

  await logEvent({
    action: submitted ? 'shipment.returnAsked' : 'shipment.cancelled',
    source,
    actorType: 'system',
    actorName: by ?? null,
    entityType: 'shipment',
    entityId: order.shipment.tracking,
    orderId: order.id,
    description: submitted ? 'طلبنا رجعة الطردة من الموصّل' : 'الطردة تمسحت عند الموصّل قبل ما تخرج',
    oldValues: { stage: order.shipment.stage ?? null },
    newValues: { stage: submitted ? 'return_asked' : 'cancelled' },
  });

  return { ok: true, order: updated };
}

/* ── المزامنة ─────────────────────────────────────────────────────── */

/**
 * يسحب حالات الطرود ويحدّث الطلبات.
 *
 * `onOutcome(orderId, outcome)` ينادى كي الطردة توصل ولا ترجع — النادي
 * هو اللي يشدّ منّها (setDeliveryOutcome في decisions.mjs) باش المخزون
 * والربح والرسالة يمشيو من نفس الطريق تاع النقرة اليدوية، ماشي طريق
 * ثاني يتنسى.
 *
 * الحدّ 100 tracking في النداء — نقسّمو على دفعات.
 */
export async function syncShipments(orders, { onOutcome = null, onStage = null } = {}) {
  if (!configured()) return { ok: false, error: 'الربط مع الموصّل غير مضبوط.' };

  const live = (orders ?? []).filter((order) =>
    order?.shipment?.tracking && !isFinalStage(order.shipment.stage));
  if (!live.length) return { ok: true, checked: 0, changed: 0 };

  let changed = 0;
  const errors = [];

  for (let i = 0; i < live.length; i += 100) {
    const batch = live.slice(i, i + 100);
    const result = await trackings(batch.map((order) => order.shipment.tracking));
    if (result.error) { errors.push(result.error); continue; }

    const byTracking = indexByTracking(result.data);

    for (const order of batch) {
      const payload = byTracking.get(order.shipment.tracking);
      if (!payload) continue;

      const activity = latestActivity(payload);
      if (!activity?.status) continue;

      const stage = stageFor(activity.status) ?? order.shipment.stage;
      const now = new Date().toISOString();
      const moved = activity.status !== order.shipment.status;

      const patch = {
        shipment: {
          ...order.shipment,
          status: activity.status,
          stage,
          statusAt: activity.at ?? now,
          lastSyncedAt: now,
          ...(isPaidStatus(activity.status) ? { paidAt: activity.at ?? now } : {}),
        },
        ...(moved ? {
          events: addEvent(order, 'shipment.status',
            `${STAGE_LABEL[stage] ?? stage} — ${activity.status}`, { raw: activity.status }),
        } : {}),
      };

      const updated = await updateOrder(order.id, patch).catch(() => null);
      if (!updated) continue;
      if (moved) changed += 1;

      if (moved && onStage) await onStage(updated, stage);

      const outcome = deliveryOutcomeFor(stage);
      if (outcome && !updated.deliveryStatus && onOutcome) {
        await onOutcome(updated, outcome);
      }
    }
  }

  return { ok: errors.length === 0, checked: live.length, changed, errors };
}

/*
 * جواب get/trackings/info يقدر يجي لائحة ولا كائن مفتاحو الـ tracking.
 * نقراو الزوج بدل ما نفترضو واحد ونطيّحو المزامنة كاملة على شكل جواب.
 */
function indexByTracking(data) {
  const map = new Map();
  const rows = data?.data ?? data;

  if (Array.isArray(rows)) {
    for (const row of rows) {
      const key = row?.tracking ?? row?.tracking_id ?? null;
      if (key) map.set(key, row);
    }
    return map;
  }

  for (const [key, value] of Object.entries(rows ?? {})) map.set(key, value);
  return map;
}

/** الطلبات اللي حان وقت إعادة محاولتها */
export const dueForRetry = (orders, now = Date.now()) =>
  (orders ?? []).filter((order) =>
    order?.shipment?.state === 'failed'
    && order.shipment.nextRetryAt
    && new Date(order.shipment.nextRetryAt).getTime() <= now
    && (order.shipment.attempts ?? 0) < MAX_ATTEMPTS);

/*
 * ⚠️ `autoShipEnabled()` تحيّدت — كانت بلا نادي. الفحص الحقيقي يصرا
 * في `shipOnAccept` (decisions.mjs) اللي يقرا الإعدادات مباشرةً.
 * فنكشن ثانية تجاوب نفس السؤال معناها بلاصة ثانية تنسى تتحدّث.
 */

export { notifies };
