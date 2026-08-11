/*
 * الطلبات اللي ما كملوش — "leads".
 *
 * المشكلة: الطلب ما يوجد حتى يكمّل الزبون الفورم كامل وينقر "أكّد".
 * الواحد يكتب اسمو ورقمو، يتلهّى، ويسكّر. من ناحيتنا ما صرا والو —
 * وحنا عندنا رقم تيليفون تاع واحد كان راه يشري.
 *
 * الحلّ: ساعة ما يولّي الرقم صحيح، نسجّلو "lead". إذا كمّل، يولّي طلب
 * عادي والـ lead يتعلّم `converted`. إذا ما كمّلش، يبقى في لائحة تشوفها
 * بـ /leads وتعيّط للزبون.
 *
 * ── ثلاث قرارات تستاهل الشرح ─────────────────────────────────────────
 *
 * 1. المفتاح هو رقم التيليفون (منظّف)، ماشي id عشوائي.
 *    الزبون اللي يعاود يحلّ الصفحة ثلاث مرّات ما يصنعش ثلاث leads —
 *    نفس الرقم = نفس الشخص = سجلّ واحد يتحدّث. الطلبات عندها id
 *    عشوائي على خاطر زبون واحد يقدر يطلب مرّتين بصحّ؛ الـ lead لا:
 *    "واحد ما كملش" ما تتكرّرش.
 *
 * 2. TTL 30 يوم.
 *    الـ lead هو مادّة استرجاع، ماشي محاسبة. رقم تيليفون تاع واحد
 *    زار الصفحة قبل شهرين ما ينفع في والو، ويبقى معلومة شخصية مخزّنة
 *    بلا سبب. الطلبات تبقى للأبد؛ هذي لا.
 *
 * 3. التسجيل فوري، والإشعار يستنّى إشارة "حبس".
 *    الزبون العادي ياخذ دقيقتين ولا ثلاثة باش يعمّر الفورم — يقرا،
 *    يسأل مراتو على العنوان، يعاود يقرا السومة. لو بعثنا الإشعار كي
 *    يكتب رقمو، توصلك "ما كملش" على واحد راه قدّامك غادي يأكّد.
 *
 *    علاش نستنّاو **إشارتين** برك:
 *      • سكت NOTIFY_AFTER_SECONDS بلا ما يمسّ والو (المتصفّح روحو
 *        هو السّاعة — شوف main.js).
 *      • ولا خرج من الصفحة (سكّرها، ولا بدّل تطبيق في التيليفون).
 *
 *    ومن بعد ما توصل، **نفس الرسالة** تتبدّل كل ما يزيد حقل — ماشي
 *    وحدة جديدة. وكي يكمّل، تولّي "✅ كمّل الطلب".
 *
 *    ⚠️ إشعار جا بكري ما يضرّش: إذا رجع وكمّل، الرسالة روحها تتصحّح
 *    لـ "كمّل الطلب". هذا هو اللي يخلّينا نقدرو نبعثو كي يخرج من
 *    الصفحة بلا ما نخافو من الغلط.
 */
import { getStore } from './blobs.mjs';
import { normalizeDzPhone, algiersDate, getBlockEntry, listOrdersByPhone } from './store.mjs';
import { esc, dz, toE164Dz, elapsedLabel } from './message.mjs';

const LEADS = 'leads';
const leads = () => getStore(LEADS);

/** 30 يوم — بعدها الـ lead يمسح روحو. شوف القرار رقم 2 فوق. */
export const LEAD_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * قداش من ثانية بلا حركة قبل ما نعتبروه "حبس".
 *
 * دقيقتين: تحت هذا توصلك إشعارات على ناس راهم يكتبو عادي، وفوقو
 * تخسر الوقت اللي فيه الزبون ما زال قريب من التيليفون.
 */
export const NOTIFY_AFTER_SECONDS = 120;


/** الحقول اللي تعمّر الطلب — أساس حساب "قداش كمّل" */
export const LEAD_FIELDS = ['name', 'phone', 'wilaya', 'commune'];

/* ── حسابات نقيّة (بلا تخزين) — هذي اللي تتفحص في verify-leads ─────── */

/** قداش حقل عمّر من LEAD_FIELDS — يبان في الرسالة باش تعرف قداش قرّب يكمّل */
export const completeness = (lead) =>
  LEAD_FIELDS.filter((field) => String(lead?.[field] ?? '').trim().length > 0).length;

