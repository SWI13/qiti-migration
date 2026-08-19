/*
 * يستقبل نقرات الأزرار (تأكيد بالتيليفون / عيّطتُ وما جاوبش / قبول /
 * رفض / توصّل / رجعت / استلمت الرجعة / تأكيد ولا إلغاء /clear)، جواب
 * سبب الرفض، وأوامر المخزون/التكاليف/حالة الطلبات (/state, /stock,
 * /restock, /setstock, /cost, /clear) من تيليغرام.
 *
 * ⚠️ القرارات روحهم ما بقاوش هنا: قبول، رفض، نتيجة التوصيل واستلام
 * الرجعة ولّاو في lib/decisions.mjs، على خاطر صفّ المكالمات في اللوحة
 * يقرّر بنفسهم. هاذ الملف يقرا النقرة، ينادي القرار، ويجاوب الزرّ.
 * والمكالمات تتسجّل في lib/calls.mjs — نفس السجلّ في الجهتين.
 *
 * ── تأكيد بالتيليفون (قبل القبول) ───────────────────────────────────
 *   البحث كامل يقول نفس الحاجة: الطلبات اللي تتبعث بلا مكالمة تأكيد
 *   ترجع أكثر بـ 15-25 نقطة. علاش زدنا زر "📞 تأكدت بالتيليفون" يبان
 *   فوق أزرار القرار.
 *
 *   ما نمنعوش القبول بلا تأكيد قصداً — نسجّلو `confirmedBeforeAccept`
 *   على كل طلب مقبول، باش من بعد تقارن نسبة الرجعات بين المؤكّد وماشي
 *   المؤكّد، وتشوف بأرقامك انت واش المكالمة تستاهل الوقت ولا لا.
 *
 * ── قبول ─────────────────────────────────────────────────────────────
 *   نقرة → الرسالة تتبدّل وتزيد "✅ مقبول — شكون · الوقت"، أزرار القرار
 *   تتبدّل بزوج أزرار "📦 توصّل" / "↩️ رجعت" (زر واتساب يبقى)، والمخزون
 *   ينقص بكمية الطلب. إذا هبط للحد ولا تحتو، يتبعث تنبيه مخزون وحدة برك.
 *   وإذا المخزون ما يكفيش قبل القبول، القبول يتردّ والطلب يبقى بلا قرار.
 *
 * ── رفض ──────────────────────────────────────────────────────────────
 *   نقرة → البوت يردّ على الرسالة ويطلب السبب (ForceReply، يحلّ الكيبورد
 *   مباشرة). كي تكتب السبب، رسالة الطلب تتبدّل وتزيد "❌ مرفوض" + السبب،
 *   ورسالة السؤال تتمسح.
 *
 * ── توصّل / رجعت (بعد القبول) ──────────────────────────────────────
 *   الطلب يبقى "مقبول" لأيام قبل ما نعرفو واش وصل فعلاً ولا رجع مع
 *   المُوصّل — علاش الأزرار تبقى بايّنة في نفس الرسالة، وتبان في /state
 *   وتقرير آخر النهار حتى لو ماشي من نفس اليوم.
 *
 *   "رجعت" ما تزيدش المخزون فوراً — غير تعلّم إنو المُوصّل رجّعها. الطلبية
 *   فيزيائياً تاخذ يوم ولا يومين باش توصل لعندك، فتبان زر جديد "📥 استلمت
 *   الرجعة" — هو اللي يزيد الكمية للمخزون فعلياً، كي تتأكّد إنها بين يديك.
 *
 * الحالة كاملة تتخزّن في Netlify Blobs باش /state وتقرير آخر النهار يقراوها.
 *
 * ── environment variables ────────────────────────────────────────────
 *   TELEGRAM_BOT_TOKEN       — نفس التوكن تاع order.mjs
 *   TELEGRAM_WEBHOOK_SECRET  — كلمة سرّ تخترعها انت (أي نص عشوائي)
 *   TELEGRAM_CHAT_ID         — نفس id تاع order.mjs، يخدم هنا باش يحصر
 *                              الأوامر (/state, /stock...) في الگروب/الشات تاعك برك
 *
 * ── تشبيك الـ webhook (مرّة وحدة بعد الـ deploy) ─────────────────────
 *   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *     -d "url=https://<موقعك>/api/telegram-webhook" \
 *     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
 */
import {
  getOrder, rememberReplyPrompt, resolveReplyPrompt, forgetReplyPrompt,
  resetStock,
  listOrders, listPendingOrders, listAwaitingDelivery, listAwaitingReturnReceipt,
  getCosts, setCost, clearAllOrders, clearAllReplyPrompts,
  blockPhone, unblockPhone, listBlocked, normalizeDzPhone,
  saveProductDraft, getProductDraft, forgetProductDraft,
  listOrdersByPhone,
} from '../lib/store.mjs';
import {
  listOpenLeads, getLead, markLeadContacted, dismissLead, updateLead, forgetLead,
  completeness, leadMessage, LEAD_FIELDS,
} from '../lib/leads.mjs';
import { parseProductIntent } from '../lib/product-intent.mjs';
/* عرض المخزون مشترك مع التقرير اليومي — رقمين مختلفين بنفس الاسم
   كانو يخرجو من زوج نسخ من نفس المنطق (شوف lib/stock-view.mjs) */
import { stockTargets, stockLines } from '../lib/stock-view.mjs';
import { esc, dz, elapsedLabel, toE164Dz, dzTime } from '../lib/message.mjs';
/*
 * القرارات (قبول، رفض، توصيل، استلام الرجعة) ما بقاوش يسكنو هنا —
 * اللوحة تقرّر تاني، فولّاو في lib/decisions.mjs. هنا يبقى غير شغل
 * تيليغرام: تقرا النقرة، تنادي القرار، وتجاوب الزرّ.
 */
import {
  confirmOrder, acceptOrder, denyOrder, setDeliveryOutcome, receiveReturn, MAX_REASON_LENGTH,
  unvoidOrder, purgeOrder, purgeOrdersByPhone,
} from '../lib/decisions.mjs';
import { logOrderCall, callsOf } from '../lib/calls.mjs';
/* الطوق: هجرة العدّاد العام لمنتج حقيقي — تصرا مرّة وحدة وتنادى من
   كل بلاصة يقدر يبدا منها المشغّل (شوف lib/legacy-stock.mjs) */
import { ensureLegacyProduct } from '../lib/legacy-stock.mjs';
import { telegram, repaintOrderQuietly } from '../lib/telegram.mjs';
import {
  getProduct, listProducts, listStockFor, adjustVariantStock, setVariantStock,
  saveProduct, saveCategory, listCategories, availableSlug, deleteProduct,
} from '../lib/catalog.mjs';
import { guessPreset, findPreset } from '../lib/category-presets.mjs';
/*
 * ⚠️ هاذو كانو مستعملين في /ship و/sync وما كانوش مستوردين أصلاً.
 *
 * ESM في وضع صارم: نداء اسم ما تعرّفش يرمي ReferenceError وقت التشغيل
 * (ماشي وقت التحليل — `node --check` يعدّي عادي، علاش عاش العطب).
 * والـ try/catch الكبير في `handler` يبلع الخطأ ويرجّع 200 لتيليغرام.
 * النتيجة اللي شافها المشغّل: تكتب /ship ولا /sync ويجيك **سكات
 * كامل** — لا طردة، لا رسالة خطأ، لا حتى علامة بلّي صرا شي.
 */
import { sendShipment, cancelShipment } from '../lib/ecotrack/shipments.mjs';
import { syncOpenShipments, retryFailedShipments } from '../lib/ecotrack/sync.mjs';
import { shipmentCreated, shipmentCancelled } from '../lib/notify.mjs';
import { getSettings, saveSettings } from '../lib/settings.mjs';
import { WILAYAS, wilayaId } from '../lib/wilayas.mjs';
import { siteUrl } from '../lib/site.mjs';
import { authorized as cronAuthorized } from '../lib/cron-auth.mjs';
import { toVercel } from '../lib/http.mjs';

const displayName = (from) =>
  [from?.first_name, from?.last_name].filter(Boolean).join(' ') || 'مجهول';

/** تأكيد/إلغاء /clear — فعل عام ماشي مربوط بطلب وحدو، علاش معزول برّا منطق الطلبات */
async function handleClearConfirmation(query, confirmed) {
  const message = query.message;
  const answer = (text) =>
    telegram('answerCallbackQuery', { callback_query_id: query.id, ...(text ? { text } : {}) })
      .catch((error) => console.error('answerCallbackQuery failed:', error.message));

  if (!confirmed) {
    await telegram('editMessageText', {
      chat_id: message.chat.id, message_id: message.message_id,
      text: '❌ تراجعت — ما تبدّل حتى حاجة.',
    }).catch(() => {});
    return answer('تمّ التراجع ✅');
  }

  try {
    const deletedCount = await clearAllOrders();
    await clearAllReplyPrompts().catch((error) => console.error('clearAllReplyPrompts failed:', error.message));
    await resetStock();
    await telegram('editMessageText', {
      chat_id: message.chat.id, message_id: message.message_id,
      text: `🗑️ <b>تمسح كلش</b> — ${deletedCount} طلب اتمسحو، والمخزون رجع لصفر.`,
      parse_mode: 'HTML',
    }).catch(() => {});
    return answer('تمسح كلش 🗑️');
  } catch (error) {
    console.error('/clear failed:', error.message);
    return answer('حدث خطأ، أعد المحاولة.');
  }
}

/*
 * ── تأكيد /void ─────────────────────────────────────────────────
 *
 * المحو بلا تراجع، علاش يمرّ بزوج أزرار كيما /clear. الرقم يسافر في
 * `callback_data` روحو (`vdo:260819-a1b2c` ولا `vdp:0661445566`) —
 * زوجهم تحت 64 بايت، فما يلزمش تخزين وسط الطريق.
 *
 * ⚠️ محصور في شات المالك — نفس قاعدة النشر وحذف المنتج: الفعل يمسح
 * بيانات بلا رجعة، فما نعتمدوش على "شكون يوصلو الزر" وحدها.
 */
