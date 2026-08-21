/*
 * فنكشن اللوحة الإدارية — باب واحد لكل شيء (حملات، منتجات، فئات،
 * ميديا، مخزون، معاينة) بدل عشرة فنكشنات صغار.
 *
 * ⚠️ علاش باب واحد: كل أكشن يحتاج requireAdmin() قبلو. لو فرّقناهم
 * في فنكشنات، كل واحدة تنسى تتأكّد بيها لواحد، والنسيان هذاك يبقى
 * مخبّي حتى يوصل يستغلّو حد. باب واحد = فحص واحد ما ينسى.
 *
 * الطلب: POST { action, ...payload }. الجواب: JSON ديماً.
 * الأخطاء الجايّة من catalog.mjs (رابط مكرّر، سومة غالطة...) مكتوبة
 * بالدارجة للمشغّل روحو — نرجعوها كيما هي بـ 400.
 */
import { requireAdmin, adminSession, unauthorized } from '../lib/auth.mjs';
import {
  listCampaigns, getCampaign, saveCampaign, duplicateCampaign, deleteCampaign,
  listProducts, getProduct, saveProduct, deleteProduct,
  listCategories, saveCategory, deleteCategory, availableSlug,
  setVariantStock, listStockFor,
} from '../lib/catalog.mjs';
import { CATEGORY_PRESETS } from '../lib/category-presets.mjs';
import { listMedia, deleteMedia } from '../lib/media.mjs';
import { listOrders, listPendingOrders } from '../lib/store.mjs';
import { listLeads, listOpenLeads, logLeadCall, dismissLead } from '../lib/leads.mjs';
import {
  logOrderCall, sortQueue, queueStateOf, queueCounts, attemptCount, isCallOutcome,
} from '../lib/calls.mjs';
import {
  acceptOrder, denyOrder, confirmOrder, setDeliveryOutcome, receiveReturn, DASHBOARD_ACTOR,
  voidOrder, unvoidOrder,
} from '../lib/decisions.mjs';
import { repaintOrderQuietly } from '../lib/telegram.mjs';
import { ensureLegacyProduct } from '../lib/legacy-stock.mjs';
import { renderSections, priceViewFor, blankSectionsFor } from '../lib/render/index.mjs';
import { offerProductIds } from '../lib/offers.mjs';
import { renderPage } from '../lib/render/layout.mjs';
import { dashboardSummary, clearDashboardCache } from '../lib/analytics.mjs';
import { getSettings, saveSettings, NOTIFY_EVENTS } from '../lib/settings.mjs';
import { cancelShipment, sendShipment } from '../lib/ecotrack/shipments.mjs';
import { syncOpenShipments, retryFailedShipments } from '../lib/ecotrack/sync.mjs';
import { shipmentCancelled, shipmentCreated } from '../lib/notify.mjs';
import {
  logEvent, listEvents, eventsForOrder, getEvent, auditSummary, newRequestId, diff,
} from '../lib/audit.mjs';
import { toVercel } from '../lib/http.mjs';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

const ok = (data) => json(200, data);
/* رسالة الخطأ هنا ديماً موجّهة للمشغّل (دارجة) — تجي من catalog.mjs
   ولا من هنا روحنا، عمرها ما تكون تفاصيل تقنية خام */
const bad = (message) => json(400, { error: message });

/*
 * القرار الجاي من lib/decisions.mjs يرجع `{ ok, error }` بدل ما يرمي —
 * الفشل المتوقّع (مقبول مسبقاً، المخزون ما يكفيش) ماشي خطأ برنامج،
 * وله رسالة مكتوبة للمشغّل. نترجموه هنا لجواب HTTP.
 */
const decide = (result) => (result.ok ? ok({ order: result.order }) : bad(result.error));

/*
 * خيارات القرار الجايّة من اللوحة. المصدر ومعرّف الطلب يمشيو لسجلّ
 * التدقيق جوّا decisions.mjs — نفس القرار كي يجي من زرّ تيليغرام
 * ياخذ 'telegram'، فالسطر في السجلّ يقول منين تنقر.
 */
const decisionOptions = (body) => ({
  by: DASHBOARD_ACTOR,
  source: 'admin',
  requestId: (body && body.__audit && body.__audit.requestId) || null,
});

