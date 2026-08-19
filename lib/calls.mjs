/*
 * صفّ المكالمات — "ما جاوبش، ثالث محاولة" يولّي حالة يعرفها النظام.
 *
 * المشكلة: زرّ قبول/رفض في تيليغرام يخدم مليح على عشرين طلب في النهار.
 * على مايتين، الرسائل تهرب لفوق. الطلب اللي عيّطتلو مرّتين وما جاوبش
 * يبقى مخبّي بين خمسين رسالة، والمعلومة "قداش عيّطنالو" ما كاينة في
 * حتى بلاصة — تسكن في راس اللي عيّط. يمشي في العطلة وتضيع معاه.
 *
 * الحلّ: كل مكالمة تتسجّل على الطلب روحو — وقتاش، شكون، وشنو صرا.
 * من هذي الثلاثة يتحسب كلش: قداش من محاولة، وقتاش المحاولة الجاية،
 * وواش هذا الطلب وصل لبلاصة لازم فيها قرار بدل مكالمة أخرى.
 *
 * ── ثلاث قرارات تستاهل الشرح ─────────────────────────────────────────
 *
 * 1. المحاولات تتخزّن كلائحة، ماشي كعدّاد.
 *    العدّاد يقولك "3". اللائحة تقولك "3 محاولات: وحدة ما جاوبش الصباح،
 *    وحدة كان مشغول، وحدة قال عيّطلي بعد الخمسة" — وهذي الأخيرة هي
 *    اللي تقرّر وقتاش تعاود. العدّاد يضيّع بالضبط الحاجة اللي تحتاجها.
 *
 * 2. المهلة تجي من النتيجة، ماشي وقت ثابت.
 *    "مشغول" معناها راه ماسك التيليفون دروك — عاود بعد ربع ساعة.
 *    "ما جاوبش" معناها بعيد على التيليفون — عاود بعد ساعة، ومن بعد
 *    أكثر. نفس المهلة للزوج تخلّيك تضيّع الأوّل وتزنّ على الثاني.
 *
 * 3. بعد MAX_ATTEMPTS الطلب يخرج من دورة المكالمات ويولّي "واقف".
 *    ⚠️ ماشي زينة: بلا هاذ الحدّ، الطلب اللي عمرو ما يجاوب يرجع لراس
 *    اللائحة كل ساعة للأبد، ويدفع لتحت طلبات جداد يقدرو يتباعو.
 *    "واقف" معناها: كمّلنا المكالمات، دروك قرار — تقبل ولا ترفض.
 */
import { getOrder, updateOrder } from './store.mjs';

/**
 * نتائج المكالمة.
 *
 * `retryMinutes`: null = ما كاينش موعد جاي (النتيجة تحبس دورة المكالمات).
 * `ladder`: المهلة تكبر مع كل محاولة (شوف retryDelayMinutes).
 * `closes`: تخرج الطلب من الدورة — يستنّى قرار برك.
 * `confirms`: تسجّل تأكيد هاتفي على الطلب.
 */
export const CALL_OUTCOMES = {
  /* جاوب وأكّد — يخرج من الصفّ ويستنّى قبول/رفض */
  reached:     { retryMinutes: null, ladder: false, closes: true,  confirms: true },
  /* ما جاوبش — المهلة تكبر: 45 دقيقة، ساعة ونص، ساعتين وربع... */
  'no-answer': { retryMinutes: 45,   ladder: true,  closes: false, confirms: false },
  /* مشغول — ماسك التيليفون دروك، عاود قريب */
  busy:        { retryMinutes: 15,   ladder: false, closes: false, confirms: false },
  /* مطفي ولا برّا التغطية — أبعد من "ما جاوبش" */
  off:         { retryMinutes: 180,  ladder: true,  closes: false, confirms: false },
  /* قال عيّطلي من بعد — الوقت يجي منّو (callbackAt)، وإلا ثلاث سوايع */
  callback:    { retryMinutes: 180,  ladder: false, closes: false, confirms: false },
  /* الرقم غالط ولا ماشي هو — المكالمات ما تنفعش، لازم قرار */
  wrong:       { retryMinutes: null, ladder: false, closes: true,  confirms: false },
};