/**
 * واش هذا الـ lead يستاهل إشعار دروك؟
 *
 * ثلاث شروط: مفتوح، عمرو ما تبعث عليه إشعار، وساكت من
 * NOTIFY_AFTER_SECONDS. الشرط الثالث هو اللي يفرّق بين "حبس" و"راه
 * يكتب" — بلاه توصلك رسالة على كل واحد يعمّر رقمو.
 *
 * `leaving` تكسر شرط السكوت: خرج من الصفحة = حبس، مهما كان الوقت.
 */
export function dueForNotice(lead, now = Date.now(), { leaving = false } = {}) {
  if (!lead || lead.status !== 'open') return false;
  if (lead.notifiedAt) return false;
  if (leaving) return true;

  const last = new Date(lead.updatedAt ?? lead.createdAt ?? 0).getTime();
  if (!Number.isFinite(last)) return false;
  return now - last >= NOTIFY_AFTER_SECONDS * 1000;
}

/**
 * يدمج معطيات جديدة فوق lead موجود.
 *
 * ⚠️ القيم الفارغة ما تمسحش القديمة: الزبون يقدر يمسح البلدية باش
 * يعاود يكتبها، وما نحبّوش المسح المؤقّت هذا يخسّرنا معلومة كانت
 * عندنا خلاص.
 */
export function mergeLead(existing, incoming) {
  const merged = { ...(existing ?? {}) };
  for (const [key, value] of Object.entries(incoming ?? {})) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    merged[key] = value;
  }
  return merged;
}

/* ── التخزين ──────────────────────────────────────────────────────── */

/**
 * يسجّل ولا يحدّث lead. المفتاح هو الرقم المنظّف.
 * يرجع السجلّ المخزّن، ولا null إذا الرقم ماشي صحيح.
 */
export async function saveLead(input) {
  const phone = normalizeDzPhone(input?.phone);
  if (!phone) return null;

  const now = new Date();
  const existing = await getLead(phone);

  /*
   * الـ lead اللي ولّى طلب ما يرجعش "مفتوح" كي يعاود الزبون يحلّ
   * الصفحة — وإلا تعيّط لواحد خلّص خلاص.
   */
  if (existing?.status === 'converted') return existing;

  const record = mergeLead(existing, {
    ...input,
    phone,
    updatedAt: now.toISOString(),
  });

  record.createdAt = existing?.createdAt ?? now.toISOString();
  record.day = existing?.day ?? algiersDate(now);
  record.status = existing?.status ?? 'open';
  record.notifiedAt = existing?.notifiedAt ?? null;
  record.contactedAt = existing?.contactedAt ?? null;
  record.contactedBy = existing?.contactedBy ?? null;
  record.orderId = existing?.orderId ?? null;
  record.convertedAt = existing?.convertedAt ?? null;

  /* كل كتابة تجدّد الـ TTL — الـ lead يعيش 30 يوم من آخر حركة، ماشي
     من أوّل مرّة. واحد رجع بعد 20 يوم راه ما زال مهتم. */
  await leads().setJSON(phone, record, { ttlSeconds: LEAD_TTL_SECONDS });
  return record;
}

export async function getLead(phone) {
  const key = normalizeDzPhone(phone);
  if (!key) return null;
  return leads().get(key, { type: 'json' });
}

/** تعديل جزئي — يرجع السجلّ الجديد ولا null إذا ما كانش */
export async function updateLead(phone, patch) {
  const key = normalizeDzPhone(phone);
  if (!key) return null;
  const existing = await leads().get(key, { type: 'json' });
  if (!existing) return null;
  const merged = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await leads().setJSON(key, merged, { ttlSeconds: LEAD_TTL_SECONDS });
  return merged;
}

export async function forgetLead(phone) {
  const key = normalizeDzPhone(phone);
  if (!key) return false;
  await leads().delete(key);
  return true;
}