/**
 * يزيد على السجلّ الحسابات اللي تحتاجها الواجهة — الحالة في الصفّ وعدد
 * المحاولات.
 *
 * ⚠️ يتحسبو هنا وماشي في المتصفّح: الترتيب والفلترة والبادج كامل يتبنو
 * على نفس الحساب، ولو ينحسب في زوج بلاصات يوصل نهار يقولو حاجتين
 * مختلفين على نفس السطر.
 */
const decorate = (record, isLead = false, now = Date.now()) => {
  const row = isLead
    ? { ...record, isLead: true, kind: 'lead', id: `lead:${record.phone}`, total: record.cartTotal ?? 0 }
    : { ...record, kind: 'order' };
  return { ...row, queueState: queueStateOf(row, now), attempts: attemptCount(row) };
};

/** الصفّ كامل: طلبات بلا قرار + leads مفتوحين، مرتّبين بالأولوية */
async function queueRows() {
  const [orders, leads] = await Promise.all([listPendingOrders(), listOpenLeads()]);
  const now = Date.now();
  const rows = orders.map((order) => decorate(order, false, now))
    .concat(leads.map((lead) => decorate(lead, true, now)))
    .filter((row) => row.queueState !== 'closed');
  return sortQueue(rows, now);
}

/*
 * سجلّ الأكشنات. كل وحدة تاخذ (body, request) وترجع Response جاهزة.
 * سجلّ بلا كود متفرّع بزاف — أسهل تضيف أكشن جديد بلا ما تخربّق الباقي.
 */
