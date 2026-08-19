/*
 * حالات ECOTRACK ← حالات Qiti.
 *
 * ── علاش طبقة ترجمة وحدها ──────────────────────────────────────────
 * عندهم إحدى عشر حالة، وعندنا زوج قرارات ماليّة برك: وصلت ولا رجعت.
 * لو خلطنا الزوج، أي حالة جديدة يزيدوها غدوة تولّي حالة في نظامنا،
 * والربح يتبع اسم برّاني ما نتحكموش فيه.
 *
 * فالقاعدة: **نخزّنو الزوج**. `shipment.status` هي كلمتهم هوما كيما
 * جات، و`shipment.stage` هي مرحلتنا احنا. الربح والمخزون يقراو
 * مرحلتنا، والعرض يوري كلمتهم كي تكون مفيدة.
 *
 * الحالة اللي ما نعرفوهاش ما تطيّح والو: تتخزّن، وتتعرض كيما هي،
 * وتبقى المرحلة "في الطريق" حتى تجي وحدة نعرفوها.
 */

/** مراحل الشحنة عندنا — بالترتيب اللي يمشي فيه الطرد */
export const STAGES = [
  'created',      /* تخلقت عند الموصّل، مازال ما تثبّتتش */
  'submitted',    /* تثبّتت — الموصّل راه يعرف بيها */
  'picked',       /* الموصّل شدّها */
  'in_transit',   /* في الطريق */
  'out_for_delivery',
  'delivered',
  'return_asked',
  'returned',
  'cancelled',
  'failed',
];

/*
 * الخريطة. المفتاح هو `activity` اللي ترجعو get/tracking/info.
 *
 * `encaissed` و`payed` معناهم الفلوس تحصّلت وخلّصونا — هذا يجي **بعد**
 * التوصيل، فيبقاو في مرحلة delivered ما يفتحوش مرحلة جديدة. نخزّنو
 * التاريخ تاعهم في `paidAt` لأنّ التاجر يسأل عليه.
 */
const MAP = {
  order_information_received_by_carrier: 'submitted',
  picked: 'picked',
  accepted_by_carrier: 'in_transit',
  dispatched_to_driver: 'out_for_delivery',
  attempt_delivery: 'out_for_delivery',
  livred: 'delivered',
  encaissed: 'delivered',
  payed: 'delivered',
  return_asked: 'return_asked',
  return_in_transit: 'return_asked',
  return_received: 'returned',
};

export const stageFor = (rawStatus) => MAP[String(rawStatus ?? '').trim()] ?? null;

/** الحالات اللي معناها الفلوس تحصّلت فعلاً */
export const isPaidStatus = (rawStatus) => rawStatus === 'encaissed' || rawStatus === 'payed';

/**
 * المرحلة → نتيجة التوصيل اللي يفهمها باقي النظام (setDeliveryOutcome).
 * كل ما عداها يرجع null: ما فيه لا ربح لا خسارة بعد.
 */
export function deliveryOutcomeFor(stage) {
  if (stage === 'delivered') return 'delivered';
  if (stage === 'returned') return 'returned';
  return null;
}

/** واش هاذ المرحلة نهائية — ما نسألو عليها مرّة أخرى */
export const isFinalStage = (stage) =>
  stage === 'delivered' || stage === 'returned' || stage === 'cancelled';

/* تسميات للعرض — اللوحة والرسائل يقراو من هنا، ما يكتبوش نص بيدهم */
export const STAGE_LABEL = {
  created: 'تخلقت',
  submitted: 'عند الموصّل',
  picked: 'شدّها الموصّل',
  in_transit: 'في الطريق',
  out_for_delivery: 'خرجت للتوصيل',
  delivered: 'وصلت',
  return_asked: 'طلب رجعة',
  returned: 'رجعت',
  cancelled: 'ملغاة',
  failed: 'فشلت',
};

/* الشارات في اللوحة — لون لكل مرحلة، بلا ما تكتبها الواجهة بيدها */
export const STAGE_TONE = {
  created: 'pending',
  submitted: 'info',
  picked: 'info',
  in_transit: 'info',
  out_for_delivery: 'progress',
  delivered: 'good',
  return_asked: 'warn',
  returned: 'bad',
  cancelled: 'muted',
  failed: 'bad',
};

/**
 * آخر نشاط في جواب get/tracking/info.
 *
 * شكل الجواب يتبدّل حسب النقطة (وحدة ترجع كائن، وحدة ترجع لائحة تحت
 * `activity`)، فنقراو بحذر ونرجعو null بدل ما نطيّحو المزامنة كاملة.
 */
function timestampOf(row) {
  const date = row?.date ?? row?.created_at ?? row?.at ?? null;
  if (!date) return null;
  const stamp = row?.time ? `${date} ${row.time}` : date;
  const parsed = new Date(stamp.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function latestActivity(payload) {
  const activities = payload?.activity ?? payload?.activities ?? payload?.data?.activity ?? null;
  if (Array.isArray(activities) && activities.length) {
    const last = activities[activities.length - 1];
    return {
      status: last?.activity_type ?? last?.status ?? last?.activity ?? null,
      /* النطاق يقسّم الوقت: { date: '2026-08-19', time: '12:27:09' } */
      at: timestampOf(last),
      reason: last?.reason ?? last?.comment ?? null,
    };
  }

  const status = payload?.status ?? payload?.last_status ?? payload?.data?.status ?? null;
  return status ? { status, at: payload?.updated_at ?? null, reason: null } : null;
}