export async function listLeads() {
  const { blobs } = await leads().list();
  const records = await Promise.all(blobs.map((blob) => leads().get(blob.key, { type: 'json' })));
  return records.filter(Boolean).sort((a, b) =>
    String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
}

/** اللي ما كملوش ولا زالو ينتظرو مكالمة — أساس /leads وتقرير آخر النهار */
export async function listOpenLeads() {
  const all = await listLeads();
  return all.filter((lead) => lead.status === 'open');
}

/**
 * الزبون كمّل الطلب — الـ lead ما بقاش يستاهل مكالمة استرجاع.
 *
 * ⚠️ نخلّيوه مخزّن (ما نمسحوهش) على خاطر هو الدليل بلي الالتقاط
 * يخدم: قداش من lead ولّى طلب فعلاً. بلا هذا الرقم، ما تقدرش تعرف
 * واش هاذ الميزة تجيب فلوس ولا لا.
 */
export async function markLeadConverted(phone, orderId) {
  return updateLead(phone, {
    status: 'converted',
    orderId: orderId ?? null,
    convertedAt: new Date().toISOString(),
  });
}

export const markLeadContacted = (phone, by) =>
  updateLead(phone, { contactedAt: new Date().toISOString(), contactedBy: by ?? null });

export const dismissLead = (phone) => updateLead(phone, { status: 'dismissed' });

/* ── الرسالة والأزرار ─────────────────────────────────────────────── */

/**
 * رسالة الإشعار — بنفس شكل رسالة الطلب باش عينك تقراها بنفس الطريقة.
 *
 * ⚠️ نفس **الشكل**، ماشي نفس **الأزرار**. هذا ماشي طلب: ما كاينش قبول
 * ولا رفض، على خاطر نقرة "قبول" على واحد عمرو ما طلب تصنع طلبية وهمية
 * وتنقص المخزون. الأزرار هنا كامل حاجة وحدة: كيفاش توصلو.
 */
export function leadMessage(lead) {
  const filled = completeness(lead);
  const done = lead.status === 'converted';

  const lines = [done ? '<b>✅ كمّل الطلب — Qiti</b>' : '<b>🟠 طلب ما كملش — Qiti</b>', ''];

  lines.push(`<b>${lead.name ? esc(lead.name) : 'بلا اسم'}</b>`);
  /* الرقم نص عادي قصداً — تيليغرام يديرو قابل للنقر باش تعيّط منّو
     مباشرةً. <code> يديرو نسخ برك (نفس السبب في message.mjs). */
  lines.push(`📞 ${esc(toE164Dz(lead.phone))}`);

  if (lead.wilaya) lines.push(`📍 ${esc(lead.wilaya)}${lead.commune ? ` / ${esc(lead.commune)}` : ''}`);
  if (lead.productName) lines.push(`🛒 ${esc(lead.productName)}${lead.qty > 1 ? ` — الكمية ×${lead.qty}` : ''}`);
  if (lead.channelLabel) lines.push(`📣 ${esc(lead.channelLabel)}`);

  if (typeof lead.cartTotal === 'number' && lead.cartTotal > 0) {
    lines.push('', `<b>السلّة: ${dz(lead.cartTotal)}</b>${done ? '' : ' — ما تأكّدش'}`);
  }

  if (done) {
    lines.push('', `✅ <b>الطلب وصل</b>${lead.orderId ? ` — <code>${esc(lead.orderId)}</code>` : ''}`);
    lines.push('<i>ما تعيّطلوش على هذا — راه في لائحة الطلبات.</i>');
    return lines.join('\n');
  }

  lines.push(
    '',
    `✍️ عمّر ${filled} من ${LEAD_FIELDS.length} حقول، وما نقرش على "أكّد الطلب".`,
    `🕒 آخر حركة ${elapsedLabel(lead.updatedAt ?? lead.createdAt)}`,
  );

  if (lead.contactedAt) {
    lines.push(`📞 <b>تعيّطلو</b> — ${esc(lead.contactedBy ?? '')}`);
  }

  lines.push('', '<i>عيّطلو دروك — كل ساعة تعدّي تنقّص الفرصة.</i>');
  return lines.join('\n');
}

/*
 * الأزرار: واتساب باش تراسلو، وزوج أزرار تسجيل — "عيّطتلو" تخلّي
 * أثر (تعرف واش دار شكون وقتاش)، و"شطبو" تحيّدو من اللائحة.
 *
 * `callback_data` فيها الرقم — 10 أرقام + بادئة، بعيد على حدّ 64 بايت.
 */
export const leadButtons = (lead) => ({
  inline_keyboard: [
    [{ text: '💬 راسلو واتساب', url: `https://wa.me/${toE164Dz(lead.phone).replace('+', '')}` }],
    [
      { text: '📞 عيّطتلو', callback_data: `ldc:${lead.phone}` },
      { text: '🗑️ شطبو', callback_data: `ldx:${lead.phone}` },
    ],
  ],
});

/* ── الإشعار: رسالة وحدة تتحدّث في بلاصتها ────────────────────────── */

const TELEGRAM_TIMEOUT_MS = 10_000;

async function telegram(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(`Telegram ${method} ${response.status}: ${result.description ?? 'unknown error'}`);
  }
  return result.result;
}