const ACTIONS = {
  'campaigns.list': async () => ok({ campaigns: await listCampaigns() }),

  'campaigns.get': async (body) => {
    const campaign = await getCampaign(body.id);
    if (!campaign) return bad('Campaign not found.');
    return ok({ campaign });
  },

  'campaigns.save': async (body) => ok({ campaign: await saveCampaign(body.campaign ?? body) }),

  'campaigns.duplicate': async (body) => {
    const copy = await duplicateCampaign(body.id, { name: body.name, slug: body.slug });
    if (!copy) return bad('Could not find the campaign to duplicate.');
    return ok({ campaign: copy });
  },

  'campaigns.delete': async (body) => ok({ deleted: await deleteCampaign(body.id) }),

  /* تبديل الحالة بين مسودّة ومنشورة. body.status اختياري — بلاه نبدّل
     عكس الحالة الحالية، وهذا يخلّي زر "نشر/إلغاء النشر" وحدو يخدم للزوج */
  'campaigns.publish': async (body) => {
    const campaign = await getCampaign(body.id);
    if (!campaign) return bad('Campaign not found.');
    const status = body.status ?? (campaign.status === 'published' ? 'draft' : 'published');
    return ok({ campaign: await saveCampaign({ ...campaign, status }) });
  },

  /*
   * الهجرة تتنادى هنا بقصد: هذي أوّل بلاصة يمشي ليها المشغّل كي يسأل
   * "وين راه مخزون الطوق؟". تصرا مرّة وحدة، ومن بعدها هذا النداء
   * يولّي قراية مفتاح وحدة (شوف lib/legacy-stock.mjs).
   */
  'products.list': async () => {
    await ensureLegacyProduct().catch((error) =>
      console.error('Legacy product migration failed:', error.message));
    return ok({ products: await listProducts() });
  },

  /* المخزون تاع كل فاريانت معاه — اللوحة تعرض الجدول بلا طلب ثاني */
  'products.get': async (body) => {
    const product = await getProduct(body.id);
    if (!product) return bad('Product not found.');
    return ok({ product, stock: await listStockFor(product) });
  },

  'products.save': async (body) => ok({ product: await saveProduct(body.product ?? body) }),

  /*
   * الحذف ممنوع على منتج عندو تاريخ.
   *
   * علاش: الطلب يخزّن `productId` برك، والاسم يتقرا من الكاتالوغ وقت
   * ما يتبني التقرير. تمسح المنتج = كل طلباته القدام يولّيو بلا اسم
   * في "أفضل المنتجات" وفي المداخيل حسب الفئة. الرقم يبقى صحيح بصح
   * ما تعرفش تاع واش — وهذا يخسّر التقرير معناه.
   *
   * البديل موجود وما يخسّر والو: الأرشفة تحيّدو من المتجر وتخلّي
   * الأرقام كاملة. الحذف يبقى للّي تصنع بالغلط ومازال ما باعش.
   */
  'products.delete': async (body) => {
    const product = await getProduct(body.id);
    if (!product) return bad('Product not found.');

    const orders = await listOrders();
    const used = orders.filter((order) => order.productId === product.id).length;
    if (used) {
      return bad(`This product has ${used} order${used === 1 ? '' : 's'} in the history. `
        + 'Deleting it would leave those orders nameless in your reports — archive it instead: '
        + 'it leaves the store and keeps its numbers.');
    }

    return ok({ deleted: await deleteProduct(product.id) });
  },

  'categories.list': async () => ok({ categories: await listCategories() }),
  'categories.save': async (body) => ok({ category: await saveCategory(body.category ?? body) }),

  /* المنتجات ما تتمسحش — يولّيو بلا فئة (شوف deleteCategory). نرجّعو
     القائمة الطرية باش اللوحة ما تعاودش تطلبها. */
  'categories.delete': async (body) => ok({
    deleted: await deleteCategory(body.id),
    categories: await listCategories(),
  }),

  /* التصنيفة الجاهزة تسكن في lib/ — واللوحة ما تقدرش تقراها مباشرة
     (lib/ ما يتنشرش، شوف scripts/build.mjs)، فتمرّ من هنا */
  'categories.presets': async () => ok({ presets: CATEGORY_PRESETS }),

  /*
   * يزيد الفئات الجاهزة المختارة دفعة وحدة.
   *
   * علاش أكشن وحدة وماشي categories.save في حلقة من اللوحة: عشر فئات
   * = عشر رحلات على شبكة الجزائر، وأي وحدة تطيح في النص تخلّي نصف
   * الشغل مدار. هنا رحلة وحدة، والجواب يقول بالضبط شنو تزاد وشنو لا.
   *
   * السلاق المشغول ما يوقّفش الباقي — availableSlug يلقى واحد فاضي،
   * والفئة الموجودة بنفس السلاق تتقفز (skipped) بلا ما تتبدّل.
   */
  'categories.seedPresets': async (body) => {
    const wanted = Array.isArray(body.slugs) ? body.slugs : [];
    if (!wanted.length) return bad('Pick at least one category.');

    const existing = await listCategories();
    const taken = new Set(existing.map((category) => String(category.slug).toLowerCase()));
    let sort = existing.reduce((max, category) => Math.max(max, Number(category.sort) || 0), 0);

    const created = [];
    const skipped = [];
    for (const slug of wanted) {
      const preset = CATEGORY_PRESETS.find((entry) => entry.slug === slug);
      if (!preset) continue;
      if (taken.has(preset.slug)) { skipped.push(preset.slug); continue; }

      sort += 10;
      created.push(await saveCategory({
        name: preset.name,
        slug: await availableSlug('category', preset.slug),
        tagline: preset.tagline,
        emoji: preset.emoji,
        color: preset.color,
        sort,
      }));
    }

    return ok({ created, skipped, categories: await listCategories() });
  },

  'media.list': async () => ok({ media: await listMedia() }),
  'media.delete': async (body) => ok({ deleted: await deleteMedia(body.id) }),

  /* بلا فلاتر — القائمة نفسها اللي يستعملها /state في تيليغرام، اللوحة
     تفلتر/ترتّب من جهتها. صفحة الطلبات تبقى قراءة برك: الشغل (مكالمة،
     قبول، رفض) يصرا في صفّ المكالمات تحت، ماشي في لائحة الأرشيف. */
  'orders.list': async () => ok({ orders: await listOrders() }),
  /* بادج الشريط الجانبي — خفيفة، بلا ما تجيب الأرشيف كامل */
  'orders.pendingCount': async () => ok({ count: (await listPendingOrders()).length }),

  /*
   * ── صفّ المكالمات ────────────────────────────────────────────────
   *
   * كل شي يستنّى مكالمة ولا قرار، في لائحة وحدة مرتّبة: الطلبات بلا
   * قرار + الـ leads المفتوحين. الحساب (وقتاش المعاودة، قداش محاولة،
   * واش وصل لبلاصة القرار) يجي كامل من lib/calls.mjs — نفس الحساب
   * اللي يشوفو تيليغرام، باش الرقمين ما يختلفوش عمرهم.
   *
   * ⚠️ السطور اللي حالتها `closed` تتفلتر هنا وماشي في المتصفّح: هي
   * الفرق بين "صفّ يفرغ" و"لائحة تكبر"، وهذا هو معنى الميزة كاملة.
   */
  'queue.list': async () => {
    const rows = await queueRows();
    return ok({ rows, counts: queueCounts(rows) });
  },

  /* بادج القائمة الجانبية — الشغل اللي يستنّاك دروك، بلا اللي عندو موعد */
  'queue.count': async () => {
    const counts = queueCounts(await queueRows());
    return ok({ count: counts.confirmed + counts.due + counts.stalled, counts });
  },

  /*
   * يسجّل محاولة مكالمة. `kind` يفرّق بين طلب و lead — الزوج عندهم
   * نفس سجلّ المحاولات، بصح ما يتخزّنوش في نفس البلاصة (المفتاح تاع
   * الـ lead هو الرقم).
   */
  'queue.logCall': async (body) => {
    if (!isCallOutcome(body.outcome)) return bad('نتيجة مكالمة غير معروفة.');

    const input = { outcome: body.outcome, by: DASHBOARD_ACTOR, note: body.note, callbackAt: body.callbackAt };
    const updated = body.kind === 'lead'
      ? await logLeadCall(body.phone, input)
      : await logOrderCall(body.id, input);
    if (!updated) return bad('ما لقيناش هذا السطر — عاود حمّل الصفحة.');

    /* الطلب برك عندو رسالة في تيليغرام تتعاود ترسم — الـ lead عندو
       رسالتو الخاصة، وما نحبّوش نبدّلوها على كل محاولة. */
    if (body.kind !== 'lead') await repaintOrderQuietly(updated);

    return ok({ row: decorate(updated, body.kind === 'lead') });
  },

  /* lead ما تنفعش فيه مكالمة (رقم غالط، ولا كمّل المحاولات) — يخرج من الصفّ */
  'queue.dismissLead': async (body) => ok({ lead: await dismissLead(body.phone) }),

  /*
   * ── القرارات ─────────────────────────────────────────────────────
   *
   * نفس الفنكشنات اللي ينادي عليهم زرّ تيليغرام (lib/decisions.mjs):
   * نفس فحص المخزون، نفس لقطة التكاليف، نفس الرسم المجدّد للرسالة.
   * الفرق الوحيد هو اللي نقر.
   */
  'orders.confirm': async (body) => decide(await confirmOrder(body.id, decisionOptions(body))),
  'orders.accept': async (body) => decide(await acceptOrder(body.id, decisionOptions(body))),
  'orders.deny': async (body) => decide(await denyOrder(body.id, { ...decisionOptions(body), reason: body.reason })),
  'orders.delivery': async (body) =>
    decide(await setDeliveryOutcome(body.id, body.outcome, decisionOptions(body))),
  'orders.returnReceived': async (body) => decide(await receiveReturn(body.id, decisionOptions(body))),

  /*
   * الطلبات اللي ما كملوش — يبانو في نفس صفحة الطلبات بحالة "lead".
   *
   * ⚠️ ماشي في `orders.list`: خلطهم مع الطلبات في نفس اللائحة يخلّي
   * كل حساب مبني على state.orders (المداخيل، لوحة القيادة) يعدّ ناس
   * ما شراوش. مفصولين هنا، والصفحة وحدها هي اللي تدمجهم للعرض.
   */
  'leads.list': async () => ok({ leads: await listLeads() }),

  /* لوحة القيادة — كل أرقام الصفحة في طلب واحد. ستّة أكشنات صغار
     معناها ستّة رحلات على شبكة ضعيفة باش نعرضو شاشة وحدة. */
  'dashboard.summary': async (body) => ok({
    summary: await dashboardSummary({ days: Number(body.days) || 30 }),
  }),

  /*
   * ── إعدادات المحل ────────────────────────────────────────────────
   *
   * ⚠️ `saveSettings` كانت موجودة وما عندهاش حتى نادي: لا صفحة في
   * اللوحة، لا أكشن هنا، لا أمر في تيليغرام. يعني كل حاجة مبنية
   * عليها كانت مقفولة على قيمتها الافتراضية — الإرسال التلقائي ما
   * ينطفاش، نسبة الرجعة محبوسة في 50%، وكل مفاتيح الإشعارات ميّتة.
   * الكود يقرا الإعدادات في ستّ بلايص، وحتى واحد ما كان يقدر يكتبها.
   */
  'settings.get': async () => ok({ settings: await getSettings(), events: NOTIFY_EVENTS }),

  'settings.save': async (body) => ok({ settings: await saveSettings(body.settings ?? body) }),

  /*
   * إلغاء الطردة — نفس الملاحظة: `cancelShipment` كانت مكتوبة ومختبرة
   * وما توصلهاش حتى نقرة. المشغّل اللي يقبل طلب بالغلط والإرسال
   * التلقائي خدّام كان يلقى روحو بطردة عند الموصّل بلا زرّ يوقّفها.
   */
  'orders.cancelShipment': async (body) => {
    const result = await cancelShipment(body.id, { by: DASHBOARD_ACTOR, source: 'admin' });
    if (!result.ok) return bad(result.error);
    await shipmentCancelled(result.order).catch(() => {});
    return ok({ order: result.order });
  },

  /* إعادة إرسال طردة طاحت — الزرّ اللي يقابل رسالة الخطأ في تيليغرام */
  'orders.ship': async (body) => {
    const result = await sendShipment(body.id, { by: DASHBOARD_ACTOR, source: 'admin' });
    if (!result.ok) return bad(result.error);
    if (!result.already) await shipmentCreated(result.order).catch(() => {});
    return ok({ order: result.order, tracking: result.tracking, already: Boolean(result.already) });
  },

  'stock.set': async (body) => ok({
    stock: await setVariantStock(
      body.productId,
      body.sku,
      Number(body.qty),
      body.threshold != null ? Number(body.threshold) : undefined,
    ),
  }),

  /*
   * ── زرّ "زامن" ───────────────────────────────────────────────────
   *
   * ⚠️ هذا الزرّ كان مكتوب في README وفي تعليق sync.mjs روحو ("ثلاث
   * لحظات: الكرون، /sync، وزرّ زامن في اللوحة") وما كانش موجود. يعني
   * الطردة اللي وصلت عند الموصّل الصباح ما تدخلش في الربح حتى نصف
   * الليل، ولا حتى تكتب /sync في تيليغرام — واللوحة ما تعطيش طريقة.
   *
   * نرميو الكاش بعدها: بلاه تنقر، الطرود تتحدّث، والصفحة توري نفس
   * الأرقام لدقيقة — فتحسب الزرّ ما خدمش.
   */
  'shipments.sync': async () => {
    const sync = await syncOpenShipments({ actor: DASHBOARD_ACTOR });
    if (sync.skipped) return bad('الربط مع الموصّل غير مضبوط.');

    const retry = await retryFailedShipments({ by: DASHBOARD_ACTOR });
    clearDashboardCache();

    return ok({
      checked: sync.checked ?? 0,
      changed: sync.changed ?? 0,
      outcomes: sync.outcomes ?? 0,
      retried: retry.retried ?? 0,
      sent: retry.sent ?? 0,
    });
  },

  /*
   * ── إخراج طلب من الدفاتر ─────────────────────────────────────────
   * طلب تجريبي، ولا نتيجة توصيل تسجّلت بالغلط. السجلّ يبقى، الأرقام
   * تنساه. شوف voidOrder في decisions.mjs.
   */
  'orders.void': async (body) => {
    const result = await voidOrder(body.id, { ...decisionOptions(body), reason: body.reason });
    if (!result.ok) return bad(result.error);
    clearDashboardCache();
    return ok({ order: result.order });
  },

  'orders.unvoid': async (body) => {
    const result = await unvoidOrder(body.id, decisionOptions(body));
    if (!result.ok) return bad(result.error);
    clearDashboardCache();
    return ok({ order: result.order });
  },

  /*
   * ── سجلّ التدقيق ─────────────────────────────────────────────────
   *
   * قراية برك. ما كاين لا `logs.delete` لا `logs.edit` — السجلّ
   * append-only بقصد: سجلّ يقدر يتبدّل من نفس اللوحة اللي يراقبها
   * ما يسوى والو كي تحتاجو. التقليم الوحيد هو LTRIM الآلي في
   * lib/audit.mjs (سقف الاحتفاظ)، وما عندو حتى زرّ.
   */
  /*
   * ⚠️ الفلاتر تجي في `body.filters` وماشي في جذر الجسم: `body.action`
   * راهو اسم الأكشن تاع اللوحة روحو ("logs.list")، فلو قرينا الفلتر
   * منّو، كل استعلام يفلتر على فعل اسمو `logs.list` — ويرجّع صفر
   * سطر ديما. طاحت مرّة، والفحص هو اللي شدّها.
   */
  'logs.list': async (body) => {
    const filters = body.filters ?? {};
    return ok(await listEvents({
      q: filters.q, source: filters.source, status: filters.status, action: filters.action,
      actor: filters.actor, entityType: filters.entityType, orderId: filters.orderId,
      productId: filters.productId, customerPhone: filters.customerPhone,
      from: filters.from, to: filters.to, page: filters.page, limit: filters.limit,
    }));
  },

  'logs.get': async (body) => {
    const event = await getEvent(body.id);
    if (!event) return bad('Log entry not found — it may have aged out of retention.');
    return ok({ event });
  },

  'logs.summary': async () => ok({ summary: await auditSummary() }),

  /* الخطّ الزمني تاع طلب — من الأقدم للأحدث، كيما صرا */
  'logs.order': async (body) => {
    if (!body.id) return bad('Order id is required.');
    return ok({ events: await eventsForOrder(body.id) });
  },

  /* أقسام فارغة جاهزة حسب نوع المنتج — تخدم كي اللوحة تبدا حملة جديدة */
  'sections.blank': async (body) => ok({ sections: blankSectionsFor(body.type) }),

  /*
   * معاينة مباشرة: نديرو رندر لمعطيات الحملة **كيما هي دروك في اللوحة**،
   * بلا ما نخزّنوها. هذا هو اللي يخلّي المعاينة تعكس الصفحة الحقيقية
   * بالضبط — نفس renderSections/renderPage اللي يستعملهم render.mjs.
   */
  preview: async (body, request) => {
    const campaign = body.campaign ?? {};
    const product = body.productId ? await getProduct(body.productId) : null;
    const priceView = priceViewFor(product);
    /* preview:true يقتل زرّ الطلب — وإلا تجريب الفورم في اللوحة يطيّح
       طلبية حقيقية بإشعار واتصال لرقم وهمي */
    const content = renderSections(campaign, product, { preview: true });
    const origin = new URL(request.url).origin;
    const html = renderPage({ content, campaign, product, priceView, siteOrigin: origin, preview: true });
    return ok({ html });
  },
};