/**
 * قداش من محاولة قبل ما نحبسو.
 *
 * خمسة: تحتها ترمي زبائن يقدرو يجاوبو (الواحد يقدر يكون في الخدمة
 * الصباح كامل)، وفوقها تخسر نهار كامل على واحد ما راهش غادي يجاوب.
 */
export const MAX_ATTEMPTS = 5;

/** حدّ أقصى للمهلة — بلاه المحاولة الخامسة تطيح غدوة في الليل */
const MAX_DELAY_MINUTES = 12 * 60;

/** طول الملاحظة المكتوبة على المحاولة — نفس حدّ سبب الرفض */
export const MAX_NOTE_LENGTH = 200;

export const isCallOutcome = (outcome) =>
  Object.prototype.hasOwnProperty.call(CALL_OUTCOMES, outcome);

/* ── حسابات نقيّة (بلا تخزين) — هذي اللي تتفحص في verify-calls ─────── */

/** لائحة المحاولات — ديما لائحة، حتى على طلب قديم بلا الحقل هذا */
export const callsOf = (record) => (Array.isArray(record?.calls) ? record.calls : []);

export const attemptCount = (record) => callsOf(record).length;

export function lastCall(record) {
  const calls = callsOf(record);
  return calls.length ? calls[calls.length - 1] : null;
}

/**
 * قداش نستنّاو قبل المحاولة الجاية.
 *
 * `attemptNumber` هو رقم هذي المحاولة (الأولى = 1). السلّم يضاعف
 * حسبها — 45 دقيقة، ساعة ونص، ساعتين وربع — ويتحبس على 12 ساعة.
 */
export function retryDelayMinutes(outcome, attemptNumber = 1) {
  const policy = CALL_OUTCOMES[outcome];
  if (!policy || policy.retryMinutes == null) return null;
  if (!policy.ladder) return policy.retryMinutes;
  const grown = policy.retryMinutes * Math.max(1, attemptNumber);
  return Math.min(grown, MAX_DELAY_MINUTES);
}

/**
 * يبني الحقول اللي تتكتب بعد مكالمة — فنكشن نقي قصداً: نفس الحساب
 * يخدم للطلب وللـ lead، ويتفحص بلا تخزين وبلا شبكة.
 *
 * `callbackAt` تغلب المهلة المحسوبة — كي الزبون روحو يقول وقتاش.
 */
export function appendCall(record, { outcome, by = null, note = null, at = new Date(), callbackAt = null } = {}) {
  if (!isCallOutcome(outcome)) return null;

  const now = at instanceof Date ? at : new Date(at);
  if (!Number.isFinite(now.getTime())) return null;

  const calls = callsOf(record).concat([{
    at: now.toISOString(),
    outcome,
    by: by ?? null,
    note: note ? String(note).trim().slice(0, MAX_NOTE_LENGTH) : null,
  }]);

  const requested = callbackAt ? new Date(callbackAt) : null;
  const wanted = requested && Number.isFinite(requested.getTime()) ? requested : null;
  const minutes = retryDelayMinutes(outcome, calls.length);

  /*
   * الوقت اللي طلبو الزبون يغلب السلّم — هو اللي يعرف وقتاش يكون فاضي.
   * بلاه، النتيجة هي اللي تقرّر. والنتيجة اللي تسكّر (جاوب، رقم غالط)
   * تمسح الموعد كامل: ما بقاتش كاينة مكالمة جاية.
   */
  const nextCallAt = wanted ? wanted.toISOString()
    : (minutes == null ? null : new Date(now.getTime() + minutes * 60_000).toISOString());

  const patch = { calls, nextCallAt };

  /*
   * "جاوب وأكّد" هو هو التأكيد الهاتفي — نفس الحقول اللي يكتبها زرّ
   * التأكيد في تيليغرام، باش `confirmedBeforeAccept` يبقى صحيح مهما
   * كانت البلاصة اللي تسجّل منّها.
   */
  if (CALL_OUTCOMES[outcome].confirms && !record?.confirmedAt) {
    patch.confirmedAt = now.toISOString();
    patch.confirmedBy = by ?? null;
  }

  return patch;
}