async function handleVoidConfirmation(query, kind, target, answer) {
  const message = query.message;
  const who = displayName(query.from);

  const ownerChatId = process.env.TELEGRAM_CHAT_ID;
  if (!ownerChatId || String(message.chat.id) !== String(ownerChatId)) {
    return answer('ليست لديك الصلاحية.');
  }

  const edit = (text) => telegram('editMessageText', {
    chat_id: message.chat.id, message_id: message.message_id, text, parse_mode: 'HTML',
  }).catch(() => {});

  if (kind === 'vdn') {
    await edit('❌ تراجعت — ما تمسح والو.');
    return answer('تمّ التراجع ✅');
  }

  try {
    if (kind === 'vdo') {
      const result = await purgeOrder(target, { by: who });
      if (!result.ok) return answer(result.error);
      await edit(L_VOID_DONE([result], who, { phone: result.order.phone }));
      return answer('تمسح 🗑️');
    }

    const { ok, error, purged, failed } = await purgeOrdersByPhone(target, { by: who });
    if (!ok && !purged.length) return answer(error ?? failed[0]?.error ?? 'ما تمسح والو.');

    /* السلّة المفتوحة تاع نفس الرقم تمشي معاهم — وإلا الزبون يرجع
       يتنبّه عليه في /leads وطلباتو راهم ممسوحين */
    await forgetLead(target).catch((error2) =>
      console.error('Lead cleanup after /void failed:', error2.message, '| phone:', target));

    await edit(L_VOID_DONE(purged, who, { phone: target, failed }));
    return answer(`تمسحو ${purged.length} 🗑️`);
  } catch (error) {
    console.error('/void failed:', error.message, '| target:', target);
    return answer('حدث خطأ، أعد المحاولة.');
  }
}

/*
 * واش رايح يصرا كي ينقر "نعم" — مكتوب قبل، ماشي بعد.
 *
 * ⚠️ التأكيد اللي يقول "متأكد؟" برك يخلّي المشغّل ينقر بلا ما يعرف
 * بلّي الطردة رايحة تتلغى والمخزون رايح يرجع. الثلاث خطوات مكتوبين
 * بالأرقام باش النقرة تكون على شي معروف.
 */
const voidPlan = (orders) => {
  const tracked = orders.filter((order) => order?.shipment?.tracking).length;
  const restocking = orders.filter((order) => order.status === 'accepted' && !order.returnReceivedAt).length;

  return [
    '<b>الخطوات:</b>',
    tracked
      ? `1️⃣ إلغاء ${tracked} طردة عند الموصّل`
      : '1️⃣ ما كاين حتى طردة عند الموصّل',
    restocking
      ? `2️⃣ ترجيع سلعة ${restocking} طلب للمخزون`
      : '2️⃣ المخزون ما يتبدّلش (ما كانش ناقص منّو والو)',
    '3️⃣ محو الطلب من التخزين',
  ];
};

/* واش صرا للطردة في كل طلب — كلمة وحدة يفهمها المشغّل */
const SHIPMENT_RESULT = {
  cancelled: 'الطردة تمسحت عند الموصّل',
  return_asked: 'طلبنا رجعة الطردة',
  final: '⚠️ الطردة كملت — ما تلغاتش',
  none: null,
};

const L_VOID_DONE = (purged, who, { phone = null, failed = [] } = {}) => {
  const restocked = purged.reduce((sum, row) => sum + row.restocked, 0);

  return [
    '🗑️ <b>تمسح نهائياً</b>',
    '',
    ...(phone ? [`الرقم: <code>${esc(phone)}</code>`] : []),
    ...purged.map((row) => {
      const note = SHIPMENT_RESULT[row.shipment];
      return `• <code>${esc(row.order.id)}</code>${note ? ` — ${esc(note)}` : ''}`;
    }),
    `مسحو: ${esc(who)}`,
    '',
    restocked
      ? `📦 رجّعنا <b>${restocked}</b> للمخزون.`
      : '📦 المخزون ما تبدّلش — الطلب ما كانش ناقص منّو والو.',
    'ما بقى منهم والو — لا في اللوحة، لا في التقارير، لا في تاريخ الزبون.',
    ...(failed.length ? ['', '⚠️ <b>ما تمسحوش:</b>',
      ...failed.map((row) => `• <code>${esc(row.id)}</code> — ${esc(row.error)}`)] : []),
  ].join('\n');
};

/*
 * "🚀 انشر" تحت منتج تصنع بـ /newproduct — يقلب status لـ active.
 *
 * ⚠️ محصور في شات المالك: نقرات الطلبات ما تحتاجش هاذ الفحص (الرسالة
 * روحها ما تتبعث غير للمالك)، بصح النشر يبدّل حاجة يشوفها الزبون، فما
 * نعتمدوش على "شكون يوصلو الزر" وحدها.
 */
async function handlePublishProduct(query, productId, answer) {
  const ownerChatId = process.env.TELEGRAM_CHAT_ID;
  if (!ownerChatId || String(query.message.chat.id) !== String(ownerChatId)) {
    return answer('ليست لديك الصلاحية.');
  }

  try {
    const product = await getProduct(productId);
    if (!product) return answer('المنتج ماشي موجود.');
    if (product.status === 'active') return answer('منشور مسبقاً.');

    const published = await saveProduct({ ...product, status: 'active' });
    const site = siteUrl();

    /* الزر يتحيّد بعد النشر — زر يعاود يدير حاجة مدارة يخلّي التاجر
       يشكّ واش خدمت ولا لا */
    await telegram('editMessageText', {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      /* query.message.text راهو النص **بعد** ما تيليغرام حلّ الـ HTML —
         نص خام. نعاودو نهربوه قبل ما نبعثوه بـ parse_mode HTML، وإلا
         اسم منتج فيه & ولا < يرجّع الطلب بخطأ من تيليغرام. */
      text: `${esc(query.message.text ?? '')}\n\n🚀 <b>تنشر</b> — ${esc(displayName(query.from))}`
        + (site ? `\n${site}/p/${esc(published.slug)}` : ''),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }).catch((error) => console.error('Publish repaint failed:', error.message));

    return answer('نُشر في المتجر 🚀');
  } catch (error) {
    console.error('Publish failed:', error.message, '| product:', productId);
    return answer('حدث خطأ، أعد المحاولة.');
  }
}

/* ── أزرار "طلب غير مكتمل" ──────────────────────────────────────────
 *
 * زوج أفعال برك، وبقصد: هذا ماشي طلب، فما كاينش "قبول" ولا "رفض" —
 * كاين "عيّطتلو" (تخلّي أثر: شكون ووقتاش) و"شطبو" (يخرج من اللائحة).
 *
 * الرسالة تتبدّل في بلاصتها بدل ما نبعثو وحدة جديدة — باش الگروب ما
 * يتعمّرش برسائل على نفس الزبون.
 */
async function handleLeadAction(query, phone, action, who, answer) {
  const message = query.message;
  const lead = await getLead(phone).catch(() => null);
  if (!lead) return answer('هذا السجل لم يعد موجوداً.');

  const updated = action === 'ldc'
    ? await markLeadContacted(phone, who).catch(() => null)
    : await dismissLead(phone).catch(() => null);

  if (!updated) return answer('تعذّر التسجيل، أعد المحاولة.');

  const stamp = action === 'ldc'
    ? `📞 <b>اتصل به ${esc(who)}</b> · ${dzTime(new Date())}`
    : `🗑️ <b>حذفه ${esc(who)}</b> · ${dzTime(new Date())}`;

  /* نعاودو نبنيو الرسالة من السجلّ، ما ناخذوش نص تيليغرام: هو يجي بلا
     تنسيق (الـ HTML يتحيّد)، فالبناء من المصدر يخلّي الشكل ثابت — نفس
     المنطق تاع رسائل الطلبات. */
  const text = `${leadMessage(updated)}\n\n${stamp}`;
  /* نخزّنو النص باش notifyLead ما يعاودش يبدّل بلا داعي من بعد */
  await updateLead(phone, { lastText: text }).catch(() => {});

  await telegram('editMessageText', {
    chat_id: message.chat.id,
    message_id: message.message_id,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    /* بعد "عيّطتلو" يبقى زر واتساب برك؛ بعد "شطبو" ما يبقى حتى زر */
    ...(action === 'ldc'
      ? {
          reply_markup: {
            inline_keyboard: [[{
              text: '💬 مراسلته على واتساب',
              url: `https://wa.me/${toE164Dz(phone).replace('+', '')}`,
            }]],
          },
        }
      : {}),
  }).catch((error) => console.error('Lead message edit failed:', error.message));

  return answer(action === 'ldc' ? 'تمّ التسجيل ✅' : 'تمّ الحذف 🗑️');
}

/** لائحة /leads — الطلبات اللي ما كملوش، الأحدث أوّل */
async function buildLeadsMessage() {
  const open = await listOpenLeads();

  if (!open.length) {
    return [
      '<b>🔔 طلبات غير مكتملة</b>',
      '',
      'لا يوجد أي واحد ✅',
      '',
      '<i>كل من يُدخل رقماً صحيحاً ثم يتوقف يُسجَّل هنا تلقائياً.</i>',
    ].join('\n');
  }

  const lines = [`<b>🔔 طلبات غير مكتملة — ${open.length}</b>`, ''];

  for (const lead of open) {
    const name = lead.name ? esc(lead.name) : 'بدون اسم';
    const place = lead.wilaya ? ` — ${esc(lead.wilaya)}` : '';
    const called = lead.contactedAt ? ' 📞 تمّ الاتصال' : '';
    lines.push(
      `• <b>${name}</b>${place} — ${completeness(lead)}/${LEAD_FIELDS.length} حقول${called}`,
      `  ${esc(toE164Dz(lead.phone))} · ${elapsedLabel(lead.updatedAt ?? lead.createdAt)}`,
    );
  }

  const worth = open.reduce((sum, lead) => sum + (lead.cartTotal ?? 0), 0);
  if (worth > 0) {
    lines.push('', '➖➖➖➖➖➖➖➖', `💵 مجموع السلات: <b>${dz(worth)}</b>`);
  }

  return lines.join('\n');
}

