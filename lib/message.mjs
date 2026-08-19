/*
 * صيغة رسالة الطلب وأزرارها — مشتركة بين الفنكشنز باش تبقى وحدة.
 * الويبهوك يعاود يبني نفس الرسالة من الطلب المخزّن، فما يحتاجش يخمّن
 * التنسيق من النص اللي يعطيه تيليغرام.
 */
import { channelLabel, campaignLabel } from './attribution.mjs';
import { tierIcon, tierLabel, isRisky } from './trust.mjs';
import { shippingFee, DEFAULT_RATE } from './shipping-rates.mjs';
import { orderLines, orderGoodsCost, bundleLines, upsellLine } from './offers.mjs';
import { returnLossFor } from './settings.mjs';

export const PRODUCT_PRICE = 3900;
/* ⚠️ التسعيرة الوحدة القديمة — بقات غير كـ fallback للولايات اللي ما
   عندهاش تسعيرة خاصة. السومة الحقيقية تجي من shipping-rates.mjs حسب
   الولاية، وكل حساب فلوس لازم يمرّ من تمّ. */
export const SHIPPING = DEFAULT_RATE;
export const SHIPPING_LABEL = { home: 'إلى المنزل', desk: 'إلى مكتب التوصيل' };

/*
 * تكلفة التوصيل — ثابتة في الكود (تخلصها مهما كانت النتيجة، وصلت
 * الطلبية ولا أُرجعت، المُوصّل ياخذ فلوسه). ⚠️ رقم placeholder، بدّلو
 * برقمك الحقيقي.
 *
 * التكاليف الأخرى (سوما البضاعة، الإعلانات، خسارة الرجعة) ماشي هنا —
 * تتبدّل من تيليغرام بـ `/cost` (شوف getCosts/setCost في store.mjs)
 * باش تقدر تبدّلها بلا ما تدير deploy جديد.
 */
/* ⚠️ ما بقاتش تدخل في حساب الربح — التوصيل ولّى تكلفة تتبدّل بـ
   /cost courier (صفر بالتلقائي، الزبون يخلّص). الثابتة تبقى هنا غير
   باش سومة التوصيل تبان للزبون في الصفحة. */
export const COURIER_COST = 350;

/** الاسم والبلدية يكتبهم الزبون — لازم نهربوهم وإلا `<` يهرّس الرسالة */
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const dz = (n) => `${n.toLocaleString('en-US')} دج`;

/** 0661445566 → +213661445566 (صيغة E.164) */
export const toE164Dz = (localPhone) => `+213${String(localPhone).replace(/\D/g, '').replace(/^0/, '')}`;

/*
 * المجموع بسومة وحدة معطاة — هذا هو الحساب الصحيح كي يكون عندنا منتج.
 * السومة تجي من المنتج (وزيادة الفاريانت إذا كان)، ماشي من ثابت.
 */
export const totalWith = (unitPrice, { shipping, qty, wilaya }) =>
  Number(unitPrice) * qty + shippingFee(wilaya, shipping);

/*
 * سومة التوصيل تاع طلب. الطلبات الجديدة تخزّنها صراحةً (shippingFee)
 * باش تبقى صحيحة حتى لو بدّلنا التسعيرة من بعد؛ القديمة نستنتجوها من
 * نوع التوصيل.
 */
export const shippingFeeOf = (order) =>
  order?.shippingFee ?? shippingFee(order?.wilaya, order?.shipping);

/*
 * الفلوس اللي تاعك انت من الطلب — المجموع ناقص سومة التوصيل.
 *
 * ⚠️ `total` فيه سومة التوصيل (totalWith فوق يزيدها)، وهاذيك فلوس
 * تعدّي للمُوصّل، ما هيش مدخول تاع المحل. حسبانها في المداخيل يضخّم
 * الرقم، وفي الربح يضخّمو مرّتين (تدخل كأنها ربح وما تخرج عمرها).
 * كل حساب فلوس لازم يمرّ من هنا.
 */
export const goodsTotal = (order) =>
  Math.max(0, (order?.total ?? 0) - shippingFeeOf(order));

/*
 * الطريق القديم — الصفحة الحالية (index.html) ما تبعثش productId،
 * فنحسبو بالسومة الثابتة.
 *
 * ⚠️ ما تستعملوش في كود جديد. كل طلبية جايّة من صفحة معروضة من
 * المعطيات لازم تمرّ على totalWith بسومة المنتج الحقيقية، وإلا
 * السيرفر يحسب 3900 مهما كانت سومة المنتج المعروضة.
 */