/**
 * يبعث إشعار الـ lead، ولا يبدّل اللي تبعث من قبل.
 *
 * ⚠️ التبديل ماشي زينة: الزبون يعمّر الاسم، من بعد الولاية، من بعد
 * البلدية — بلا هذا يوليو ثلاث رسائل على نفس الواحد، والگروب يتعمّر
 * ويولّي ما يتقراش. رسالة وحدة تتحرّك = تشوف الطلب يتكوّن.
 *
 * نقارنو النص قبل ما نبعثو تبديل: تيليغرام يرمي خطأ على تعديل بلا
 * تبديل ("message is not modified")، وزيادة على هذا كاين حدّ للنداءات.
 */
export async function notifyLead(lead) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) return lead;

  const text = leadMessage(lead);
  if (lead.messageId && text === lead.lastText) return lead;

  /* الرسالة راهي موجودة — نبدّلوها في بلاصتها */
  if (lead.messageId) {
    await telegram('editMessageText', {
      chat_id: chatId,
      message_id: lead.messageId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: lead.status === 'converted' ? undefined : leadButtons(lead),
    });
    return updateLead(lead.phone, { lastText: text });
  }

  const sent = await telegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: leadButtons(lead),
  });

  return updateLead(lead.phone, {
    messageId: sent?.message_id ?? null,
    notifiedAt: new Date().toISOString(),
    lastText: text,
  });
}

/**
 * الزبون كمّل — نعلّمو ونبدّلو الرسالة لـ "✅ كمّل الطلب".
 * الرسالة تبقى في بلاصتها باش تشوف الرحلة كاملة، بلا أزرار مكالمة.
 */
export async function convertLead(phone, orderId) {
  const updated = await markLeadConverted(phone, orderId);
  if (!updated || !updated.messageId) return updated;
  return notifyLead(updated).catch((error) => {
    console.error('Lead conversion edit failed:', error.message, '| phone:', phone);
    return updated;
  });
}

/**
 * شبكة الأمان: leads مفتوحين وما وصلهمش إشعار (تيليغرام كان طايح،
 * الشبكة قطعت وسط النداء). يعاود يجرّب، ويرجع عدد اللي تبعثو.
 *
 * ⚠️ ما عندوش cron خاص بيه — خطّة Vercel Hobby تسمح بـ cron مرّة في
 * النهار برك. يركب على الحركة اللي كاينة: كل lead جديد، كل طلب،
 * وتقرير آخر النهار ينادوه. الإشعار العادي ما يستنّاش هذا أصلاً —
 * يتبعث فوراً من api/lead.mjs.
 *
 * ما يرمي خطأ عمرو: يتنادى من مسارات حسّاسة (تسجيل طلب)، وفشل إشعار
 * ما يقدرش يوقّف طلبية.
 */
export async function sweepLeads() {
  let sent = 0;
  try {
    const open = await listOpenLeads();
    /* ⚠️ بلا arrow، `filter` تعطي الفهرس كـ `now` والوقت يولّي 0/1/2 */
    const due = open.filter((lead) => dueForNotice(lead));
    if (!due.length) return 0;

    for (const lead of due) {
      /*
       * الأرقام اللي حظرتيها بيدك ما تستاهلش مكالمة — حظرتيهم لسبب.
       * نعلّموهم "مشطوبين" باش ما يعاودوش يبانو في اللائحة كل مرّة.
       */
      const blocked = await getBlockEntry(lead.phone).catch(() => null);
      if (blocked) {
        await dismissLead(lead.phone).catch(() => {});
        continue;
      }

      /*
       * آخر حاجز قبل ما نبعثو: واش هذا الرقم عندو طلب فعلاً؟
       *
       * order.mjs يعلّم الـ lead `converted` وحدو، بصح كاين حالة يفوتها:
       * beacon تاع سكّر الصفحة والطلب يتبعثو في نفس اللحظة، والـ beacon
       * يوصل لور — فيتصنع lead جديد "مفتوح" لواحد خلاص طلب.
       *
       * الفحص هنا وماشي في api/lead.mjs بقصد: هنا يتنادى على leads قلال
       * كل 10 دقايق، وثمّة يتنادى على كل ضربة زر تاع كل زائر.
       */
      const orders = await listOrdersByPhone(lead.phone).catch(() => []);
      if (orders.length) {
        const latest = orders.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0];
        await convertLead(lead.phone, latest?.id ?? null).catch(() => {});
        continue;
      }

      try {
        const after = await notifyLead(lead);
        if (after?.notifiedAt) sent++;
      } catch (error) {
        console.error('Lead notice failed:', error.message, '| phone:', lead.phone);
      }
    }
  } catch (error) {
    console.error('Lead sweep failed:', error.message);
  }
  return sent;
}
