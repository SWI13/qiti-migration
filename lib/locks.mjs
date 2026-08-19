/*
 * قفل قصير على قرار طلب — باش نقرتين ما يديروش الشغل مرّتين.
 *
 * ── المشكل اللي يحلّو ──────────────────────────────────────────────
 * كل قرار في decisions.mjs مبني على "اقرا الحالة، شوفها pending، اكتب".
 * بين القراية والكتابة كاين نافذة. في تيليغرام هاذي النافذة ماشي
 * نظرية: الزرّ يبقى بايّن حتى تتعاود ترسم الرسالة، والرسم يستنّى
 * نداء الطردة (8 ثواني مهلة). نقرة ثانية في الوقت هذاك تلقى الطلب
 * لسّا pending — فيعدّيو الزوج:
 *
 *   • المخزون ينقص مرّتين على طلبية وحدة
 *   • زوج طرود يتخلقو لنفس الطلب عند الموصّل
 *   • Purchase يتبعث مرّتين لميتا
 *
 * ── الحلّ ──────────────────────────────────────────────────────────
 * SET NX ذرّي في Redis: أوّل واحد ياخذ المفتاح ويخدم، والثاني يلقاه
 * مشغول ويرجع بلا ما يدير والو. المفتاح عندو TTL باش فنكشن تموت في
 * النصّ ما تقفلش الطلب للأبد.
 *
 * ⚠️ القفل يتحلّ كي الشغل يفشل فشل متوقّع (المخزون ما يكفيش): الطلب
 * ما تبدّلش، فلازم تقدر تعاود بعد ما تزوّد. الفشل اللي بدّل الحالة
 * ما يحتاجش حلّ — فحص الحالة روحو يمنع الثانية.
 */
import { getStore } from './blobs.mjs';

const LOCKS = 'decision-locks';
const store = () => getStore(LOCKS);

/*
 * 60 ثانية: أطول من أي قرار (نداء الطردة 8 ثواني، الرسم 10، لقطة
 * التكاليف قراية ولا زوج)، وأقصر من صبر واحد يعاود يجرّب كي يشوف
 * بلّي والو ما صرا.
 */
export const LOCK_TTL_SECONDS = 60;

const keyFor = (orderId, action) => `${orderId}:${action}`;

/**
 * يحاول ياخذ القفل. `true` = انت اللي شدّيتو، كمّل. `false` = واحد
 * آخر راه يخدم على نفس القرار دروك.
 *
 * ⚠️ فشل التخزين يرجّع `true` قصداً: القفل تحسين، ماشي شرط. Redis
 * يطيح؟ نرجعو للسلوك القديم (فحص الحالة وحدو) بدل ما نمنعو المشغّل
 * من قبول طلباتو.
 */
export async function claim(orderId, action) {
  if (!orderId || !action) return true;
  try {
    const { modified } = await store().setJSON(
      keyFor(orderId, action),
      { at: new Date().toISOString() },
      { onlyIfNew: true, ttlSeconds: LOCK_TTL_SECONDS },
    );
    return modified;
  } catch (error) {
    console.error('Decision lock failed, proceeding without it:', error.message, '| order:', orderId);
    return true;
  }
}

/** يحلّ القفل — يتنادى غير كي الشغل يفشل وما بدّل حتى حاجة */
export async function release(orderId, action) {
  if (!orderId || !action) return;
  await store().delete(keyFor(orderId, action))
    .catch((error) => console.error('Decision unlock failed:', error.message, '| order:', orderId));
}

/**
 * يلفّ شغل قرار بقفل. يرجّع `busy` كي يكون واحد آخر راه يخدم عليه.
 *
 * `work()` ترجّع `{ ok }` كيما باقي decisions.mjs — و`ok:false` معناه
 * الحالة ما تبدّلتش، فالقفل يتحلّ باش الإعادة تخدم.
 *
 * ── `holdOnSuccess` ────────────────────────────────────────────────
 * بالتلقائي القفل يبقى شادّ حتى يفوت وقتو، حتى بعد النجاح: القبول
 * والتوصيل عندهم آثار برّانية (المخزون ينقص، طردة تتخلق، Purchase
 * يتبعث لميتا)، وإعادتهم تضرّ حتى لو فحص الحالة يمنعها.
 *
 * ⚠️ القرار اللي عندو عكس مباشر لازم يحلّ. `void` و`unvoid` يشدّو نفس
 * المفتاح — لازم، وإلا الزوج يتصادمو — وبالقفل الشادّ، تلغي طلب ومن
 * بعد تحاول ترجّعو في نفس الدقيقة فتلقى "راه يتعالج دروك". وهاذي
 * بالضبط الحركة اللي يديرها واحد غلط. ما عندهمش آثار برّانية،
 * وفحص الحقل وحدو يكفي، فيحلّو بعد النجاح.
 */
export async function withClaim(orderId, action, work, busy, { holdOnSuccess = true } = {}) {
  if (!await claim(orderId, action)) return busy;

  let result;
  try {
    result = await work();
  } catch (error) {
    await release(orderId, action);
    throw error;
  }

  if (!result?.ok || !holdOnSuccess) await release(orderId, action);
  return result;
}
