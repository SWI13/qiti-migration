/*
 * يستقبل "الطلب اللي ما كملش" من فورم `#orderForm`.
 *
 * الصفحة تنادي هذا المسار ساعة ما رقم التيليفون يولّي صحيح، ومن بعد
 * كل ما يتبدّل حقل — بلا ما يكليكي الزبون على والو. إذا كمّل الطلب،
 * `api/order.mjs` يعلّم الـ lead `converted`. إذا لا، يبقى في /leads.
 *
 * ── واش هذا المسار **ما يديروش** ─────────────────────────────────────
 *
 *  • ما يبعثش تيليغرام على كل حفظ. أوّل رسالة تستنّى إشارة `idle`
 *    (سكت دقيقتين) ولا `leaving` (خرج من الصفحة) — الزبون اللي راه
 *    يعمّر الفورم عادي ماشي "ما كملش".
 *  • ما يصنعش رسالة جديدة في كل مرّة. بعد أوّل وحدة، الحفظ يبدّلها
 *    في بلاصتها (notifyLead في lib/leads.mjs) — وإلا أربع حقول
 *    يعطيو أربع رسائل على نفس الزبون.
 *  • ما يحسبش سومة ولا ينقص مخزون. الـ lead ماشي طلب، وما يلزموش
 *    يشبهلو — البلاصة الوحيدة اللي تصنع طلب هي order.mjs.
 *  • ما يرجّعش معلومة على الـ lead للمتصفّح. الجواب ديما { ok: true }،
 *    حتى كي الرقم محظور: أي جواب مختلف يولّي هذا المسار أداة تفحص بيها
 *    الأرقام من برّا.
 */
import { normalizeDzPhone, getBlockEntry } from '../lib/store.mjs';
import {
  saveLead, getLead, forgetLead, sweepLeads, notifyLead, dismissLead, NOTIFY_AFTER_SECONDS,
} from '../lib/leads.mjs';
import { sanitizeAttribution, channelKey, channelLabel } from '../lib/attribution.mjs';
import { getProduct } from '../lib/catalog.mjs';
import { toVercel } from '../lib/http.mjs';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

/* حدود الطول — نفس اللي في order.mjs. الـ lead يتخزّن بلا تحقّق كامل
   (نصف فورم ماشي غالط)، بصح ما نخزّنوش نص بلا حدّ. */
const trim = (value, max) => String(value ?? '').trim().slice(0, max);