export const totalFor = ({ shipping, qty, wilaya }) => totalWith(PRODUCT_PRICE, { shipping, qty, wilaya });

/*
 * الربح الصافي التقديري لطلب وحدة — تقريب بسيط، ماشي محاسبة دقيقة.
 * `costs` = { productCost, adsCost, returnLoss } جايّة من getCosts() في
 * store.mjs (مخزّنة في Netlify Blobs، تتبدّل بـ /cost في تيليغرام بلا
 * حاجة لـ deploy جديد) — هذا الفنكشن يبقى نقي/sync، الجالب يجيب القيم.
 *
 * - "وصلت": المجموع اللي خلص الزبون، ناقص سوما البضاعة (productCost × الكمية)،
 *   ناقص تكلفة الإعلانات (adsCost)، ناقص تكلفة التوصيل (courierCost —
 *   صفر بالتلقائي، على خاطر الزبون هو اللي يخلّص التوصيل في الدفع عند
 *   الاستلام؛ بدّلها بـ /cost courier إذا كنت تخلّصها انت).
 * - "أُرجعت": خسارة صافية = returnLoss مباشرة (تعديها انت من /cost، ماشي
 *   محسوبة أوتوماتيكياً من تكلفة التوصيل). نحسبها كي `deliveryStatus ===
 *   'returned'` يتسجّل (ماشي كي تتأكد البضاعة "استلمتُ الإرجاع" فعلياً) على
 *   خاطر الفلوس ضاعت من ساعة ما المُوصّل رجّعها، بلا علاقة بوقت ما البضاعة
 *   توصل فيزيائياً للمحل — هذاك برك يأثّر على المخزون، ماشي الربح.
 * - أي حالة أخرى (pending، denied، في الطريق): 0 — ما فيه لا ربح لا خسارة بعد.
 */
export const profitFor = (order, costs) => {
  /*
   * ⚠️ اللقطة تغلب التكاليف الحالية.
   *
   * قبل، الربح كان يتحسب ديما بتكاليف اليوم. تبدّل سومة السلعة بـ /cost
   * اليوم، وتقرير الشهر اللي فات يتبدّل معاها — تاريخ يتعاود يتكتب في
   * كل مرّة، وما تقدرش تقارن شهر بشهر.
   *
   * دروك التكاليف تتخزّن على الطلب وقت قرار التوصيل. الطلبات القديمة
   * (بلا لقطة) ترجع للتكاليف الحالية كيما قبل.
   */
  /* courierCost ولّى تكلفة عادية تتبدّل بـ /cost، وصفر بالتلقائي —
     في الدفع عند الاستلام الزبون هو اللي يخلّص التوصيل. الطلبات
     القديمة عندها لقطة فيها 350، وتبقى بيها: التاريخ ما يتعاودش
     يتكتب. `?? 0` باش لقطة قديمة بلا الحقل ما ترجعش NaN. */
  const c = order.costSnapshot ?? {
    unitCost: costs.productCost,
    adsCost: costs.adsCost,
    courierCost: costs.courierCost ?? 0,
    returnLoss: costs.returnLoss,
  };

  if (order.deliveryStatus === 'delivered') {
    /* goodsTotal ماشي total: سومة التوصيل تعدّي للمُوصّل، ما تدخلش
       في الربح — وإلا كل طلب يبان رابح 600 دج زيادة على الحقيقة */
    /* `goodsCost` تجي مع الطلبات اللي فيها باقة ولا عرض إضافي (تكلفة
       كل عنصر مضروبة في كميتو). الطلب العادي ما عندوهاش، فيبقى على
       الحساب القديم بالضبط. */
    const goodsCost = c.goodsCost ?? c.unitCost * (order.qty ?? 0);
    return goodsTotal(order) - goodsCost - (c.courierCost ?? 0) - c.adsCost;
  }
  if (order.deliveryStatus === 'returned') {
    /*
     * الطلب اللي عندو قواعد رجعة محفوظة يتحسب بيها: توصيل الذهاب +
     * نسبة الرجعة + أي تكلفة ثابتة (+ سومة السلعة إذا كانت ما ترجعش
     * تنباع). الطلب القديم بلا قواعد يبقى على الرقم الثابت — نفس
     * الحساب اللي تسجّل بيه.
     */
    if (c.returnRules) {
      return -returnLossFor({
        shippingFee: c.shippingFee ?? shippingFeeOf(order),
        outboundCost: c.courierCost ?? 0,
        goodsCost: c.goodsCost ?? 0,
      }, {
        returnShipPercent: c.returnRules.percent,
        returnIncludesProduct: c.returnRules.includesProduct,
        returnExtraCost: c.returnRules.extra,
      }).total;
    }
    return -c.returnLoss;
  }
  return 0;
};