/*
 * ── واش يتسجّل في سجلّ التدقيق ─────────────────────────────────────
 *
 * ⚠️ قائمة بيضا، ماشي "سجّل كلشي". `products.list` و`queue.count`
 * يتنادو كل دقيقة من اللوحة روحها — لو دخلو للسجلّ، الأحداث اللي
 * تهمّ (حذف منتج، تبديل سومة) يغرقو وسط آلاف سطور القراية، والسجلّ
 * يولّي ما يتقراش. اللي هنا هو اللي يبدّل حاجة ولا يمسّ الأمان.
 *
 * كل مدخلة:
 *   action      — اسم الحدث في السجلّ
 *   entityType  — نوع الكيان (product / campaign / order / settings…)
 *   id          — (body, data) → معرّف الكيان
 *   before      — (body) → لقطة قبل التنفيذ (تتقرا قبل ما يجري الأكشن)
 *   after       — (data, body) → لقطة بعد
 *   describe    — (body, data) → سطر يقراه بني آدم
 *   orderId     — (body, data) → ربط الحدث بطلب، كي يكون
 */
const AUDITED = {
  'products.save': {
    action: 'product.saved', entityType: 'product',
    id: (body, data) => data?.product?.id ?? body.product?.id ?? body.id,
    before: async (body) => {
      const id = body.product?.id ?? body.id;
      return id ? getProduct(id).catch(() => null) : null;
    },
    after: (data) => data?.product ?? null,
    describe: (body, data) => (body.product?.id ?? body.id
      ? `Product updated: ${data?.product?.name ?? ''}`
      : `Product created: ${data?.product?.name ?? ''}`),
  },
  'products.delete': {
    action: 'product.deleted', entityType: 'product',
    id: (body) => body.id,
    before: (body) => getProduct(body.id).catch(() => null),
    after: () => ({ deleted: true }),
    describe: (body) => `Product deleted: ${body.id}`,
  },
  'stock.set': {
    action: 'stock.changed', entityType: 'product',
    id: (body) => body.productId,
    /*
     * ⚠️ `listStockFor` تاخذ المنتج كامل (تمشي على `variants`) وترجّع
     * `{ variant, stock }` — ماشي صفوف مسطّحة. نجيبو المنتج قبل، وإلا
     * اللقطة "قبل" ترجع فارغة والسجلّ يقول الكمية جات من العدم.
     */
    before: async (body) => {
      const item = await getProduct(body.productId).catch(() => null);
      if (!item) return null;
      const rows = await listStockFor(item).catch(() => []);
      const row = rows.find((one) => one.variant?.sku === body.sku);
      return row?.stock ? { qty: row.stock.qty, threshold: row.stock.threshold } : null;
    },
    after: (data) => (data?.stock ? { qty: data.stock.qty, threshold: data.stock.threshold } : null),
    describe: (body) => `Stock set for ${body.productId} (${body.sku})`,
  },
  'campaigns.save': {
    action: 'campaign.saved', entityType: 'campaign',
    id: (body, data) => data?.campaign?.id ?? body.campaign?.id ?? body.id,
    before: async (body) => {
      const id = body.campaign?.id ?? body.id;
      return id ? getCampaign(id).catch(() => null) : null;
    },
    after: (data) => data?.campaign ?? null,
    describe: (body, data) => `Campaign saved: ${data?.campaign?.name ?? body.campaign?.name ?? ''}`,
  },
  'campaigns.publish': {
    action: 'campaign.published', entityType: 'campaign',
    id: (body) => body.id,
    before: (body) => getCampaign(body.id).catch(() => null),
    after: (data) => data?.campaign ?? null,
    describe: (body, data) => `Campaign ${data?.campaign?.status === 'published' ? 'published' : 'unpublished'}: ${data?.campaign?.name ?? body.id}`,
  },
  'campaigns.delete': {
    action: 'campaign.deleted', entityType: 'campaign',
    id: (body) => body.id,
    before: (body) => getCampaign(body.id).catch(() => null),
    after: () => ({ deleted: true }),
    describe: (body) => `Campaign deleted: ${body.id}`,
  },
  'campaigns.duplicate': {
    action: 'campaign.duplicated', entityType: 'campaign',
    id: (body, data) => data?.campaign?.id ?? body.id,
    describe: (body, data) => `Campaign duplicated from ${body.id} → ${data?.campaign?.id ?? ''}`,
  },
  'categories.save': {
    action: 'category.saved', entityType: 'category',
    id: (body, data) => data?.category?.id ?? body.category?.id ?? body.id,
    after: (data) => data?.category ?? null,
    describe: (body, data) => `Category saved: ${data?.category?.name ?? ''}`,
  },
  'categories.delete': {
    action: 'category.deleted', entityType: 'category',
    id: (body) => body.id,
    describe: (body) => `Category deleted: ${body.id}`,
  },
  'categories.seedPresets': {
    action: 'category.seeded', entityType: 'category',
    describe: (body, data) => `Seeded ${data?.created?.length ?? 0} preset categories`,
  },
  'media.delete': {
    action: 'media.deleted', entityType: 'media',
    id: (body) => body.id,
    describe: (body) => `Media deleted: ${body.id}`,
  },
  'settings.save': {
    action: 'settings.changed', entityType: 'settings',
    id: () => 'settings',
    before: () => getSettings().catch(() => null),
    after: (data) => data?.settings ?? null,
    describe: () => 'Store settings changed',
  },
  'queue.logCall': {
    action: 'call.logged', entityType: (body) => (body.kind === 'lead' ? 'lead' : 'order'),
    id: (body) => body.id ?? body.phone,
    orderId: (body) => (body.kind === 'lead' ? null : body.id),
    describe: (body) => `Call logged: ${body.outcome}`,
  },
  'queue.dismissLead': {
    action: 'lead.dismissed', entityType: 'lead',
    id: (body) => body.phone,
    describe: (body) => `Lead dismissed: ${body.phone}`,
  },
  /*
   * ⚠️ `orders.ship` و`orders.cancelShipment` ما راهمش هنا: الطردة
   * تسجّل روحها في lib/ecotrack/shipments.mjs (باش الإرسال
   * التلقائي وأمر تيليغرام يدخلو تاني). وصف هنا معناه سطرين على
   * نفس الحدث، والسجلّ اللي يعدّ مرّتين ما يتثق فيه في والو.
   */
  'shipments.sync': {
    action: 'shipments.synced', entityType: 'shipment',
    describe: (body, data) => `Carrier sync: ${data?.checked ?? 0} checked, ${data?.changed ?? 0} changed`,
  },
};