/* ── نقرة زر ─────────────────────────────────────────────────────── */
async function handleCallback(query) {
  const message = query.message;
  const data = String(query.data ?? '');

  if (data === 'clear-yes' || data === 'clear-no') {
    if (!message) return;
    return handleClearConfirmation(query, data === 'clear-yes');
  }

  const [action, orderId] = data.split(':');
  const who = displayName(query.from);

  const answer = (text) =>
    telegram('answerCallbackQuery', { callback_query_id: query.id, ...(text ? { text } : {}) })
      .catch((error) => console.error('answerCallbackQuery failed:', error.message));

  /* أفعال الكاتالوغ — ماشي طلبات، فيخرجو قبل منطق الطلبات */
  if (action === 'pub') {
    if (!message) return;
    return handlePublishProduct(query, orderId, answer);
  }
  if (action === 'mk' || action === 'mkx') {
    if (!message) return;
    return handleDraftDecision(query, orderId, action === 'mk', answer);
  }
  if (action === 'rm') {
    if (!message) return;
    return handleDeleteProduct(query, orderId, answer);
  }

  /* محو نهائي — `orderId` هنا يكون id تاع طلب ولا رقم هاتف حسب الفعل */
  if (action === 'vdo' || action === 'vdp' || action === 'vdn') {
    if (!message) return;
    return handleVoidConfirmation(query, action, orderId, answer);
  }

  /*
   * أزرار الـ leads — `orderId` هنا هو رقم التيليفون، ماشي id تاع طلب
   * (المفتاح تاع الـ lead هو الرقم — شوف lib/leads.mjs).
   */
  if (action === 'ldc' || action === 'ldx') {
    if (!message) return;
    return handleLeadAction(query, orderId, action, who, answer);
  }

  const isDecision = action === 'ok' || action === 'no';
  const isDeliveryOutcome = action === 'del' || action === 'ret';
  const isReturnReceipt = action === 'rcv';
  const isConfirm = action === 'cnf';
  const isCallLog = action === 'cll';
  if (!message || (!isDecision && !isDeliveryOutcome && !isReturnReceipt && !isConfirm && !isCallLog)) {
    return answer();
  }

  /*
   * من هنا لتحت، كل فعل ينادي lib/decisions.mjs ويترجم النتيجة لجواب
   * زرّ. الفحوصات ("مقبول مسبقاً"، "المخزون ما يكفيش") ولّاو تمّة —
   * اللوحة تحتاجهم كيما تيليغرام بالضبط، والفحص المكرّر هو اللي ينسى.
   *
   * `chatId` يجي من الرسالة روحها ماشي من البيئة: النقرة تقدر تجي من
   * شات آخر، والرسم المجدّد لازم يصيب الرسالة اللي تنقرت.
   */
  const chatId = message.chat.id;

  /*
   * تأكيد بالتيليفون — يتسجّل برك، ما يقرّرش الطلب. الطلب يبقى pending
   * وأزرار القبول/الرفض تبقى، غير زر التأكيد يختفي.
   */
  if (isConfirm) {
    const result = await confirmOrder(orderId, { by: who, chatId })
      .catch((error) => {
        console.error('Confirm failed:', error.message, '| order:', orderId);
        return { ok: false, error: 'حدث خطأ، أعد المحاولة.' };
      });
    return answer(result.ok ? 'سُجِّل التأكيد 📞' : result.error);
  }

  /*
   * "عيّطتُ وما جاوبش" — محاولة تتزاد للسجلّ، والمهلة الجاية تتحسب
   * وحدها. باقي النتائج (مشغول، مطفي، طلب معاودة) في صفّ المكالمات
   * في اللوحة؛ هنا النتيجة الأكثر تكراراً برك (شوف orderButtons).
   */
  if (isCallLog) {
    const updated = await logOrderCall(orderId, { outcome: 'no-answer', by: who })
      .catch((error) => {
        console.error('Call log failed:', error.message, '| order:', orderId);
        return null;
      });
    if (!updated) return answer('الطلب غير موجود.');
    await repaintOrderQuietly(updated, chatId);
    return answer(`سُجِّلت المحاولة ${callsOf(updated).length} 📵`);
  }

  if (action === 'ok') {
    const result = await acceptOrder(orderId, { by: who, chatId })
      .catch((error) => {
        console.error('Accept failed:', error.message, '| order:', orderId);
        return { ok: false, error: 'حدث خطأ، أعد المحاولة.' };
      });
    return answer(result.ok ? 'قُبِل الطلب ✅' : result.error);
  }

  if (isDeliveryOutcome) {
    const deliveryStatus = action === 'del' ? 'delivered' : 'returned';
    const result = await setDeliveryOutcome(orderId, deliveryStatus, { by: who, chatId })
      .catch((error) => {
        console.error('Delivery outcome update failed:', error.message, '| order:', orderId);
        return { ok: false, error: 'حدث خطأ، أعد المحاولة.' };
      });
    if (!result.ok) return answer(result.error);
    return answer(deliveryStatus === 'delivered' ? 'سُجِّل: وصل 📦' : 'سُجِّل: أُرجع مع الموصّل ↩️');
  }

  if (isReturnReceipt) {
    const result = await receiveReturn(orderId, { by: who, chatId })
      .catch((error) => {
        console.error('Return-receipt update failed:', error.message, '| order:', orderId);
        return { ok: false, error: 'حدث خطأ، أعد المحاولة.' };
      });
    return answer(result.ok ? 'أُضيفت للمخزون 📥' : result.error);
  }

  /* الرفض وحدو ما يتقرّرش هنا — يحتاج سبب، والسبب يجي في رسالة أخرى */
  const order = orderId ? await getOrder(orderId).catch(() => null) : null;
  if (order && order.status !== 'pending') {
    return answer(`الطلب ${order.status === 'accepted' ? 'مقبول' : 'مرفوض'} مسبقاً — ${order.actor ?? ''}`);
  }

  /*
   * الرفض يحتاج سبب. نطلبوه بـ ForceReply — تيليغرام يحلّ الكيبورد ويربط
   * الجواب بهذي الرسالة، فنعرفو بالضبط أشمن طلب يخصّو كي يجي الجواب.
   */
  try {
    const prompt = await telegram('sendMessage', {
      chat_id: message.chat.id,
      reply_to_message_id: message.message_id,
      text: '❌ لماذا رفضت الطلب؟ اكتب السبب في ردّ على هذه الرسالة.',
      reply_markup: { force_reply: true, input_field_placeholder: 'مثال: الزبون لم يُجب' },
    });
    if (orderId) await rememberReplyPrompt(message.chat.id, prompt.message_id, orderId);
  } catch (error) {
    console.error('Failed to ask for deny reason:', error.message, '| order:', orderId);
  }

  return answer('اكتب سبب الرفض ✍️');
}

/* ── جواب فيه سبب الرفض ──────────────────────────────────────────── */
async function handleReply(message) {
  const promptId = message.reply_to_message?.message_id;
  if (!promptId) return;

  const orderId = await resolveReplyPrompt(message.chat.id, promptId).catch(() => null);
  if (!orderId) return;   /* ردّ على حاجة أخرى — ماشي سبب رفض */

  const reason = String(message.text ?? '').trim().slice(0, MAX_REASON_LENGTH);
  if (!reason) return;

  try {
    const result = await denyOrder(orderId, {
      by: displayName(message.from), reason, chatId: message.chat.id,
    });
    if (!result.ok) throw new Error(result.error);

    /* ننظّفو: رسالة السؤال وجواب السبب ما بقاوش يلزمو، الحالة بانت في الطلب */
    await telegram('deleteMessage', { chat_id: message.chat.id, message_id: promptId }).catch(() => {});
    await telegram('deleteMessage', { chat_id: message.chat.id, message_id: message.message_id }).catch(() => {});
    await forgetReplyPrompt(message.chat.id, promptId).catch(() => {});
  } catch (error) {
    console.error('Failed to record deny reason:', error.message, '| order:', orderId);
    await telegram('sendMessage', {
      chat_id: message.chat.id,
      text: `⚠️ تعذّر تسجيل سبب الرفض: ${esc(error.message)}`,
    }).catch(() => {});
  }
}

/**
 * حالة كل الطلبات المعلّقة دروك — بديل حيّ لتقرير آخر النهار، ما يحتاجش
 * تستنّى 00:00. ثلاث قوائم برك: بلا قرار، في الطريق، ورجعات لسّا ما
 * وصلاتش للمحل فيزيائياً (المخزون ما يتزادش فيهم حتى تتأكّد بـ "استلمت
 * الرجعة"). كل سطر خالي = خير، مكتوب واضح باش ما يبقاش شكّ.
 *
 * ⚠️ فوق كل طلب قديم من 24 سا: علامة تفكّرك بيه قبل ما يفوت وقتو.
 */
