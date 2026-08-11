/*
 * يستقبل "الطلب اللي ما كملش" من فورم `#orderForm`.
 *
 * الصفحة تنادي هذا المسار ساعة ما رقم التيليفون يولّي صحيح، ومن بعد
 * كل ما يتبدّل حقل — بلا ما يكليكي الزبون على والو. إذا كمّل الطلب،
 * `api/order.mjs` يعلّم الـ lead `converted`. إذا لا، يبقى في /leads.
 *
 * ── واش هذا المسار **ما يديروش** ─────────────────────────────────────
 *
 *  • ما يبعثش تيليغرام في نفس اللحظة. الزبون راه يكتب دروك — الإشعار
 *    يتبعث بعد سكوت 10 دقايق (شوف sweepLeads في lib/leads.mjs).
 *  • ما يحسبش سومة ولا ينقص مخزون. الـ lead ماشي طلب، وما يلزموش
 *    يشبهلو — البلاصة الوحيدة اللي تصنع طلب هي order.mjs.
 *  • ما يرجّعش معلومة على الـ lead للمتصفّح. الجواب ديما { ok: true }،
 *    حتى كي الرقم محظور: أي جواب مختلف يولّي هذا المسار أداة تفحص بيها
 *    الأرقام من برّا.
 */
import { normalizeDzPhone } from '../lib/store.mjs';
import { saveLead, forgetLead, sweepLeads } from '../lib/leads.mjs';
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
   * بدّل الرقم (غلط في الكتابة وصحّحو): الـ lead القديم يتمسح، وإلا
   * يبقى رقم غالط في اللائحة تعيّط عليه وتلقى واحد ما يعرفش عليك.
   */
  const previous = normalizeDzPhone(payload.previousPhone);
  if (previous && previous !== phone) {
    await forgetLead(previous).catch((err) => console.error('Stale lead cleanup failed:', err.message));
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
   * نركبو الكنس على هاذ النداء: كل زائر جديد يخدم كـ "ساعة" للـ leads
   * اللي حبسو قبلو. علاش ما كانش cron خاص — شوف التعليق في lib/leads.mjs.
   *
   * ما ننتظروهش (ولا نرجعو خطأ منّو): الزبون راه يكتب في الفورم، وما
   * يستاهلش يستنّى نداء تيليغرام باش يكمّل حرف.
   */
  sweepLeads().catch(() => {});

  if (lead) {
    console.log('Lead captured:', phone, '| filled:', [lead.name, lead.wilaya, lead.commune].filter(Boolean).length + 1);
  }
  return json(200, { ok: true });
}

export default toVercel(handler);