/**
 * لقطة التكاليف وقت قرار التوصيل — تتخزّن على الطلب وما تتبدّلش من بعد.
 *
 * `order` و`unitCostOf` اختياريين، وكي يجيو نحسبو `goodsCost`: تكلفة
 * **كل** اللي في الطلب — المنتج، عناصر الباقة وحدة بوحدة، والعرض
 * الإضافي. بلاهم اللقطة تبقى كيما كانت (unitCost × qty)، فالنداءات
 * القديمة والطلبات القديمة ما يتبدّلش فيهم والو.
 */
export const costSnapshotOf = (costs, product = null, { order = null, unitCostOf = null, settings = null } = {}) => {
  const snapshot = {
    unitCost: product?.unitCost ?? costs.productCost,
    adsCost: costs.adsCost,
    courierCost: costs.courierCost ?? 0,
    returnLoss: costs.returnLoss,
  };

  /*
   * قواعد الرجعة وقت القرار.
   *
   * الرجعة ماشي رقم واحد: الموصّل ياخذ نسبة من سومة التوصيل، وسومة
   * الذهاب تخلّصها مهما كان. نخزّنو القواعد مع الطلب باش تبديل النسبة
   * غدوة ما يعاودش يكتب خسائر الشهر اللي فات.
   */
  if (settings && order) {
    snapshot.shippingFee = shippingFeeOf(order);
    snapshot.returnRules = {
      percent: settings.returnShipPercent ?? 0,
      includesProduct: Boolean(settings.returnIncludesProduct),
      extra: settings.returnExtraCost ?? 0,
    };
  }

  if (order && unitCostOf) {
    snapshot.goodsCost = orderGoodsCost(order, unitCostOf, costs.productCost);
  }

  return snapshot;
};