async function buildStateMessage() {
  const [pending, awaitingDelivery, awaitingReturn, stock] = await Promise.all([
    listPendingOrders(), listAwaitingDelivery(), listAwaitingReturnReceipt(),
    stockLines({ withIndexes: false, limit: 12 }),
  ]);

  const isOld = (order) => Date.now() - new Date(order.createdAt).getTime() > 24 * 60 * 60 * 1000;
  /* عدد المحاولات مع كل سطر: "طلب من 3 أيام" ما تعني نفس الحاجة كي
     تكون عيّطتلو 4 مرّات وكي ما تكون عيّطتلو حتى مرّة */
  const tries = (order) => {
    const count = callsOf(order).length;
    return count ? ` 📵${count}` : '';
  };
  const line = (order) =>
    `• ${esc(order.name)} — ${esc(order.wilaya)} — ${dz(order.total ?? 0)} (${elapsedLabel(order.createdAt)})${tries(order)}${isOld(order) ? ' ⚠️' : ''}`;
  const section = (emoji, title, list) => {
    const lines = [`${emoji} <b>${title} — ${list.length} طلب</b>`];
    lines.push(...(list.length ? list.map(line) : ['لا شيء هنا ✅']));
    return lines;
  };

  const lines = ['<b>📋 حالة الطلبات</b>', ''];

  lines.push(...section('⏳', 'بانتظار قرار (قبول/رفض)', pending));
  lines.push('', ...section('🚚', 'مقبولة، في الطريق', awaitingDelivery));
  lines.push('', ...section('↩️', 'مُرجَعات لم تصل بعد إلى المحل', awaitingReturn));

  const pendingCash = [...pending, ...awaitingDelivery].reduce((sum, o) => sum + (o.total ?? 0), 0);
  const returnQty = awaitingReturn.reduce((sum, o) => sum + (o.qty ?? 0), 0);

  lines.push(
    '',
    '➖➖➖➖➖➖➖➖',
    `💵 مبالغ بانتظار نتيجة نهائية (بانتظار قرار + في الطريق): <b>${dz(pendingCash)}</b>`,
    '',
    '📦 <b>المخزون</b>',
    ...stock.lines,
  );
  if (returnQty) {
    lines.push('', `🔁 مُرجَعات لم تُضف للمخزون بعد: <b>${returnQty}</b> — تتزاد كي توصل للمحل`);
  }

  return lines.join('\n');
}

/* ── أوامر المخزون، التكاليف، وحالة الطلبات ───────────────────────
 * ⚠️ ماشي لازم أمر: أي رسالة عادية فيها نيّة صريحة ("عندي 9 طوق تتبّع،
 *    زيد المنتج والفئة") تتقرا وحدها، والبوت يوري واش فهم ويستنّى نقرة
 *    تأكيد قبل ما يكتب. شوف handleFreeText و lib/product-intent.mjs.
 *
 * /help, /start     — لائحة الأوامر كاملة
 * /state, /status   — كل الطلبات المعلّقة دروك (بلا قرار / بلا نتيجة
 *                      توصيل / رجعت بصح ما وصلاتش للمحل) + المخزون
 * /leads            — ناس عمّرو رقم صحيح وما نقروش على "أكّد الطلب"،
 *                      مع قداش عمّرو وقداش هزّ الوقت — أزرار "عيّطتلو"
 *                      و"شطبو" في كل إشعار
 * /newproduct الاسم | السومة | الكمية | الفئة | سومة الشراء
 *                   — يصنع منتج (مسودّة) + فئتو إذا ما كانتش + مخزونو،
 *                      ويعطي زر "🚀 انشر"
 * /newcategory الاسم | الوصف | الإيموجي — فئة جديدة (الجاهزين يعمّرو روحهم)
 * /categories       — كل الفئات وعدد منتجات كل وحدة
 * /stock            — يعرض الكمية الحالية وحد التنبيه
 * /restock <عدد>    — يزيد كمية للمخزون (بعد تزويد)
 * /setstock <عدد>   — يحطّ الكمية بالضبط (تصحيح، ولا الإعداد الأول)
 * /cost             — يعرض تكاليف الربح الحالية (سوما البضاعة، الإعلانات، خسارة الرجعة)
 * /cost product|ads|returns <عدد> — يبدّل واحدة منهم
 * /block <رقم> [سبب] — يزيد رقم لقائمة الحظر اليدوية
 * /unblock <رقم>    — يحيّد الحظر
 * /blocked          — يعرض كل الأرقام المحظورة
 * /clear            — ⚠️ يمسح كل الطلبات ويرجّع المخزون لصفر (يطلب تأكيد بزوج أزرار أوّلاً)
 *
 * محصورة في الشات المسجّل في TELEGRAM_CHAT_ID: أي واحد آخر يحلّ محادثة
 * مباشرة مع البوت (خارج الگروب) ما يقدرش يشوف الطلبات ولا يبدّل المخزون/التكاليف.
 */
/*
 * كل فاريانت عندو مخزون في لائحة وحدة مرقّمة.
 *
 * ⚠️ علاش: /restock كان ينادي adjustStock() — العدّاد العام القديم في
 * store.mjs. بصح الطلبات واللوحة يقراو مخزون الفاريانت في catalog.mjs.
 * يعني "زدت 10 في تيليغرام" ما كان يبان لا في اللوحة لا وقت القبول:
 * جوج أرقام منفصلين ما يتلاقاو عمرهم. دروك الأوامر تكتب في نفس البلاصة
 * اللي تقرا منها اللوحة.
 *
 * الترتيب لازم يكون ثابت — الرقم اللي يبان في /stock هو اللي يتكتب في
 * /restock، فلو تبدّل بين الأمرين المستخدم يزوّد الفاريانت الغالط.
 */
/* stockTargets/stockLines سكنو في lib/stock-view.mjs — التقرير اليومي
   يقرا منهم تاني، وقبل هذا كان يعرض العدّاد العام برك ويسمّيه "المخزون
   الحالي"، فيخرج رقم غير اللي يعطي /stock على نفس اللحظة */

/* ── إنشاء منتج/فئة من تيليغرام ────────────────────────────────────
 *
 * السيناريو اللي هذا مبني عليه: توصلك سلعة جديدة وانت في المحل ولا في
 * الطريق. تفتح تيليغرام (راهو محلول أصلاً، الطلبات تجي فيه) وتكتب سطر
 * واحد — المنتج، الفئة، والمخزون يتسجّلو مرّة وحدة. بلا هذا، لازم تحلّ
 * اللابتوب، تدخل للوحة، تعمّر فورم، وترجع تزيد المخزون. أغلب الوقت
 * ما يتعملش، والسلعة تبقى برّا النظام.
 *
 * الحقول مفصولة بـ | على خاطر أسماء المنتجات فيها فراغات ("Qiti
 * Tracking Collar") — فراغ كفاصل يخلّي التحليل يخمّن، والتخمين الغالط
 * هنا يخزّن منتج بسومة غالطة.
 */
const splitPipes = (text) => String(text ?? '').split('|').map((part) => part.trim());

/* رقم من نص التاجر: "3900", "3900 دج", "3 900" كلهم يعطيو 3900.
   نص بلا أرقام يرجّع null (ماشي 0) — الفرق مهم: "ما كتبش سومة" ماشي
   "السومة صفر". */