/*
 * ⚠️ القرارات (قبول، رفض، توصيل، إلغاء من الدفاتر، محو) ما راهمش
 * هنا بقصد — يتسجّلو جوّا lib/decisions.mjs باش نقرة تيليغرام ونقرة
 * اللوحة يعطيو نفس السطر. اللي نزيدوه هنا هو `source: 'admin'` برك.
 */
const DECIDES_ITSELF = /^orders\.(confirm|accept|deny|delivery|returnReceived|void|unvoid)$/;

async function runAudited(action, body, request, run) {
  const descriptor = Object.hasOwn(AUDITED, action) ? AUDITED[action] : null;
  const session = adminSession(request);
  const requestId = request.headers.get('x-request-id') || newRequestId();

  const context = {
    source: 'admin',
    actorType: 'admin',
    actorName: DASHBOARD_ACTOR,
    actorId: session?.sessionId ?? null,
    requestId,
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: request.headers.get('user-agent'),
  };

  /* القرارات تسجّل روحها — نمرّرو ليها المصدر برك */
  if (DECIDES_ITSELF.test(action)) {
    return run({ ...body, __audit: context }, request);
  }

  if (!descriptor) return run(body, request);

  const before = descriptor.before ? await descriptor.before(body).catch(() => null) : null;

  let response;
  try {
    response = await run(body, request);
  } catch (error) {
    await logEvent({
      ...context,
      action: descriptor.action,
      status: 'failed',
      error: error.message,
      entityType: typeof descriptor.entityType === 'function' ? descriptor.entityType(body) : descriptor.entityType,
      entityId: descriptor.id ? descriptor.id(body, null) : null,
      orderId: descriptor.orderId ? descriptor.orderId(body, null) : null,
      description: descriptor.describe ? descriptor.describe(body, null) : action,
    });
    throw error;
  }

  /*
   * ⚠️ الجواب يتقرا بنسخة (clone): `response.json()` تستهلك الجسم،
   * واللي يرجع للوحة يولّي فارغ. هاذي طاحت مرّة في مشاريع أخرى
   * بنفس الشكل بالضبط — الأكشن يخدم، والصفحة تبقى تدور.
   */
  const data = await response.clone().json().catch(() => null);
  const failed = response.status >= 400;

  const after = descriptor.after ? descriptor.after(data, body) : null;
  const changes = before || after ? diff(before, after) : { oldValues: null, newValues: null };

  await logEvent({
    ...context,
    action: descriptor.action,
    status: failed ? 'failed' : 'success',
    error: failed ? data?.error ?? 'failed' : null,
    entityType: typeof descriptor.entityType === 'function' ? descriptor.entityType(body) : descriptor.entityType,
    entityId: descriptor.id ? descriptor.id(body, data) : null,
    orderId: descriptor.orderId ? descriptor.orderId(body, data) : null,
    productId: descriptor.entityType === 'product' ? (descriptor.id ? descriptor.id(body, data) : null) : null,
    description: descriptor.describe ? descriptor.describe(body, data) : action,
    oldValues: changes.oldValues,
    newValues: changes.newValues,
  });

  return response;
}

async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!await requireAdmin(request)) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return bad('Invalid request — expected JSON.');
  }

  /* ⚠️ `hasOwn` ماشي زينة: `ACTIONS['constructor']` ولا `ACTIONS['toString']`
     يرجّعو فنكشن موروثة من Object، فنداء بـ action:"constructor" كان
     ينفّذها ويرجّع حاجة ماشي Response — والجسر يطيح بـ 500 غامض بدل
     "أكشن ما نعرفوهش". */
  const action = typeof body?.action === 'string' ? body.action : '';
  const run = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : null;
  if (!run) return bad(`Unknown action: ${action}`);

  try {
    return await runAudited(action, body, request, run);
  } catch (error) {
    /* الأخطاء الجايّة من catalog.mjs مكتوبة بالدارجة للمشغّل — نرجعوها
       كيما هي. أي خطأ آخر (بلوب طاح، الخ) يبان برسالتو الخام، أحسن من
       نخبّيوه ونخلّي المشغّل ما يفهمش علاش تعطّل. */
    console.error(`Admin action "${body?.action}" failed:`, error.message);
    return bad(error.message);
  }
}

/* توقيع Vercel هو (req,res) — الجسر في lib/http.mjs */
export default toVercel(handler);