/**
 * حالة السطر في الصفّ:
 *
 *   closed    — تقرّر خلاص (ولا الـ lead تسكّر): ما عندوش بلاصة في الصفّ
 *   confirmed — الزبون أكّد هاتفياً، يستنّى قبول/رفض برك
 *   stalled   — كمّل المحاولات (ولا الرقم غالط): قرار، ماشي مكالمة
 *   due       — يستاهل مكالمة دروك
 *   waiting   — عندو موعد في المستقبل (مهلة ولا وقت قالو الزبون)
 */
export function queueStateOf(record, now = Date.now()) {
  const open = record?.isLead ? record.status === 'open' : record?.status === 'pending';
  if (!open) return 'closed';

  const last = lastCall(record);

  /*
   * الطلب المؤكّد يستنّى نقرة قبول — شغل باقي. الـ lead لا: ما كاينش
   * شي تقبلو، الزبون هو اللي يطلب من الصفحة. كلّمتو = خلاص، يخرج من
   * الصفّ. يبقى في لائحة الطلبات باش تشوفو، ما يزحمش الشغل الحيّ.
   */
  if (record.isLead) {
    if (last?.outcome === 'reached') return 'closed';
  } else if (record.confirmedAt) {
    return 'confirmed';
  }

  if (last && CALL_OUTCOMES[last.outcome]?.closes) return 'stalled';
  if (attemptCount(record) >= MAX_ATTEMPTS) return 'stalled';

  const next = record.nextCallAt ? new Date(record.nextCallAt).getTime() : null;
  if (next && Number.isFinite(next) && next > now) return 'waiting';
  return 'due';
}

/**
 * الوقت اللي هذا السطر يستاهل فيه انتباهك — أساس الترتيب داخل كل مجموعة.
 * بلا موعد، الطلب يستنّى من ساعة ما وصل: الأقدم يتعالج الأوّل (صفّ، ماشي كومة).
 */
export const dueAt = (record) =>
  new Date(record?.nextCallAt ?? record?.createdAt ?? 0).getTime();

/*
 * ترتيب الصفّ. المجموعة قبل الوقت:
 *
 *   1. مؤكّد — الزبون قال "نعم" ويستنّى برك نقرة قبول. أسرع فلوس عندك.
 *   2. يستاهل مكالمة — الشغل الحقيقي، الأقدم الأوّل.
 *   3. واقف — قرار، ماشي مكالمة. تحت الشغل الحيّ باش ما يزحموهش.
 *   4. ينتظر موعدو — يبان باش تعرف واش جاي، ما يخدمش دروك.
 */
const RANK = { confirmed: 0, due: 1, stalled: 2, waiting: 3, closed: 4 };

export function sortQueue(rows, now = Date.now()) {
  return rows.slice().sort((a, b) => {
    const rank = RANK[queueStateOf(a, now)] - RANK[queueStateOf(b, now)];
    return rank !== 0 ? rank : dueAt(a) - dueAt(b);
  });
}

/**
 * ملخّص الصفّ — الأرقام اللي تبان فوق الصفحة وفي بادج القائمة الجانبية.
 * يتحسب من نفس الحساب تاع الترتيب، باش الرقم اللي تشوفو فوق يطابق
 * السطور اللي تحتو بالضبط.
 */
export function queueCounts(rows, now = Date.now()) {
  const counts = { confirmed: 0, due: 0, stalled: 0, waiting: 0, total: 0 };
  for (const row of rows) {
    const state = queueStateOf(row, now);
    if (state === 'closed') continue;
    counts[state]++;
    counts.total++;
  }
  return counts;
}

/* ── التخزين ──────────────────────────────────────────────────────── */

/**
 * يسجّل مكالمة على طلب. يرجع الطلب الجديد، ولا null إذا الطلب ما كانش
 * ولا النتيجة ماشي معروفة.
 *
 * ⚠️ ما يقرّرش الطلب: حتى "جاوب وأكّد" تخلّيه pending. القبول ينقّص
 * المخزون ويبعث إشعارات — قرار وحدو، بنقرة وحدها (شوف decisions.mjs).
 */
export async function logOrderCall(orderId, input) {
  const order = await getOrder(orderId);
  if (!order) return null;
  const patch = appendCall(order, input);
  if (!patch) return null;
  return updateOrder(orderId, patch);
}