function parseAmount(text) {
  if (text == null || text === '') return null;
  const digits = String(text).replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * يلقى الفئة ولا يصنعها. يرجّع { category, created } ولا
 * { category: null } كي ما كانش لا نص ولا تخمين.
 *
 * الترتيب: اللي كتبو التاجر يغلب التخمين ديما، والموجود يغلب الجديد
 * (ما نصنعوش "سيارة" ثانية كي وحدة كاينة).
 */
async function resolveCategory(wanted, productName) {
  const existing = await listCategories().catch(() => []);
  const matches = (category, needle) =>
    String(category.slug).toLowerCase() === needle
    || String(category.name ?? '').trim().toLowerCase() === needle;

  if (wanted) {
    const needle = wanted.trim().toLowerCase();
    const found = existing.find((category) => matches(category, needle));
    if (found) return { category: found, created: false };
  }

  /* ما لقيناش وحدة موجودة — نشوفو الجاهزة (بالاسم اللي كتبو، وإلا
     نخمّنو من اسم المنتج) */
  const preset = wanted ? findPreset(wanted) : guessPreset(productName);

  /* الجاهزة تقدر تكون موجودة بسلاق مختلف على اللي كتبو التاجر */
  if (preset) {
    const already = existing.find((category) => matches(category, preset.slug.toLowerCase()));
    if (already) return { category: already, created: false };
  }

  if (!preset && !wanted) return { category: null, created: false };

  const name = preset?.name ?? wanted;
  const slug = await availableSlug('category', preset?.slug ?? wanted);
  const maxSort = existing.reduce((max, category) => Math.max(max, Number(category.sort) || 0), 0);

  const category = await saveCategory({
    name,
    slug,
    tagline: preset?.tagline ?? null,
    emoji: preset?.emoji ?? null,
    color: preset?.color ?? null,
    sort: maxSort + 10,
  });
  return { category, created: true, preset };
}

/*
 * المنتج يتصنع **مسودّة** ديماً، وزر "🚀 انشر" يبان تحت الجواب.
 *
 * علاش ماشي منشور طول: المنتج اللي يتصنع من سطر تيليغرام ما عندو لا
 * صورة لا وصف. لو طلع للمتجر مباشرة، الزبون يشوف بطاقة خاوية بسومة —
 * وهذا يضرّ أكثر ما ينفع. المخزون يتسجّل من دروك (هو سبب الأمر أصلاً)،
 * والنشر يبقى نقرة وحدة كي تكون الصور جاهزة.
 */
async function handleNewProduct(message, argText, reply) {
  const [rawName, rawPrice, rawQty, rawCategory, rawCost] = splitPipes(argText);

  if (!rawName) {
    return reply([
      '🆕 <b>منتج جديد</b>',
      '',
      '<code>/newproduct الاسم | السعر | الكمية | الفئة | سعر الشراء</code>',
      '',
      'مثال:',
      '<code>/newproduct Qiti Tracking Collar | 3900 | 9 | tracking | 1800</code>',
      '',
      'الاسم وحده إجباري. الباقي يمكن تركه فارغاً أو حذفه:',
      '<code>/newproduct طوق تتبّع | 3900 | 9</code>',
      '',
      'الفئة: اكتب اسمها أو رابطها. لم تكتبها؟ نستنتجها من اسم المنتج،',
      'وإن لم تكن موجودة أنشأناها. اطّلع على الجاهزة بـ /categories.',
    ].join('\n'));
  }

  return createAndAnnounce(message.chat.id, {
    name: rawName,
    price: parseAmount(rawPrice) ?? 0,
    qty: parseAmount(rawQty) ?? 0,
    cost: parseAmount(rawCost) ?? 0,
    category: rawCategory || null,
  }, reply);
}

/*
 * الإنشاء الفعلي + جواب الحصيلة. مشترك بين الطريقين (الأمر /newproduct
 * وقراءة الرسالة العادية) — بلا هذا، أي تبديل في شكل المنتج المصنوع
 * لازم يتكتب زوج مرّات، والنسختين يفرقو مع الوقت.
 */
async function createAndAnnounce(chatId, fields, reply) {
  const { name } = fields;
  const price = fields.price ?? 0;
  const qty = fields.qty ?? 0;
  const unitCost = fields.cost ?? 0;

  let category = null;
  let categoryCreated = false;
  try {
    const resolved = await resolveCategory(fields.category, name);
    category = resolved.category;
    categoryCreated = resolved.created;
  } catch (error) {
    /* فشل الفئة ما يوقّفش المنتج — المخزون هو الغرض، والفئة تتزاد
       من اللوحة في ثانية. نقولوها في الجواب بلا ما نضيّعو الباقي. */
    console.error('Category resolve failed:', error.message);
  }

  let product;
  try {
    const slug = await availableSlug('product', name);
    product = await saveProduct({
      name,
      slug,
      price,
      unitCost,
      type: category ? (findPreset(category.slug)?.type ?? 'life') : 'life',
      categoryId: category?.id ?? null,
      status: 'draft',
      initialStock: qty,
    });
  } catch (error) {
    console.error('Product creation failed:', error.message);
    return reply(`⚠️ تعذّر إنشاء المنتج: ${esc(error.message)}`);
  }

  const site = siteUrl();
  const lines = [
    '✅ <b>أُنشئ المنتج</b> (مسودّة)',
    '',
    `📦 <b>${esc(product.name)}</b>`,
    `السعر: <b>${price ? dz(price) : '— غير محدّد'}</b>`,
    `المخزون: <b>${qty}</b>`,
  ];
  if (unitCost) lines.push(`سعر الشراء: <b>${dz(unitCost)}</b> (الربح للوحدة: ${dz(price - unitCost)})`);
  lines.push(category
    ? `الفئة: <b>${esc(category.name)}</b>${categoryCreated ? ' — أُنشئت الآن 🆕' : ''}`
    : 'الفئة: — بدون فئة');

  lines.push('', 'ما زال مسودّة: لن يظهر في المتجر حتى تنشره.');
  if (!price) lines.push('⚠️ بدون سعر — أضفه قبل النشر.');
  if (site) lines.push('', `✏️ أكمله (صور، وصف): ${site}/admin#/products/${product.id}`);

  return telegram('sendMessage', {
    chat_id: chatId,
    text: lines.join('\n'),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    /* التراجع لازم يكون في نفس البلاصة اللي صرات فيها الغلطة — منتج
       تصنع بالغلط من رسالة ما يستاهلش رحلة للوحة باش يتحيّد */
    reply_markup: {
      inline_keyboard: [[
        { text: '🚀 انشر في المتجر', callback_data: `pub:${product.id}` },
        { text: '🗑️ حذف', callback_data: `rm:${product.id}` },
      ]],
    },
  }).catch((error) => console.error('Product reply failed:', error.message));
}

/*
 * حذف منتج من تيليغرام — للتراجع على منتج تصنع دروك بالغلط.
 *
 * نفس حاجز اللوحة: منتج عندو طلبات ما يتمسحش، على خاطر التقارير
 * تقرا اسمو من الكاتالوغ. الفحص مكتوب هنا وفي admin-api.mjs — الزوج
 * يقراو نفس القاعدة، وهي في سطر واحد، فتكرارها أرخص من موديول
 * مشترك يجرّ store.mjs لحلقة استيراد مع catalog.mjs.
 */
async function handleDeleteProduct(query, productId, answer) {
  const ownerChatId = process.env.TELEGRAM_CHAT_ID;
  if (!ownerChatId || String(query.message.chat.id) !== String(ownerChatId)) {
    return answer('ليست لديك الصلاحية.');
  }

  try {
    const product = await getProduct(productId);
    if (!product) return answer('المنتج غير موجود — ربما حُذف مسبقاً.');

    const orders = await listOrders();
    const used = orders.filter((order) => order.productId === product.id).length;
    if (used) {
      return answer(`له ${used} طلب في السجل — لا يمكن حذفه. أرشفه من اللوحة.`);
    }

    await deleteProduct(product.id);
    await telegram('editMessageText', {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      text: `🗑️ <b>حُذف</b> — ${esc(product.name)}\nلم يبقَ منه أثر: لا رابط، ولا مخزون.`,
      parse_mode: 'HTML',
    }).catch((error) => console.error('Delete repaint failed:', error.message));

    return answer('حُذف 🗑️');
  } catch (error) {
    console.error('Delete failed:', error.message, '| product:', productId);
    return answer('حدث خطأ، أعد المحاولة.');
  }
}

/* ── قراءة رسالة عادية (بلا أمر) ───────────────────────────────────
 *
 * "عندي 9 طوق تتبّع، زيد المنتج والفئة" لازم تخدم كيما /newproduct.
 * التاجر ما يحفظش صيغ — يكتب كيما يهدر.
 *
 * ⚠️ ما نكتبوش المنتج على طول. البوت يوري واش فهم ويستنّى نقرة:
 * التحليل تخمين (شوف lib/product-intent.mjs)، وكتابة صامتة على تخمين
 * تعمّر الكاتالوغ بمنتجات ما طلبهم حتى واحد — والتاجر ما يعرفش منين
 * جاو. نقرة وحدة تخلّي الغلطة تتشاف قبل ما تصرا.
 */
async function handleFreeText(message) {
  const ownerChatId = process.env.TELEGRAM_CHAT_ID;
  if (!ownerChatId || String(message.chat.id) !== String(ownerChatId)) return;

  const parsed = parseProductIntent(message.text);
  if (!parsed) return;   /* هدرة عادية — البوت يسكت، ما يجاوبش على كلشي */

  let draftId;
  try {
    draftId = await saveProductDraft(parsed);
  } catch (error) {
    console.error('Draft save failed:', error.message);
    return;
  }

  const lines = [
    '🤔 <b>هذا ما فهمته:</b>',
    '',
    `📦 الاسم: <b>${esc(parsed.name)}</b>`,
    `💵 السعر: <b>${parsed.price ? dz(parsed.price) : '— لم أفهمه'}</b>${parsed.guessedPrice ? ' <i>(استنتجته)</i>' : ''}`,
    `📥 الكمية: <b>${parsed.qty ?? 0}</b>`,
  ];
  if (parsed.cost) lines.push(`🧾 سعر الشراء: <b>${dz(parsed.cost)}</b>`);
  lines.push(`🗂️ الفئة: <b>${parsed.category ? esc(parsed.category) : 'نستنتجها من الاسم'}</b>`);
  lines.push('', 'صحيح؟ اضغط وننشئ المنتج + الفئة + المخزون.');
  lines.push('خطأ؟ اضغط "لا" وأعد كتابتها، أو استعمل <code>/newproduct</code>.');

  return telegram('sendMessage', {
    chat_id: message.chat.id,
    reply_to_message_id: message.message_id,
    text: lines.join('\n'),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ نعم، أضفه', callback_data: `mk:${draftId}` },
        { text: '❌ لا', callback_data: `mkx:${draftId}` },
      ]],
    },
  }).catch((error) => console.error('Intent prompt failed:', error.message));
}

/** نقرة "ايه، زيدو" / "لا" تحت رسالة الفهم */
async function handleDraftDecision(query, draftId, confirmed, answer) {
  const ownerChatId = process.env.TELEGRAM_CHAT_ID;
  if (!ownerChatId || String(query.message.chat.id) !== String(ownerChatId)) {
    return answer('ليست لديك الصلاحية.');
  }

  const draft = await getProductDraft(draftId).catch(() => null);
  if (!draft) return answer('المسودّة لم تعد موجودة — أعد كتابتها.');

  /* المسودّة تتمسح في الزوج حالات: نقرة ثانية على نفس الرسالة ما
     تصنعش منتج ثاني */
  await forgetProductDraft(draftId).catch(() => {});

  /* الأزرار يتحيّدو مهما كان القرار — زر يبقى بعد ما يتنقر يخلّي
     التاجر يشكّ واش خدم */
  await telegram('editMessageReplyMarkup', {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    reply_markup: { inline_keyboard: [] },
  }).catch(() => {});

  if (!confirmed) return answer('تمّ التراجع ✅');

  const reply = (text) =>
    telegram('sendMessage', {
      chat_id: query.message.chat.id, text, parse_mode: 'HTML', disable_web_page_preview: true,
    }).catch((error) => console.error('Draft reply failed:', error.message));

  await createAndAnnounce(query.message.chat.id, draft, reply);
  return answer('أُنشئ المنتج ✅');
}

async function handleNewCategory(argText, reply) {
  const [rawName, rawTagline, rawEmoji] = splitPipes(argText);

  if (!rawName) {
    return reply([
      '🗂️ <b>فئة جديدة</b>',
      '',
      '<code>/newcategory الاسم | الوصف القصير | 🐾</code>',
      '',
      'اسم من القائمة الجاهزة يملأ الوصف والإيموجي واللون تلقائياً:',
      '<code>/newcategory tracking</code>',
      '',
      'اطّلع على الكل بـ /categories.',
    ].join('\n'));
  }

  try {
    const { category, created } = await resolveCategory(rawName, '');
    if (!created) return reply(`الفئة <b>${esc(category.name)}</b> موجودة مسبقاً (/${esc(category.slug)}).`);

    /* الوصف/الإيموجي اللي كتبهم التاجر يغلبو اللي جاو من الجاهزة */
    const patched = (rawTagline || rawEmoji)
      ? await saveCategory({
        ...category,
        tagline: rawTagline || category.tagline,
        emoji: rawEmoji || category.emoji,
      })
      : category;

    return reply(`✅ أُنشئت الفئة <b>${esc(patched.name)}</b> — /c/${esc(patched.slug)}`);
  } catch (error) {
    console.error('/newcategory failed:', error.message);
    return reply(`⚠️ تعذّر إنشاء الفئة: ${esc(error.message)}`);
  }
}