async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'طلب ماشي صحيح.' });
  }

  /* فخّ البوتات — نفس الحقل المخبّي تاع الطلب. نجاوبو بنجاح باش ما يعاودش. */
  if (payload.website) return json(200, { ok: true });

  const phone = normalizeDzPhone(payload.phone);
  /* رقم ماشي صحيح = الزبون ما زال يكتب. ماشي خطأ، وما كاين والو نخزّنوه. */
  if (!phone) return json(200, { ok: true });

  /*
   * بدّل الرقم في نفس الجلسة: غالباً غلط في الكتابة وصحّحو، فالـ lead
   * القديم برقم غالط ما ينفعش — تعيّط عليه وتلقى واحد ما يعرفش عليك.
   *
   * ⚠️ نمسحو غير إذا ما وصلش عليه إشعار. كي تكون الرسالة تبعثت خلاص،
   * المسح يخلّي رسالة يتيمة في تيليغرام تشير لـ lead ما كاينش —
   * وزيادة على هذا، رقمين مختلفين من نفس الجهاز يقدرو يكونو زوج ناس
   * (الدار وحدة، التيليفون واحد).
   */
  const previous = normalizeDzPhone(payload.previousPhone);
  if (previous && previous !== phone) {
    const stale = await getLead(previous).catch(() => null);
    if (stale && !stale.notifiedAt && stale.status === 'open') {
      await forgetLead(previous).catch((err) => console.error('Stale lead cleanup failed:', err.message));
    }
  }

  const attribution = sanitizeAttribution(payload.attribution);

  /*
   * اسم المنتج يتخزّن كلقطة وقت الالتقاط — الإشعار يتبعث من بعد،
   * وما نحبّوهش يقلّب على المنتج ساعتها (نداء زايد، ومنتج تمسح
   * يخلّي الرسالة فارغة).
   */
  let productName = null;
  if (payload.productId) {
    const product = await getProduct(String(payload.productId)).catch(() => null);
    productName = product?.name ?? null;
  }

  const lead = await saveLead({
    phone,
    name: trim(payload.name, 80),
    wilaya: trim(payload.wilaya, 40),
    commune: trim(payload.commune, 60),
    shipping: payload.shipping === 'desk' ? 'desk' : 'home',
    qty: Math.max(1, Math.min(10, parseInt(payload.qty, 10) || 1)),
    productId: payload.productId ? String(payload.productId).slice(0, 64) : null,
    productName,
    campaignId: typeof payload.campaignId === 'string' ? payload.campaignId.slice(0, 64) : null,
    options: payload.options && typeof payload.options === 'object' ? payload.options : null,
    /* السومة اللي كانت بايّنة قدّامو — للعرض برك في الإشعار. ما تتحسبش
       هنا وما يتبنى عليها حتى قرار: الحساب الحقيقي في order.mjs. */
    cartTotal: Number.isFinite(payload.cartTotal) ? Math.max(0, Math.round(payload.cartTotal)) : null,
    attribution,
    channel: channelKey(attribution),
    channelLabel: channelLabel(attribution),
  }).catch((err) => {
    console.error('Failed to persist lead:', err.message, '| phone:', phone);
    return null;
  });

  /*
   * الإشعار — أوّل رسالة تستنّى إشارة، واللي من بعدها تبديل فوري.
   *
   * الصفحة تبعث `idle:true` كي يسكت الزبون NOTIFY_AFTER_SECONDS،
   * و`leaving:true` كي يخرج من الصفحة. بلا وحدة من هذو، الحفظ يصرا
   * بلا ما يتحرّك تيليغرام — الزبون اللي راه يعمّر الفورم عادي ما
   * يستاهلش رسالة "ما كملش".
   *
   * كي تكون الرسالة تبعثت خلاص (`messageId`)، كل حفظ يبدّلها فوراً:
   * ساعتها راك تشوف واحد معروف يزيد حقول، ماشي إشعار جديد.
   *
   * ⚠️ لازم `await`: في Vercel، أي خدمة تبقى بعد الجواب تتقتل —
   * و`message_id` يضيع، فالتبديل الجاي يبعث رسالة جديدة بدل ما يبدّل.
   */
  let notice = 'none';
  if (lead && lead.status === 'open') {
    const alreadySent = Boolean(lead.messageId);
    const wantsNotice = payload.idle === true || payload.leaving === true;
    /*
     * حاجز من جهة السيرفر: ما نثقوش في ساعة المتصفّح. الـ lead لازم
     * يكون عندو عمر حقيقي قبل أوّل إشعار — إلا إذا خرج من الصفحة،
     * وهذاك حكم نهائي بلا علاقة بالوقت.
     */
    const ageMs = Date.now() - new Date(lead.createdAt ?? Date.now()).getTime();
    const oldEnough = payload.leaving === true || ageMs >= NOTIFY_AFTER_SECONDS * 1000;

    if (alreadySent || (wantsNotice && oldEnough)) {
      /* رقم حظرتيه بيدك ما يستاهلش إشعار — حظرتيه لسبب */
      const blocked = await getBlockEntry(phone).catch(() => null);
      if (blocked) {
        notice = 'blocked';
        await dismissLead(phone).catch(() => {});
      } else {
        notice = alreadySent ? 'edited' : 'sent';
        await notifyLead(lead).catch((err) => {
          notice = 'failed';
          console.error('Lead notice failed:', err.message, '| phone:', phone);
        });
      }
    } else {
      /* علاش ما تبعثش — بلا هذا، "تيليغرام ما يبعثش" يولّي تخمين */
      notice = wantsNotice ? 'too-young' : 'waiting-for-silence';
    }
  } else if (lead) {
    notice = `status:${lead.status}`;
  }

  /* شبكة أمان لـ leads قدام فشل إشعارهم — ما ننتظروهاش */
  sweepLeads().catch(() => {});

  if (lead) {
    console.log(
      'Lead captured:', phone,
      '| filled:', [lead.name, lead.wilaya, lead.commune].filter(Boolean).length + 1,
      '| notice:', notice,
    );
  }
  return json(200, { ok: true });
}

export default toVercel(handler);
