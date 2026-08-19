/*
 * طبقة تجميع للوحة القيادة — قراءة برك، إدارية برك (admin-api.mjs يدير
 * requireAdmin قبل ما ينادي هنا، هذا الملف ما يتأكّدش بروحو).
 *
 * علاش memo بـ 60 ثانية: كل تحميل للوحة يبعث نفس الطلب تقريبًا (F5، تبديل
 * تبويب...)، وحساب المجاميع يمرّ على مئات الطلبات + كل المنتجات/المخزون.
 * كاش بسيط في نطاق الموديل (يعيش بين الاستدعاءات الدافئة، يفنى مع
 * cold start — وهذا عادي، ماشي مشكل) يوفّر عليها بلا تعقيد إضافي.
 */
import { listOrdersInRange, algiersDate, getStock, getCosts, normalizeDzPhone } from './store.mjs';
import { profitFor, goodsTotal } from './message.mjs';
import { bundleLines, upsellLine, orderLines, orderStockRefs } from './offers.mjs';
import { listProducts, listCategories, listAllVariantStock, listCampaigns } from './catalog.mjs';
import { listVisitDays, firstVisitDay } from './visits.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 60_000;
const cache = new Map();

/** أي قيمة برّا 7/30/90 ترجع 30 — نفس فكرة السقف تاع recordVisit، ماشي كل مدخل مقبول */
const clampDays = (value) => ([7, 30, 90].includes(Number(value)) ? Number(value) : 30);

/**
 * لائحة أيام YYYY-MM-DD تصاعدي، آخر واحد هو يوم `now`.
 * نفرّق بالوقت الحقيقي (ms) ماشي بحساب تقويم — نفس حيلة weekly-report.mjs،
 * صحيحة على خاطر الجزائر UTC+1 بلا توقيت صيفي (بلا قفزة ساعة تخربّق العدّ).
 */
function dayRange(now, count) {
  return Array.from({ length: count }, (_, i) => algiersDate(new Date(now.getTime() - (count - 1 - i) * DAY_MS)));
}