async function handleListCategories(reply) {
  const categories = await listCategories().catch(() => []);
  if (!categories.length) {
    return reply('لا توجد أي فئة.\nأنشئ واحدة: <code>/newcategory tracking</code>');
  }

  const products = await listProducts().catch(() => []);
  const countFor = (id) => products.filter((product) => product.categoryId === id).length;

  const lines = [`🗂️ <b>الفئات (${categories.length})</b>`, ''];
  for (const category of categories) {
    const badge = category.emoji ? `${category.emoji} ` : '';
    lines.push(`${badge}<b>${esc(category.name)}</b> — /c/${esc(category.slug)} · ${countFor(category.id)} منتج`);
  }
  lines.push('', 'أضف واحدة: <code>/newcategory الاسم</code>');
  return reply(lines.join('\n'));
}

async function handleCommand(message) {
  const ownerChatId = process.env.TELEGRAM_CHAT_ID;
  if (!ownerChatId || String(message.chat.id) !== String(ownerChatId)) return;

  const text = String(message.text ?? '').trim();
  const parts = text.split(/\s+/);
  /* في گروب، تيليغرام يكتب الأمر كامل: /stock@QitiBot — بلا هذا
     التنظيف، ولا أمر ما يتعرف كي البوت يكون مع بوتات أخرى */
  const command = parts[0].split('@')[0];
  const arg = parts[1];
  const reply = (line) =>
    telegram('sendMessage', {
      chat_id: message.chat.id, text: line, parse_mode: 'HTML', disable_web_page_preview: true,
    }).catch((error) => console.error('Command reply failed:', error.message));

  if (command === '/help' || command === '/start') {
    return reply([
      '🤖 <b>أوامر البوت</b>',
      '',
      '<b>الطلبات</b>',
      '/state — كل الطلبات التي لم تُغلق بعد',
      '/leads — من أدخل رقمه ولم يُكمل الطلب',
      '',
      '<b>الكتالوغ</b>',
      'اكتب بشكل عادي: <i>«عندي 9 أطواق تتبّع، أضف المنتج والفئة»</i>',
      'وسنعرض عليك ما فهمناه قبل إضافة أي شيء.',
      '/newproduct — نفس الشيء بصيغة محدّدة',
      '/newcategory — فئة جديدة',
      '/categories — كل الفئات',
      '',
      '<b>المخزون</b>',
      '/stock — الكميات الحالية (مع رقم كل منتج)',
      '/restock &lt;رقم&gt; &lt;كمية&gt; — إضافة كمية بعد التموين',
      '/setstock &lt;رقم&gt; &lt;كمية&gt; — تصحيح الكمية بالضبط',
      '<i>الرقم هو نفسو اللي يبان حذا المنتج في اللوحة، وما يتبدّلش.</i>',
      '',
      /*
       * ⚠️ /ship و/sync كانو موجودين وما مذكورينش هنا — يعني ميزة
       * مبنية ومختبرة وما حدّ يعرف بيها. اللائحة هنا هي الوثيقة
       * الوحيدة اللي يقراها المشغّل.
       */
      '<b>الشحن</b>',
      '/ship &lt;رقم الطلب&gt; — يبعث الطردة بيدك',
      '/cancel &lt;رقم الطلب&gt; — يلغي الطردة (المخزون ما يرجعش وحدو)',
      '/sync — يسحب حالات الطرود من الموصّل دروك',
      '',
      '<b>المال</b>',
      '/cost — سعر الشراء، الإعلانات، الإرجاع، التوصيل',
      '',
      '<b>الإعدادات</b>',
      '/settings — الإرسال التلقائي، نسبة الرجعة، والولايات اللي توصّل فيها بيدك',
      '',
      '<b>الزبائن</b>',
      '/block · /unblock · /blocked',
      '',
      '/void &lt;رقم الزبون&gt; — ⚠️ يلغي الطردة، يرجّع المخزون، ويمحي كل طلبات الرقم',
      '/void &lt;رقم الطلب&gt; — ⚠️ نفس الشيء على طلب واحد (يطلب تأكيد)',
      '/unvoid &lt;رقم الطلب&gt; — يرجّع طلب أخرجتو من الحساب من اللوحة',
      '',
      '/clear — ⚠️ يحذف كل الطلبات',
      '',
      'اكتب الأمر وحده وسيشرح لك طريقة استعماله.',
    ].join('\n'));
  }

  /* argText = كل ما جا بعد الأمر خام (بالفراغات والـ |) — parts ما
     تنفعش هنا، هي مقسّمة على الفراغ والاسم فيه فراغات */
  const argText = text.slice(parts[0].length).trim();

  if (command === '/newproduct' || command === '/newprod') {
    return handleNewProduct(message, argText, reply);
  }
  if (command === '/newcategory' || command === '/newcat') {
    return handleNewCategory(argText, reply);
  }
  if (command === '/categories') return handleListCategories(reply);

  if (command === '/state' || command === '/status') {
    try {
      return reply(await buildStateMessage());
    } catch (error) {
      console.error('/state failed:', error.message);
      return reply('⚠️ تعذّر جلب الحالة، أعد المحاولة.');
    }
  }

  if (command === '/leads') {
    try {
      return reply(await buildLeadsMessage());
    } catch (error) {
      console.error('/leads failed:', error.message);
      return reply('⚠️ تعذّر جلب القائمة، أعد المحاولة.');
    }
  }

  /*
   * فعل خطير وبلا تراجع — نطلبو تأكيد بزوج أزرار (نفس منطق قبول/رفض)
   * قبل ما نمسحو والو، باش نقرة وحدة غالطة ما تخسّرش التاريخ كامل.
   */
  if (command === '/clear') {
    return telegram('sendMessage', {
      chat_id: message.chat.id,
      text: '⚠️ <b>متأكد؟</b>\nسيحذف <b>كل الطلبات</b> (السجل كامل) ويعيد <b>المخزون إلى الصفر</b>.\nلا يمكن التراجع!',
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ نعم، احذف الكل', callback_data: 'clear-yes' },
          { text: '❌ لا، تراجعت', callback_data: 'clear-no' },
        ]],
      },
    }).catch((error) => console.error('/clear prompt failed:', error.message));
  }

  /*
   * /ship — يبعث طردة طلب واحد بيدك.
   * يخدم كي الإرسال التلقائي مطفي، ولا كي طاح وصلّحت السبب.
   */
  if (command === '/ship') {
    const orderId = arg;
    /* ⚠️ المثال كان <code>QT-1042</code> — وشكل ما كانش عمرو موجود.
       الـ id الحقيقي هو YYMMDD-xxxxx (شوف newOrderId في store.mjs)،
       فاللي ينسخ المثال يلقى "الطلب غير موجود" وما يفهمش علاش. */
    if (!orderId) return reply('اكتب رقم الطلب: <code>/ship 260819-a1b2c</code>');

    const result = await sendShipment(orderId, { by: displayName(message.from) });
    if (!result.ok) return reply(`⚠️ ما تبعثش: ${esc(result.error)}`);
    if (result.already) return reply(`الطردة موجودة من قبل — <code>${esc(result.tracking)}</code>`);

    await shipmentCreated(result.order).catch(() => {});
    return reply(`🚚 الطردة خرجت — <code>${esc(result.tracking)}</code>`);
  }

  /* /sync — يسحب حالات الطرود دروك بدل ما تستنّى الكرون */
  if (command === '/sync') {
    const result = await syncOpenShipments({ actor: displayName(message.from) });
    if (result.skipped) return reply('الربط مع الموصّل غير مضبوط.');

    const retry = await retryFailedShipments({ by: displayName(message.from) });
    return reply([
      '🔄 <b>المزامنة</b>',
      `طرود مفحوصة: ${result.checked ?? 0}`,
      `حالات تبدّلت: ${result.changed ?? 0}`,
      `قرارات توصيل: ${result.outcomes ?? 0}`,
      ...(retry.retried ? [`إعادة إرسال: ${retry.sent}/${retry.retried}`] : []),
    ].join('\n'));
  }

  if (command === '/stock') {
    /* الطوق كان مخزونو في عدّاد عام بلا منتج — الهجرة تصلّحو، وتصرا
       مرّة وحدة (شوف lib/legacy-stock.mjs) */
    await ensureLegacyProduct().catch((error) =>
      console.error('Legacy product migration failed:', error.message));

    const [view, awaitingReturn] = await Promise.all([
      stockLines(), listAwaitingReturnReceipt(),
    ]);
    const { lines, targets } = view;
    const returnQty = awaitingReturn.reduce((sum, o) => sum + (o.qty ?? 0), 0);

    if (targets.length) {
      lines.push('', `أضف: <code>/restock ${targets.length > 1 ? '&lt;رقم&gt; ' : ''}10</code>`);
    }
    if (returnQty) {
      lines.push('', `🔁 مُرجَعات معلّقة (لم تُضف بعد): <b>${returnQty}</b> — /state يعرض لك الطلبات المعنية`);
    }
    return reply(lines.join('\n') || 'لا يوجد أي مخزون مسجّل.');
  }

  if (command === '/restock' || command === '/setstock') {
    const isSet = command === '/setstock';

    /*
     * أهم سطر في هاذ الأمر.
     *
     * قبل، بلا منتجات في الكاتالوغ، /restock كان يكتب في العدّاد العام
     * — الرقم يطلع في تيليغرام، وتحلّ اللوحة ما تلقى لا منتج لا كمية.
     * الهجرة تصنع منتج الطوق وتحوّلّو الكمية، فالكتابة تصرا ديما في
     * بلاصة تقدر تشوفها.
     */
    await ensureLegacyProduct().catch((error) =>
      console.error('Legacy product migration failed:', error.message));

    const targets = await stockTargets();

    /* ما زالت ما كاينش حتى سلعة — نقولوها بالكلام بدل ما نكتبو في
       عدّاد ما يبان في حتى بلاصة */
    if (!targets.length) {
      return reply('ما كاين حتى منتج بعد.\n'
        + 'اكتب سطر واحد باش تصنع واحد — مثلاً: <code>عندي 9 طوق تتبّع، زيدو</code>');
    }

    /* منتج وحيد بفاريانت وحيد = ما نطلبوش رقم، الأمر يبقى /restock 10 */
    const [a, b] = parts.slice(1);
    let target = null;
    let amountRaw = a;
    if (b !== undefined) {
      /* الرقم يجي كيما يبان في /stock: "3" ولا "3.2" للفاريانتات */
      const wanted = String(a).trim();
      target = targets.find((t) => t.index === wanted) ?? null;
      amountRaw = b;
      if (!target) return reply(`لم أجد الرقم <b>${esc(wanted)}</b>. راجع /stock للأرقام.`);
    } else if (targets.length === 1) {
      target = targets[0];
    } else {
      return reply('لديك أكثر من فاريانت — الرقم مطلوب.\n'
        + `استعمل: <code>${command} &lt;رقم&gt; ${isSet ? 50 : 10}</code>\nراجع /stock للأرقام.`);
    }

    const n = parseInt(amountRaw, 10);
    if (!Number.isFinite(n) || (isSet ? n < 0 : n <= 0)) {
      return reply(`استعمل: <code>${command} ${targets.length > 1 ? '&lt;رقم&gt; ' : ''}${isSet ? 50 : 10}</code>`);
    }

    const updated = isSet
      ? await setVariantStock(target.productId, target.sku, n)
      : await adjustVariantStock(target.productId, target.sku, n);

    return reply(`✅ <b>#${esc(String(target.index))}</b> ${esc(target.productName)} — ${esc(target.label)}\n`
      + `الكمية الحالية: <b>${updated.qty}</b>\n`
      + '<i>تشوفها في اللوحة تحت المنتج.</i>');
  }

  /*
   * قائمة الحظر اليدوية — تكملة لفحص الثقة، ماشي بديل.
   * الحظر هنا ما يمنعش الطلب من الوصول (الزبون يقدر يعمّر الفورم عادي)،
   * غير يبان في الرسالة بعلامة واضحة وانت تقرّر. نفس المبدأ: تنبيه ماشي
   * منع تلقائي — المنع الصامت يخسّرك زبائن وما تعرف حتى.
   */
  if (command === '/block') {
    const phone = normalizeDzPhone(arg);
    if (!phone) return reply('استعمل: /block 0661445566 [السبب]');
    const reason = parts.slice(2).join(' ') || null;
    const entry = await blockPhone(phone, { reason, addedBy: displayName(message.from) });
    return reply(`🚫 حُظر <b>${entry.phone}</b>${entry.reason ? `\nالسبب: ${esc(entry.reason)}` : ''}`);
  }

  if (command === '/unblock') {
    const phone = normalizeDzPhone(arg);
    if (!phone) return reply('استعمل: /unblock 0661445566');
    const removed = await unblockPhone(phone);
    return reply(removed ? `✅ رُفع الحظر عن <b>${phone}</b>` : `الرقم <b>${phone}</b> غير محظور أصلاً.`);
  }

  if (command === '/blocked') {
    const entries = await listBlocked();
    if (!entries.length) return reply('لا يوجد أي رقم محظور.');
    const lines = [`🚫 <b>الأرقام المحظورة (${entries.length})</b>`, ''];
    for (const entry of entries) {
      lines.push(`• <b>${entry.phone}</b>${entry.reason ? ` — ${esc(entry.reason)}` : ''}`);
    }
    lines.push('', 'ارفع الحظر بـ: /unblock 0661445566');
    return reply(lines.join('\n'));
  }

  if (command === '/cost') {
    const FIELDS = {
      product: { key: 'productCost', label: 'سعر البضاعة' },
      ads: { key: 'adsCost', label: 'تكلفة الإعلانات' },
      returns: { key: 'returnLoss', label: 'خسارة الإرجاع' },
      /* التوصيل: صفر بالتلقائي — الزبون يخلّصو في الدفع عند الاستلام.
         اللي يخلّصو بروحو يحطّ رقمو هنا ويدخل في حساب الربح. */
      courier: { key: 'courierCost', label: 'تكلفة التوصيل (تدفعها أنت)' },
    };

    /* بلا فرعي: نعرضو التكاليف كاملة */
    if (!arg) {
      const costs = await getCosts();
      const courier = costs.courierCost ?? 0;
      return reply([
        '💰 <b>تكاليف الربح</b>',
        `سعر البضاعة (لكل وحدة): <b>${dz(costs.productCost)}</b>`,
        `تكلفة الإعلانات (لكل طلب): <b>${dz(costs.adsCost)}</b>`,
        `خسارة الإرجاع (لكل طلب مُرجَع): <b>${dz(costs.returnLoss)}</b>`,
        `تكلفة التوصيل: <b>${dz(courier)}</b>${courier === 0 ? ' (يدفعها الزبون)' : ''}`,
        '',
        '<b>الربح</b> = المجموع − سعر البضاعة×الكمية − الإعلانات − التوصيل',
        '',
        'غيّرها بـ: /cost product 1800 — /cost ads 300 — /cost returns 800 — /cost courier 0',
      ].join('\n'));
    }

    const field = FIELDS[arg];
    const n = parseInt(parts[2], 10);
    if (!field || !Number.isFinite(n) || n < 0) {
      return reply('استعمل: /cost product 1800  أو  /cost ads 300  أو  /cost returns 800  أو  /cost courier 0');
    }
    const costs = await setCost(field.key, n);
    return reply(`✅ سُجِّل. ${field.label}: <b>${dz(costs[field.key])}</b>`);
  }

  /*
   * ── /settings ────────────────────────────────────────────────────
   *
   * ⚠️ الإعدادات كانت تتقرا في ستّ بلايص وما عندها حتى كاتب: لا صفحة
   * في اللوحة، لا أمر هنا. الإرسال التلقائي ما ينطفاش، ونسبة الرجعة
   * محبوسة في 50% مهما كان اتفاقك مع الموصّل. هاذ الأمر يفتحها.
   */
  if (command === '/settings') {
    const FIELDS = {
      autoship: 'autoShip',
      returnship: 'returnShipPercent',
      returnproduct: 'returnIncludesProduct',
      returnextra: 'returnExtraCost',
    };

    if (!arg) {
      const settings = await getSettings();
      const self = (settings.selfDeliveredWilayas ?? []).map((id) => WILAYAS[id - 1] ?? id);
      return reply([
        '⚙️ <b>إعدادات المحل</b>',
        '',
        `إرسال الطردة تلقائياً عند القبول: <b>${settings.autoShip ? 'مفعّل' : 'مطفي'}</b>`,
        `حصّة الموصّل على الرجعة: <b>${settings.returnShipPercent}%</b> من سومة التوصيل`,
        `سومة السلعة تتحسب في الرجعة: <b>${settings.returnIncludesProduct ? 'نعم' : 'لا'}</b>`,
        `تكلفة رجعة ثابتة زايدة: <b>${dz(settings.returnExtraCost)}</b>`,
        '',
        `توصيل بيدك: <b>${self.length ? esc(self.join('، ')) : 'ما كاين حتى وحدة'}</b>`,
        '<i>في هاذ الولايات برك تقدر تعلّم «وصلت» بيدك — الباقي يستنّى تأكيد الموصّل.</i>',
        '',
        '<b>بدّلها:</b>',
        '<code>/settings autoship off</code>',
        '<code>/settings returnship 40</code>',
        '<code>/settings returnproduct on</code>',
        '<code>/settings returnextra 100</code>',
        '<code>/settings selfdelivery باتنة، سطيف</code>',
        '<code>/settings selfdelivery -</code> — يحيّدهم كامل',
      ].join('\n'));
    }

    /*
     * الولايات اللي توصّل فيها بيدك — تتكتب بأسمائها، وتتخزّن بأرقامها.
     * الاسم يتكتب بثلاث طرق والرقم واحد، ونفس السبب اللي خلّى جدول
     * التوصيل يتفهرس بالرقم (شوف shipping-rates.mjs).
     */
    if (String(arg).toLowerCase() === 'selfdelivery') {
      const raw = text.slice(text.indexOf(arg) + arg.length).trim();
      if (!raw) return reply('اكتب الولايات: <code>/settings selfdelivery باتنة، سطيف</code>');

      /* "-" تعني: ما كاين حتى وحدة، الموصّل يأكّد كلش */
      if (raw === '-') {
        await saveSettings({ selfDeliveredWilayas: [] });
        return reply('✅ ما بقاتش حتى ولاية توصّل فيها بيدك — كل «وصلت» تستنّى الموصّل.');
      }

      const names = raw.split(/[,،]/).map((one) => one.trim()).filter(Boolean);
      const ids = [];
      const unknown = [];
      for (const name of names) {
        const id = wilayaId(name);
        if (id) ids.push(id);
        else unknown.push(name);
      }
      if (unknown.length) return reply(`⚠️ ما نعرفوش هاذ الولايات: ${esc(unknown.join('، '))}`);

      const saved = await saveSettings({ selfDeliveredWilayas: ids });
      const shown = saved.selfDeliveredWilayas.map((id) => WILAYAS[id - 1]);
      return reply(`✅ توصيل بيدك في: <b>${esc(shown.join('، '))}</b>\nفي هاذو برك تقدر تعلّم «وصلت» بلا الموصّل.`);
    }

    const key = FIELDS[String(arg).toLowerCase()];
    const raw = parts[2];
    if (!key || raw === undefined) {
      return reply('استعمل: /settings autoship off — /settings returnship 40 — /settings returnproduct on — /settings returnextra 100');
    }

    /* on/off للمفاتيح، رقم للباقي — نفس الشكل اللي يستنّاه اللي كتب /cost */
    const boolean = key === 'autoShip' || key === 'returnIncludesProduct';
    let value;
    if (boolean) {
      const on = ['on', 'yes', '1', 'نعم'].includes(String(raw).toLowerCase());
      const off = ['off', 'no', '0', 'لا'].includes(String(raw).toLowerCase());
      if (!on && !off) return reply('اكتب <code>on</code> ولا <code>off</code>.');
      value = on;
    } else {
      value = parseInt(raw, 10);
      if (!Number.isFinite(value) || value < 0) return reply('اكتب رقم موجب.');
    }

    const saved = await saveSettings({ [key]: value });
    const shown = boolean ? (saved[key] ? 'مفعّل' : 'مطفي') : saved[key];
    return reply(`✅ سُجِّل. <b>${esc(arg)}</b>: <b>${esc(String(shown))}</b>`);
  }

  /*
   * ── /cancel ──────────────────────────────────────────────────────
   *
   * قبلتي طلب بالغلط والإرسال التلقائي خدّام؟ الطردة راهي عند الموصّل
   * وما كانش كيفاش توقّفها — `cancelShipment` كانت مكتوبة وما توصلهاش
   * حتى نقرة.
   *
   * ⚠️ ما تمسّش المخزون ولا حالة الطلب: تلغي الطردة برك. المخزون
   * يرجع كي ترفض الطلب ولا تسجّل الرجعة — بلاصة وحدة تحرّكو، ماشي زوج.
   */
  if (command === '/cancel') {
    if (!arg) return reply('اكتب رقم الطلب: <code>/cancel 260819-a1b2c</code>');

    const result = await cancelShipment(arg, { by: displayName(message.from) });
    if (!result.ok) return reply(`⚠️ ما تلغاتش: ${esc(result.error)}`);

    await shipmentCancelled(result.order).catch(() => {});
    return reply('🚫 الطردة تلغات. المخزون ما رجعش — ارفض الطلب ولا سجّل الرجعة باش يرجع.');
  }

  /*
   * ── /void ────────────────────────────────────────────────────────
   *
   * يمحي الطلب نهائياً — بالرقم تاع الزبون بلا رمز الدولة
   * (`/void 0661445566`) ولا بـ id الطلب (`/void 260819-a1b2c`).
   *
   * ⚠️ محو، ماشي إلغاء محاسبي. `voidOrder` في decisions.mjs تخرّج
   * الطلب من الحساب وتخلّي السجلّ، واللوحة تستعملها و/unvoid يرجّعها.
   * اللي هنا يحيّد الطلب من التخزين كامل: اللوحة، التقارير، صفّ
   * المكالمات، وتاريخ الزبون. بلا تراجع.
   *
   * ⚠️ علاش زوج أزرار قبل المحو: نفس سبب /clear — رقم غالط مكتوب
   * في سطر واحد يمحي طلبات زبون حقيقي، والمسح ما يترجّعش.
   *
   * الشغل روحو في `purgeOrder` (decisions.mjs): تلغي الطردة عند
   * الموصّل، ترجّع المخزون، وتمحي الطلب — بهاذ الترتيب. هنا غير
   * الرسالة والتأكيد.
   */
  if (command === '/void') {
    if (!arg) {
      return reply([
        'اكتب رقم الزبون ولا رقم الطلب:',
        '<code>/void 0661445566</code> — يمحي كل طلبات هاذ الرقم',
        '<code>/void 260819-a1b2c</code> — يمحي طلب واحد',
      ].join('\n'));
    }

    /* رقم جزائري = محو بالزبون. أي حاجة أخرى = id تاع طلب. */
    const phone = normalizeDzPhone(arg);

    if (phone) {
      const found = await listOrdersByPhone(phone).catch(() => []);
      if (!found.length) return reply(`ما لقيت حتى طلب بالرقم <code>${esc(phone)}</code>.`);

      return telegram('sendMessage', {
        chat_id: message.chat.id,
        text: [
          '⚠️ <b>متأكد؟</b>',
          '',
          `سيمحي <b>${found.length}</b> طلب تاع <code>${esc(phone)}</code> نهائياً:`,
          ...found.map((order) => `• <code>${esc(order.id)}</code> — ${esc(order.name ?? '')}`),
          '',
          ...voidPlan(found),
          '',
          'وتاريخ الزبون وسلّتو المفتوحة يمشيو معاهم. لا يمكن التراجع!',
        ].join('\n'),
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: `✅ نعم، امحي ${found.length}`, callback_data: `vdp:${phone}` },
            { text: '❌ لا، تراجعت', callback_data: 'vdn:' },
          ]],
        },
      }).catch((error) => console.error('/void prompt failed:', error.message));
    }

    const order = await getOrder(arg).catch(() => null);
    if (!order) return reply(`ما لقيتش الطلب <code>${esc(arg)}</code>.`);

    return telegram('sendMessage', {
      chat_id: message.chat.id,
      text: [
        '⚠️ <b>متأكد؟</b>',
        '',
        `سيمحي الطلب <code>${esc(order.id)}</code> نهائياً`,
        `الزبون: ${esc(order.name ?? '')} · <code>${esc(order.phone ?? '')}</code>`,
        '',
        ...voidPlan([order]),
        '',
        'ما يبقى منّو والو — لا في اللوحة لا في التقارير. لا يمكن التراجع!',
      ].join('\n'),
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ نعم، امحيه', callback_data: `vdo:${order.id}` },
          { text: '❌ لا، تراجعت', callback_data: 'vdn:' },
        ]],
      },
    }).catch((error) => console.error('/void prompt failed:', error.message));
  }

  /*
   * /unvoid يبقى للإلغاء المحاسبي اللي يتصنع من اللوحة (voidedAt) —
   * الطلب الممسوح بـ /void ما يترجّعش، ما بقاش موجود أصلاً.
   */
  if (command === '/unvoid') {
    if (!arg) return reply('اكتب رقم الطلب: <code>/unvoid 260819-a1b2c</code>');

    const back = await unvoidOrder(arg, { by: displayName(message.from) });
    return reply(back.ok ? '↩️ رجع للدفاتر — يتحسب من جديد.' : `⚠️ ${esc(back.error)}`);
  }
}