export const dzTime = (date = new Date()) =>
  date.toLocaleString('fr-DZ', {
    timeZone: 'Africa/Algiers',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

/** "قبل 3 سوايع" / "قبل يومين" — يستعمل فـ /state باش يبان قداش عندو طلب بلا حركة */
export function elapsedLabel(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return 'الآن';
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

/** نتيجة المكالمة بالكلام — نفس الأسماء اللي تبان في صفّ المكالمات في اللوحة */
export const CALL_OUTCOME_LABEL = {
  reached: 'جاوب وأكّد',
  'no-answer': 'ما جاوبش',
  busy: 'مشغول',
  off: 'مطفي',
  callback: 'طلب معاودة',
  wrong: 'الرقم غالط',
};

/**
 * سطر (ولا سطرين) على المكالمات اللي دارت.
 *
 * ⚠️ عدد المحاولات وحدو ما يكفيش: "3 محاولات" ما تقولش واش نعاودو ولا
 * نقرّرو. علاش السطر الثاني يقول آخر نتيجة ووقتاش، والثالث يقول
 * الموعد الجاي كي يكون كاين — هذي هي الحاجة اللي كانت ساكنة في راس
 * اللي عيّط، ودروك تبان لأي واحد يفتح الرسالة.
 */
export function callSummaryLines(record) {
  const calls = Array.isArray(record?.calls) ? record.calls : [];
  if (!calls.length) return [];

  const last = calls[calls.length - 1];
  const label = CALL_OUTCOME_LABEL[last.outcome] ?? last.outcome;
  const lines = [
    `📵 <b>${calls.length} ${calls.length === 1 ? 'محاولة' : 'محاولات'}</b> — آخر وحدة: ${esc(label)} · ${elapsedLabel(last.at)}`,
  ];
  if (last.note) lines.push(`💬 ${esc(last.note)}`);
  if (record.nextCallAt && new Date(record.nextCallAt).getTime() > Date.now()) {
    lines.push(`⏭️ المعاودة: ${dzTime(new Date(record.nextCallAt))}`);
  }
  return lines;
}

/*
 * الرقم مكتوب نص عادي (ماشي <code>) قصداً: تيليغرام يتعرّف على أرقام الهاتف
 * ويديرها قابلة للنقر — تنقر عليها وتعيّط مباشرة. <code> يديرها نسخ برك.
 */
/*
 * ⚠️ لغة الرسائل: **العربية الفصحى**، ماشي الدارجة.
 *
 * الصفحة تكلّم الزبون بالدارجة على خاطر هي تبيع. هذي الرسائل تكلّمك انت
 * وأي واحد يخدم معاك في الگروب — والفصحى تتقرا كيف كيف على كل واحد،
 * مهما كانت ولايتو، وتبقى مفهومة حتى لو ولّى عندك شريك من برّا.
 */
/*
 * الباقة والعرض الإضافي في الرسالة.
 *
 * علاش نفصّلو عناصر الباقة: انت اللي تشدّ السلعة بيدك قبل ما تبعثها.
 * "Protection Bundle ×1" وحدها ما تقولّكش واش تحطّ في الكرتونة، وواحد
 * ناقص = رجعة كاملة.
 *
 * الطلب العادي (بلا باقة وبلا عرض) يرجع لائحة فارغة — الرسالة تبقى
 * حرف بحرف كيما كانت.
 */
function offerLines(record) {
  const out = [];

  for (const line of bundleLines(record)) {
    out.push('', `📦 <b>${esc(line.name ?? 'باقة')}</b> ×${line.qty} — ${dz(line.lineTotal ?? 0)}`);
    for (const item of line.items ?? []) {
      out.push(`   • ${esc(item.name ?? item.productId)} ×${item.qty * line.qty}`);
    }
  }

  const upsell = upsellLine(record);
  if (upsell) {
    out.push('', `🔥 <b>عرض إضافي:</b> ${esc(upsell.name ?? '')} ×${upsell.qty} — ${dz(upsell.lineTotal ?? 0)}`);
  }

  return out;
}

export function ownerMessage(record) {
  const lines = ['<b>🐱 طلب جديد — Qiti</b>'];

  /*
   * تاريخ الزبون بوجهين — مخزّن في الطلب روحو (لقطة وقت الطلب).
   * الأخضر مهمّ قد الأحمر: زبون خلّص وستلم قبل هذا هو أحسن طلب يجيك،
   * وقبل ما نزيدو `delivered` كان يبان كيما أي واحد جديد.
   */
  /*
   * قائمتك انت أوّلاً — إذا حظرتي هذا الرقم بيدك، هذا قرارك وما يغلبوش
   * حتى فحص برّاني. يبان فوق كلش باش ما يفوتكش.
   */
  if (record.blocked) {
    const reason = record.blocked.reason ? ` — ${esc(record.blocked.reason)}` : '';
    lines.push(`🚫 <b>هذا الرقم محظور لديك</b>${reason}`);
  }

  /*
   * تقييم الثقة البرّاني يجي بعدها: هو اللي يشوف الزبائن اللي نصبو عند
   * تجّار آخرين — الحاجة اللي تاريخك ما يقدرش يشوفها.
   * العوامل تبان غير كي تكون النتيجة تستاهل الانتباه، بلا ضجّة على الزبون العادي.
   */
  const trust = record.trust;
  if (trust?.tier) {
    const score = typeof trust.score === 'number' ? ` (${trust.score.toFixed(2)})` : '';
    lines.push(`${tierIcon(trust.tier)} تقييم الثقة: <b>${esc(tierLabel(trust.tier))}</b>${score}`);

    if (isRisky(trust) && trust.factors?.length) {
      for (const factor of trust.factors) {
        const weight = typeof factor.weight === 'number'
          ? ` ${factor.weight > 0 ? '+' : ''}${factor.weight.toFixed(2)}`
          : '';
        lines.push(`   • ${esc(factor.name)}${weight}`);
      }
    }
  }

  const history = record.customerHistory;
  if (history) {
    const delivered = history.delivered ?? 0;
    const denied = history.denied ?? 0;
    const returned = history.returned ?? 0;

    if (denied + returned > 0) {
      const balance = delivered ? ` (في المقابل ${delivered} وصلت)` : '';
      lines.push(`⚠️ زبون له سوابق: ${denied} رفض، ${returned} إرجاع${balance}`);
    } else if (delivered > 0) {
      /* العربية تبدّل التمييز حسب العدد — "3 طلبيات" و"11 طلبية" */
      lines.push(`✅ زبون موثوق: ${delivered} ${delivered <= 10 ? 'طلبيات' : 'طلبية'} وصلت سابقاً`);
    }
  }

  const campaign = campaignLabel(record.attribution);

  /*
   * المقاس واللون — **ضروري**، ماشي زينة.
   *
   * إذا ما بانوش في الرسالة، تشدّ الطلبية وتبعث الحجم الغالط، والزبون
   * يرفضها في الباب وتخسر الرجعة كاملة. هذا هو أوّل شي لازم يخدم في
   * الحوايج، قبل أي حاجة أخرى في نظام الفاريانتات.
   *
   * نقراو من `record.variant.options` (لقطة محفوظة وقت الطلب) باش
   * تبقى صحيحة حتى لو المنتج تبدّل من بعد.
   */
  const variantLine = record.variant?.options && Object.keys(record.variant.options).length
    ? Object.entries(record.variant.options).map(([k, v]) => `${esc(k)}: <b>${esc(v)}</b>`).join(' · ')
    : null;

  lines.push(
    '',
    `<b>${esc(record.name)}</b>`,
    `📞 ${esc(toE164Dz(record.phone))}`,
    `📍 ${esc(record.wilaya)} / ${esc(record.commune)}`,
    ...(variantLine ? [`🏷️ ${variantLine}`] : []),
    `🚚 ${SHIPPING_LABEL[record.shipping]} ${dz(shippingFeeOf(record))} — الكمية ×${record.qty}`,
    `📣 ${esc(channelLabel(record.attribution))}${campaign ? ` · ${esc(campaign)}` : ''}`,
    ...offerLines(record),
    '',
    `<b>المجموع: ${dz(record.total)}</b> — نقداً عند الاستلام`,
  );

  const calls = callSummaryLines(record);
  if (calls.length) lines.push('', ...calls);

  if (record.confirmedAt) {
    lines.push('', `📞 <b>تم التأكيد هاتفياً</b> — ${esc(record.confirmedBy ?? '')} · ${dzTime(new Date(record.confirmedAt))}`);
  }

  if (record.status === 'accepted') {
    lines.push('', `✅ <b>مقبول</b> — ${esc(record.actor ?? '')} · ${dzTime(new Date(record.decidedAt ?? Date.now()))}`);

    if (record.deliveryStatus === 'delivered') {
      lines.push('', `📦 <b>وصلت</b> — ${esc(record.deliveryActor ?? '')} · ${dzTime(new Date(record.deliveryDecidedAt ?? Date.now()))}`);
    } else if (record.deliveryStatus === 'returned') {
      lines.push('', `↩️ <b>أُرجعت مع الموصّل</b> — ${esc(record.deliveryActor ?? '')} · ${dzTime(new Date(record.deliveryDecidedAt ?? Date.now()))}`);
      if (record.returnReceivedAt) {
        lines.push(`📥 <b>استُلمت في المحل</b> — ${esc(record.returnReceivedActor ?? '')} · ${dzTime(new Date(record.returnReceivedAt))} · أُضيفت للمخزون`);
      } else {
        lines.push('⏳ لم تصل بعد إلى المحل — المخزون لم يُحدَّث');
      }
    }
  } else if (record.status === 'denied') {
    lines.push('', `❌ <b>مرفوض</b> — ${esc(record.actor ?? '')} · ${dzTime(new Date(record.decidedAt ?? Date.now()))}`);
    if (record.reason) lines.push(`💬 ${esc(record.reason)}`);
  }

  return lines.join('\n');
}

/*
 * `callback_data` فيها id تاع الطلب باش الويبهوك يعرف أشمن طلب يبدّل.
 * الحد الأقصى 64 بايت — علاش الـ id قصير.
 *
 * ملاحظة: تيليغرام ما يقبلش روابط `tel:` في الأزرار ("Wrong port number") —
 * علاش زر الاتصال ما كاينش، وعوّضناه بالرقم القابل للنقر فوق + زر واتساب.
 */
export const orderButtons = (record) => {
  const rows = [];

  /*
   * زر التأكيد يبان غير قبل ما تأكّد. ما نمنعوش القبول بلاه قصداً —
   * نسجّلوه برك (`confirmedBeforeAccept`)، باش من بعد تقدر تقارن نسبة
   * الرجعات بين الطلبات المؤكّدة واللي ماشي مؤكّدة وتشوف بعينيك واش
   * التأكيد يخدم ولا لا. المنع يهرّس المرونة، القياس يعطيك الجواب.
   */
  if (!record.confirmedAt) {
    rows.push([{ text: '📞 أكّدتُ هاتفياً', callback_data: `cnf:${record.id}` }]);
  }

  /*
   * "عيّطتلو وما جاوبش" — نفس السجلّ اللي تكتبو اللوحة، بنقرة من هنا.
   *
   * ⚠️ نتيجة وحدة برك في تيليغرام، والباقي (مشغول، مطفي، طلب معاودة)
   * في صفّ المكالمات في اللوحة: كيبورد فيه ستّة أزرار يولّي أبطأ من
   * تفتح اللوحة، و"ما جاوبش" وحدها هي 80% من النقرات.
   */
  if (!record.confirmedAt) {
    rows.push([{ text: '📵 عيّطتُ — ما جاوبش', callback_data: `cll:${record.id}` }]);
  }

  rows.push([
    { text: '✅ قبول الطلب', callback_data: `ok:${record.id}` },
    { text: '❌ رفض الطلب', callback_data: `no:${record.id}` },
  ]);

  rows.push([
    { text: '💬 مراسلة الزبون على واتساب', url: `https://wa.me/${toE164Dz(record.phone).replace('+', '')}` },
  ]);

  return { inline_keyboard: rows };
};

/** بعد ما يتقرّر الطلب نهائياً (رفض، ولا توصيل تقرّر)، يبقى غير زر واتساب */
export const whatsappOnlyButtons = (record) => ({
  inline_keyboard: [
    [{ text: '💬 مراسلة الزبون على واتساب', url: `https://wa.me/${toE164Dz(record.phone).replace('+', '')}` }],
  ],
});

/**
 * بعد القبول، وقبل ما تعرف نتيجة التوصيل: زوج أزرار جداد يبانو فوق زر
 * واتساب. التوصيل ياخذ يومين ولا ثلاثة، فهذوما يبقاو بايّنين في الرسالة
 * حتى تنقر عليهم — ماشي كيما أزرار القبول/الرفض اللي تولّي تختفي بسرعة.
 */
export const deliveryButtons = (record) => ({
  inline_keyboard: [
    [
      { text: '📦 وصلت', callback_data: `del:${record.id}` },
      { text: '↩️ أُرجعت', callback_data: `ret:${record.id}` },
    ],
    [
      { text: '💬 مراسلة الزبون على واتساب', url: `https://wa.me/${toE164Dz(record.phone).replace('+', '')}` },
    ],
  ],
});

/**
 * بعد "أُرجعت" وقبل ما توصل فيزيائياً للمحل: زر وحدة "استلمتُ الإرجاع" —
 * هو اللي يزيد المخزون، ماشي نقرة "أُرجعت" روحها (المُوصّل يقدر يقول
 * "أُرجعت" واللي في يدو الطلبية تاخذ يوم ولا يومين باش توصل لعندك).
 */
export const receiveReturnButtons = (record) => ({
  inline_keyboard: [
    [{ text: '📥 استلمتُ الإرجاع', callback_data: `rcv:${record.id}` }],
    [{ text: '💬 مراسلة الزبون على واتساب', url: `https://wa.me/${toE164Dz(record.phone).replace('+', '')}` }],
  ],
});

/** الأزرار الصحيحة حسب حالة الطلب — نفس المنطق يخدم عند البعث وعند الرسم مجدّداً */
export function buttonsFor(record) {
  /*
   * الطلب لسّا بلا قرار: نرجّعو أزرار القرار. هذا ولّى ضروري كي زدنا زر
   * التأكيد — قبلو، الطلب "pending" ما كان يتعاود يترسم عمرو، دروك يتعاود
   * كي تنقر "تأكدت"، ولوكان طاح للسطر الأخير كانت أزرار القبول/الرفض
   * تختفي وتبقى غير واتساب.
   */
  if (record.status === 'pending') return orderButtons(record);
  if (record.status === 'accepted' && !record.deliveryStatus) return deliveryButtons(record);
  if (record.status === 'accepted' && record.deliveryStatus === 'returned' && !record.returnReceivedAt) {
    return receiveReturnButtons(record);
  }
  return whatsappOnlyButtons(record);
}