export async function dashboardSummary({ days = 30, now = new Date() } = {}) {
  const clamped = clampDays(days);
  const cacheKey = `${clamped}:${algiersDate(now)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  const value = await computeDashboardSummary(clamped, now);
  cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

async function computeDashboardSummary(days, now) {
  const dayList = dayRange(now, days);
  const startDay = dayList[0];
  const endDay = dayList[dayList.length - 1];

  /* نافذة سابقة بنفس الطول، ملاصقة مباشرة لهذي — أساس نسبة التغيّر (revenuePrev) */
  const prevEndDay = algiersDate(new Date(now.getTime() - days * DAY_MS));
  const prevStartDay = algiersDate(new Date(now.getTime() - (2 * days - 1) * DAY_MS));

  const [orders, prevOrders, products, categories, variantStockRows, legacyStock, visitDays, trackingSince, campaigns, costs] =
    await Promise.all([
      listOrdersInRange(startDay, endDay),
      listOrdersInRange(prevStartDay, prevEndDay),
      listProducts(),
      listCategories(),
      listAllVariantStock(),
      getStock(),
      listVisitDays(startDay, endDay),
      firstVisitDay(),
      listCampaigns(),
      getCosts(),
    ]);

  const productById = new Map(products.map((p) => [p.id, p]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  /*
   * نفس المنطق بالضبط تاع daily-report.mjs/weekly-report.mjs: "مقبول"
   * ماشي فلوس حقيقية (تقدر ترجع مع المُوصّل)، فالمداخيل من `delivered` برك.
   */
  const isDelivered = (o) => o.status === 'accepted' && o.deliveryStatus === 'delivered';
  const delivered = orders.filter(isDelivered);
  const denied = orders.filter((o) => o.status === 'denied');
  const pending = orders.filter((o) => o.status === 'pending');
  const returned = orders.filter((o) => o.status === 'accepted' && o.deliveryStatus === 'returned');
  const inTransit = orders.filter((o) => o.status === 'accepted' && !o.deliveryStatus);

  const revenue = delivered.reduce((sum, o) => sum + goodsTotal(o), 0);

  /*
   * الربح الصافي — نفس حساب تقرير آخر النهار بالضبط (profitFor في
   * message.mjs)، ماشي حساب موازي: رقمين مختلفين لنفس الشي في اللوحة
   * وفي التيليغرام يخلّي التاجر ما يثق لا في هذا لا في هذاك.
   *
   * الرجعات تنقص من الربح (خسارة حقيقية: البضاعة راحت وجات)، بصح ما
   * تنقصش من المداخيل — المداخيل هي اللي خلّصو الزبائن فعلاً.
   */
  const profit = delivered.reduce((sum, o) => sum + profitFor(o, costs), 0)
    + returned.reduce((sum, o) => sum + profitFor(o, costs), 0);
  const profitPrev = prevOrders.filter(isDelivered).reduce((sum, o) => sum + profitFor(o, costs), 0)
    + prevOrders.filter((o) => o.status === 'accepted' && o.deliveryStatus === 'returned')
      .reduce((sum, o) => sum + profitFor(o, costs), 0);
  const revenuePrev = prevOrders.filter(isDelivered).reduce((sum, o) => sum + goodsTotal(o), 0);
  const aov = delivered.length ? Math.round(revenue / delivered.length) : 0;
  /* "منتجات مباعة" — وحدات الطلبات الموصّلة برك، نفس تعريف المداخيل */
  const unitsSold = delivered.reduce((sum, o) => sum + (o.qty ?? 0), 0);

  /* زبون بلا رقم صالح ما يتوقّعش من العدّ — نستعمل رقمو الخام كمفتاح بدل ما نرميه */
  const customerKeys = new Set(orders.map((o) => normalizeDzPhone(o.phone) ?? o.phone));

  const visits = visitDays.reduce((sum, d) => sum + (d.totals?.uniques ?? 0), 0);
  const views = visitDays.reduce((sum, d) => sum + (d.totals?.views ?? 0), 0);

  /*
   * الباقات والعرض الإضافي.
   *
   * ── علاش نسبة القبول تتحسب على المعروض ماشي على الكل ──────────────
   * العرض الإضافي يبان غير في الحملات اللي مفعّل فيها. لو قسمناه على
   * كل الطلبات، النسبة تهبط كل ما تزيد حملة بلا عرض — ويبان كأنّ
   * العرض راه يخسر، وهو ما تعرضش أصلاً. `upsellOffered` تتخزّن على
   * الطلب وقت ما يتسجّل (شوف api/order.mjs).
   *
   * المداخيل هنا من الطلبات الموصّلة برك — نفس تعريف revenue فوق.
   */
  const bundleOrders = delivered.filter((o) => bundleLines(o).length);
  const bundleRevenue = bundleOrders.reduce((sum, o) =>
    sum + bundleLines(o).reduce((line, l) => line + (l.lineTotal ?? 0), 0), 0);
  const bundleUnits = bundleOrders.reduce((sum, o) =>
    sum + bundleLines(o).reduce((line, l) => line + (l.qty ?? 0), 0), 0);

  const upsellOffers = orders.filter((o) => o.upsellOffered).length;
  const upsellAccepted = orders.filter((o) => upsellLine(o)).length;
  const upsellRevenue = delivered.reduce((sum, o) => sum + (upsellLine(o)?.lineTotal ?? 0), 0);

  const offers = {
    bundleOrders: bundleOrders.length,
    bundleUnits,
    bundleRevenue,
    bundleShare: delivered.length ? bundleOrders.length / delivered.length : null,
    upsellOffers,
    upsellAccepted,
    upsellRate: upsellOffers ? upsellAccepted / upsellOffers : null,
    upsellRevenue,
    /* المدخول الزايد على كل طلبية موصّلة — الرقم اللي يقولّك واش
       العرض يستاهل يبقى ولا لا */
    upsellPerOrder: delivered.length ? Math.round(upsellRevenue / delivered.length) : 0,
  };

  const kpis = {
    revenue,
    revenuePrev,
    profit,
    profitPrev,
    ordersPlaced: orders.length,
    delivered: delivered.length,
    denied: denied.length,
    pending: pending.length,
    returned: returned.length,
    inTransit: inTransit.length,
    aov,
    unitsSold,
    customers: customerKeys.size,
    visits,
    views,
    conversionRate: visits > 0 ? orders.length / visits : null,
    trackingSince,
    offers,
  };

  /*
   * المداخيل تتجمّع بيوم **الطلب** ماشي يوم التوصيل، عمدًا: آخر 2-3 أيام
   * ديما يبانو ناقصين على خاطر التوصيل يتأخّر — pipeline (الطلبات "في
   * الطريق") تولّد جنبها باش الواجهة ترسمها كخط ثاني باهت، ماشي كأنها هبطة حقيقية.
   */
  const visitsByDay = new Map(visitDays.map((d) => [d.day, d.totals?.uniques ?? 0]));
  const revenueByDay = new Map();
  const pipelineByDay = new Map();
  const ordersByDay = new Map();
  for (const order of orders) {
    const placedDay = algiersDate(new Date(order.createdAt));
    ordersByDay.set(placedDay, (ordersByDay.get(placedDay) ?? 0) + 1);
    if (isDelivered(order)) {
      revenueByDay.set(placedDay, (revenueByDay.get(placedDay) ?? 0) + goodsTotal(order));
    } else if (order.status === 'accepted' && !order.deliveryStatus) {
      pipelineByDay.set(placedDay, (pipelineByDay.get(placedDay) ?? 0) + goodsTotal(order));
    }
  }

  const series = {
    days: dayList,
    revenue: dayList.map((d) => revenueByDay.get(d) ?? 0),
    pipeline: dayList.map((d) => pipelineByDay.get(d) ?? 0),
    orders: dayList.map((d) => ordersByDay.get(d) ?? 0),
    visits: dayList.map((d) => visitsByDay.get(d) ?? 0),
  };

  /*
   * productId=null يجي من صفحة الهبوط القديمة (index.html بلا فورم منتج) —
   * فلوس حقيقية، ما نرميوهاش، نجمّعوها تحت صفّ وحيد بـ productId:null
   * (وتسمية العرض تبقى شغل الواجهة، هي اللي عندها i18n).
   */
  /*
   * ⚠️ التوزيع يمرّ على السطور، ماشي على `order.productId` وحدو.
   *
   * قبل، الطلب اللي فيه باقة يتحسب تحت `productId: null` — والباقة ما
   * عندهاش productId بطبيعتها. النتيجة: باقة تبيع طوق وحزام، والزوج
   * ما يبانوش في "أفضل المنتجات"، والمداخيل كاملة تطيح في صفّ بلا
   * اسم. نفس الشي للعرض الإضافي. كل ما تبيع بالباقات أكثر، كل ما
   * الصفحة اللي تقولّك واش يبيع تولّي عمية أكثر.
   *
   * المداخيل تتوزّع على السطور بسومتها، والوحدات بكميتها الحقيقية
   * (عنصر ×2 في باقة ×3 = ستّ وحدات).
   */
  const productAgg = new Map();
  const categoryAgg = new Map();

  const addTo = (map, key, { revenue = 0, units = 0, orders = 0 }) => {
    const entry = map.get(key) ?? { revenue: 0, units: 0, orders: 0 };
    entry.revenue += revenue;
    entry.units += units;
    entry.orders += orders;
    map.set(key, entry);
  };

  for (const order of delivered) {
    /* التوصيل يتقصّ مرّة وحدة على مستوى الطلب — نوزّعو مدخول السلعة
       على السطور بنسبة سومة كل سطر، باش المجموع يبقى = revenue */
    const lines = orderLines(order);
    const linesSum = lines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0);
    const goods = goodsTotal(order);
    const share = (line) => (linesSum > 0 ? (goods * (line.lineTotal ?? 0)) / linesSum : 0);

    const touched = new Set();

    for (const line of lines) {
      if (line.kind === 'bundle') {
        /* الباقة تتوزّع على عناصرها بالتساوي في الوحدات، وبالسومة
           في المدخول — ما نعرفوش شحال يسوى كل عنصر جوّا الباقة */
        const items = line.items ?? [];
        const totalUnits = items.reduce((sum, item) => sum + item.qty * line.qty, 0) || 1;
        for (const item of items) {
          const units = item.qty * line.qty;
          addTo(productAgg, item.productId ?? null, {
            revenue: (share(line) * units) / totalUnits,
            units,
          });
          touched.add(item.productId ?? null);
        }
      } else {
        addTo(productAgg, line.productId ?? null, { revenue: share(line), units: line.qty ?? 0 });
        touched.add(line.productId ?? null);
      }
    }

    /* عدد الطلبات يتحسب مرّة لكل منتج في الطلب، ماشي مرّة لكل سطر */
    for (const pid of touched) addTo(productAgg, pid, { orders: 1 });
  }

  /* الفئات تتبنى من المنتجات بعد ما يكمّل التوزيع — أبسط من نتبّعوها
     في نفس الحلقة، ونفس النتيجة بالضبط */
  for (const [pid, agg] of productAgg) {
    const cid = (pid ? productById.get(pid)?.categoryId : null) ?? null;
    addTo(categoryAgg, cid, { revenue: agg.revenue, units: agg.units });
  }

  const topProducts = [...productAgg.entries()]
    .map(([productId, agg]) => ({
      productId,
      name: productId ? (productById.get(productId)?.name ?? null) : null,
      /* التوزيع على السطور يعطي كسور — الواجهة توري دنانير، ماشي سنتيمات */
      revenue: Math.round(agg.revenue),
      units: agg.units,
      orders: agg.orders,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const byCategory = [...categoryAgg.entries()]
    .map(([categoryId, agg]) => ({
      categoryId,
      name: categoryId ? (categoryById.get(categoryId)?.name ?? null) : null,
      revenue: Math.round(agg.revenue),
      units: agg.units,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  /*
   * طلبات صفحة المنتج المباشرة عندها campaignId بصيغة `product:<id>`
   * (شوف render.mjs pseudoCampaign) — هذا عمرو ما يطابق `id` تاع حملة
   * حقيقية (newId('cmp_'))، فمقارنة === عادية تقصيهم لوحدها، بلا حاجة
   * لأي معالجة خاصة للسابقة.
   */
  const campaignRows = campaigns
    .filter((c) => c.status === 'published')
    .map((c) => {
      const pageKey = `campaign:${c.id}`;
      const cVisits = visitDays.reduce((sum, d) => sum + (d.pages?.[pageKey]?.uniques ?? 0), 0);
      const cOrders = orders.filter((o) => o.campaignId === c.id);
      const cRevenue = cOrders.filter(isDelivered).reduce((sum, o) => sum + goodsTotal(o), 0);
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        status: c.status,
        visits: cVisits,
        orders: cOrders.length,
        revenue: cRevenue,
        conversionRate: cVisits > 0 ? cOrders.length / cVisits : null,
      };
    })
    .sort((a, b) => b.visits - a.visits);

  /*
   * المخزون في بلاصتين: variant-stock (لكل فاريانت، طلبات فيهم productId)
   * وstock/current القديم (عدّاد وحيد، طلبات الصفحة القديمة بلا productId).
   * لازم الاثنين يبانو هنا، وإلا صفّ كامل من المخزون يبقى أعمى عن اللوحة.
   */
  const lowStockRows = [];
  for (const row of variantStockRows) {
    if (row.qty > row.threshold) continue;
    const product = productById.get(row.productId);
    const variant = product?.variants?.find((v) => v.sku === row.sku);
    const labels = variant?.options && Object.keys(variant.options).length
      ? Object.entries(variant.options).map(([k, v]) => `${k}: ${v}`).join(' · ')
      : null;
    lowStockRows.push({
      productId: row.productId,
      productName: product?.name ?? null,
      sku: row.sku,
      variantLabel: labels,
      qty: row.qty,
      threshold: row.threshold,
    });
  }
  /*
   * العدّاد العام القديم يبان غير إذا ما زال فيه شي حاجة.
   *
   * ⚠️ بعد هجرة الطوق (lib/legacy-stock.mjs) العدّاد يرجع صفر، وصفر
   * ديما تحت حدّ التنبيه — فبلا هاذ الشرط تبقى بطاقة "مخزون قليل"
   * على عدّاد ميّت، للأبد. وتنبيه ما ينطفيش عمرو يعلّم العين تتخطّى
   * البطاقة كاملة، بما فيها التنبيهات الحقيقية.
   */
  if (legacyStock.qty > 0 && legacyStock.qty <= legacyStock.threshold) {
    lowStockRows.push({
      productId: null, productName: null, sku: null, variantLabel: null,
      qty: legacyStock.qty, threshold: legacyStock.threshold,
    });
  }
  const lowStock = lowStockRows.sort((a, b) => a.qty - b.qty).slice(0, 20);

  /*
   * ── المخزون المحجوز ──────────────────────────────────────────────
   *
   * المخزون ينقص وقت **القبول**، ماشي وقت الطلب — وهذا صحيح في الدفع
   * عند الاستلام: الطلب بلا تأكيد ماشي بيعة. بصح معناه اللوحة تقول
   * "عندك 10" وانت عندك 8 طلبات تستنّى قرار على نفس السلعة. تقبلهم
   * كامل، وآخر زوج يترفضو بـ "المخزون ما يكفيش" — بعد ما تكون قلتلهم
   * في التيليفون بلّي الطلبية خدّامة.
   *
   * `committed` هو الرقم اللي كان ناقص: شحال وحدة موعودة في طلبات
   * ما تقرّرش فيها. `available` = اللي عندك ناقص اللي وعدت بيه.
   */
  const committedBySku = new Map();
  for (const order of pending) {
    for (const ref of orderStockRefs(order)) {
      const key = `${ref.productId}:${ref.sku}`;
      committedBySku.set(key, (committedBySku.get(key) ?? 0) + ref.qty);
    }
  }

  const reserved = [...committedBySku.entries()]
    .map(([key, committed]) => {
      const [productId, sku] = key.split(':');
      const row = variantStockRows.find((r) => r.productId === productId && r.sku === sku);
      const onHand = row?.qty ?? 0;
      return {
        productId,
        productName: productById.get(productId)?.name ?? null,
        sku,
        onHand,
        committed,
        available: onHand - committed,
      };
    })
    /* الأخطر فوق: اللي وعدت بيه أكثر مما عندك */
    .sort((a, b) => a.available - b.available);

  /*
   * ── واش يستنّاك ──────────────────────────────────────────────────
   *
   * ⚠️ اللوحة كانت توري إحصائيات برك — مداخيل، ربح، تحويل. أرقام
   * مليحة، بصح ما تقولش واش تدير دروك. الفرق بين "12 طلب في الانتظار"
   * و"12 طلب يستنّاو مكالمة" هو الفرق بين لوحة تتفرّج عليها ولوحة
   * تخدم بيها.
   *
   * كل صفّ هنا لازم يكون حاجة **تتدار**، ماشي حاجة تتعرف.
   */
  const shipmentFailed = orders.filter((o) =>
    o.status === 'accepted' && o.shipment?.state === 'failed');
  /* رسالة تيليغرام ما وصلاتش — الطلب محفوظ وما حدّ شافو */
  const unnotified = orders.filter((o) => o.notifyError && o.status === 'pending');
  const awaitingReturn = orders.filter((o) =>
    o.status === 'accepted' && o.deliveryStatus === 'returned' && !o.returnReceivedAt);
  const outOfStock = variantStockRows.filter((row) => row.qty <= 0);
  const oversold = reserved.filter((row) => row.available < 0);

  const actionRequired = {
    pendingDecision: pending.length,
    shipmentFailed: shipmentFailed.length,
    unnotified: unnotified.length,
    awaitingReturnReceipt: awaitingReturn.length,
    lowStock: lowStock.length,
    outOfStock: outOfStock.length,
    oversold: oversold.length,
    /* المجموع — البادج في الشريط الجانبي يقراه بلا ما يجمع بيدو */
    total: pending.length + shipmentFailed.length + unnotified.length
      + awaitingReturn.length + lowStock.length + oversold.length,
  };

  const recentOrders = [...orders]
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, 8);

  return {
    window: { days, startDay, endDay },
    kpis,
    series,
    topProducts,
    byCategory,
    campaigns: campaignRows,
    lowStock,
    /* اللي عندك مقابل اللي وعدت بيه — شوف التعليق فوق */
    reserved: reserved.slice(0, 20),
    /* واش يستنّى قرارك دروك، ماشي واش صرا */
    actionRequired,
    recentOrders,
  };
}