/*
 * تسجيل الويبهوك بروحو: الفنكشن تعرف الـ secret (من الـ env) وتعرف رابط
 * الموقع، فتقدر تسجّل روحها عند تيليغرام. هكذا ما نحتاجوش حتى واحد يكتب
 * الـ secret بيدو في curl.
 *
 * 🔒 الرابط يتاخذ من `process.env.URL` (Netlify يحطّو، وهو رابط الموقع
 * الرسمي) وماشي من الـ request. لو اعتمدنا على الـ request، أي واحد يبعث
 * `Host: evil.com` يقدر يحوّل الويبهوك لعندو — وتيليغرام يبعثلو الـ secret
 * في الـ header. هذي ثغرة حقيقية، علاش الرابط ثابت.
 *
 * الاستدعاء آمن حتى لو عمومي: ديما يسجّل نفس الرابط بنفس الـ secret.
 */
async function setupWebhook() {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return { ok: false, error: 'TELEGRAM_WEBHOOK_SECRET is not configured' };

  const site = siteUrl();
  if (!site) return { ok: false, error: 'Site URL is not available in the environment' };

  const webhookUrl = `${site}/api/telegram-webhook`;

  await telegram('setWebhook', {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['callback_query', 'message'],
    /* التحديثات القديمة تتمسح — نقرات تجريب قديمة ما تخدمش على طلبات راحت */
    drop_pending_updates: true,
  });

  const info = await telegram('getWebhookInfo', {});
  return { ok: true, url: info.url, pending: info.pending_update_count };
}

