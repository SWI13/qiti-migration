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
import { requireAdmin, unauthorized } from '../lib/auth.mjs';
import {
  listCampaigns, getCampaign, saveCampaign, duplicateCampaign, deleteCampaign,
  listProducts, getProduct, saveProduct, deleteProduct,
  listCategories, saveCategory, deleteCategory, availableSlug,
  setVariantStock, listStockFor,
} from '../lib/catalog.mjs';
import { CATEGORY_PRESETS } from '../lib/category-presets.mjs';
import { listMedia, deleteMedia } from '../lib/media.mjs';
import { listOrders, listPendingOrders } from '../lib/store.mjs';
import { listLeads } from '../lib/leads.mjs';
import { renderSections, priceViewFor, blankSectionsFor } from '../lib/render/index.mjs';
import { renderPage } from '../lib/render/layout.mjs';
import { dashboardSummary } from '../lib/analytics.mjs';
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

  'products.list': async () => ok({ products: await listProducts() }),

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
     تفلتر/ترتّب من جهتها. قراءة برك: القبول/الرفض/التوصيل يبقاو من تيليغرام
     باش ما نكرّروش منطق المخزون/الإشعارات في زوج بلاصات. */
  'orders.list': async () => ok({ orders: await listOrders() }),
  /* بادج الشريط الجانبي — خفيفة، بلا ما تجيب الأرشيف كامل */
  'orders.pendingCount': async () => ok({ count: (await listPendingOrders()).length }),

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

  'stock.set': async (body) => ok({
    stock: await setVariantStock(
      body.productId,
      body.sku,
      Number(body.qty),
      body.threshold != null ? Number(body.threshold) : undefined,
    ),
  }),

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
    const html = renderPage({ content, campaign, product, priceView, siteOrigin: origin });
    return ok({ html });
  },
};

async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!await requireAdmin(request)) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return bad('Invalid request — expected JSON.');
  }

  const run = ACTIONS[body?.action];
  if (!run) return bad(`Unknown action: ${body?.action}`);

  try {
    return await run(body, request);
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