async function handler(request) {
  if (request.method === 'GET' && new URL(request.url).searchParams.has('setup')) {
    /*
     * ⚠️ كان مفتوح للعالم كامل.
     *
     * التعليق فوق يقول "الاستدعاء آمن حتى لو عمومي: ديما يسجّل نفس
     * الرابط بنفس الـ secret" — وهذا صحيح على الرابط، بصح ناقص حاجة:
     * `drop_pending_updates: true`. أي واحد يعرف الرابط يقدر ينادي
     * عليه في حلقة ويرمي كل التحديثات اللي مستنّية — يعني نقرات
     * "قبول" و"رجعت" حقيقية تتمسح قبل ما توصل. مفتاح واحد يقفل
     * الباب، وهو موجود أصلاً في البيئة.
     *
     * نفس شكل التشغيل اليدوي تاع التقارير: ?key=<TELEGRAM_WEBHOOK_SECRET>
     */
    if (!cronAuthorized(request)) {
      return new Response(JSON.stringify({ ok: false, error: 'setup requires ?key=<TELEGRAM_WEBHOOK_SECRET>' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    }

    try {
      const result = await setupWebhook();
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 500,
        headers: { 'content-type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
  }

  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  /*
   * تيليغرام يزيد هذا الـ header إذا عطيتيه `secret_token` في setWebhook.
   * بلاه، أي واحد يعرف رابط الفنكشن يقدر يبعث نقرات مزوّرة.
   */
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    console.error('Rejected webhook call: bad or missing secret token');
    return new Response('Forbidden', { status: 403 });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  try {
    if (update.callback_query) await handleCallback(update.callback_query);
    else if (update.message?.reply_to_message) await handleReply(update.message);
    else if (update.message?.text?.startsWith('/')) await handleCommand(update.message);
    /* آخر واحد: رسالة عادية. handleFreeText تسكت على كل شي ما فيهش
       نيّة صريحة، فالهدرة العادية في الگروب ما تتلمسش. */
    else if (update.message?.text) await handleFreeText(update.message);
  } catch (error) {
    console.error('Webhook handler error:', error.message);
  }

  /* ديما 200: إذا رجعنا خطأ، تيليغرام يعاود يبعث نفس التحديث بلا فايدة */
  return new Response('ok');
}

/* توقيع Vercel هو (req,res) — الجسر في lib/http.mjs */
export default toVercel(handler);
