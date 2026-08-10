/*
 * صيغة رسالة الطلب وأزرارها — مشتركة بين الفنكشنز باش تبقى وحدة.
 * الويبهوك يعاود يبني نفس الرسالة من الطلب المخزّن، فما يحتاجش يخمّن
 * التنسيق من النص اللي يعطيه تيليغرام.
 */
import { channelLabel, campaignLabel } from './attribution.mjs';
import { tierIcon, tierLabel, isRisky } from './trust.mjs';

export const PRODUCT_PRICE = 3900;
export const SHIPPING = { home: 600, desk: 400 };
export const SHIPPING_LABEL = { home: 'للدار', desk: 'لمكتب التوصيل' };

/*
 * تكلفة التوصيل — ثابتة في الكود (تخلصها مهما كانت النتيجة، توصّلت
 * الطلبية ولا رجعت، المُوصّل ياخذ فلوسه). ⚠️ رقم placeholder، بدّلو
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
export const totalWith = (unitPrice, { shipping, qty }) =>
  Number(unitPrice) * qty + SHIPPING[shipping];

/*
 * الطريق القديم — الصفحة الحالية (index.html) ما تبعثش productId،
 * فنحسبو بالسومة الثابتة.
 *
 * ⚠️ ما تستعملوش في كود جديد. كل طلبية جايّة من صفحة معروضة من
 * المعطيات لازم تمرّ على totalWith بسومة المنتج الحقيقية، وإلا
 * السيرفر يحسب 3900 مهما كانت سومة المنتج المعروضة.
 */
export const totalFor = ({ shipping, qty }) => totalWith(PRODUCT_PRICE, { shipping, qty });

/*
 * الربح الصافي التقديري لطلب وحدة — تقريب بسيط، ماشي محاسبة دقيقة.
 * `costs` = { productCost, adsCost, returnLoss } جايّة من getCosts() في
 * store.mjs (مخزّنة في Netlify Blobs، تتبدّل بـ /cost في تيليغرام بلا
 * حاجة لـ deploy جديد) — هذا الفنكشن يبقى نقي/sync، الجالب يجيب القيم.
 *
 * - "توصّلت": المجموع اللي خلص الزبون، ناقص سوما البضاعة (productCost × الكمية)،
 *   ناقص تكلفة الإعلانات (adsCost)، ناقص تكلفة التوصيل (courierCost —
 *   صفر بالتلقائي، على خاطر الزبون هو اللي يخلّص التوصيل في الدفع عند
 *   الاستلام؛ بدّلها بـ /cost courier إذا كنت تخلّصها انت).
 * - "رجعت": خسارة صافية = returnLoss مباشرة (تعديها انت من /cost، ماشي
 *   محسوبة أوتوماتيكياً من تكلفة التوصيل). نحسبها كي `deliveryStatus ===
 *   'returned'` يتسجّل (ماشي كي تتأكد البضاعة "استلمت الرجعة" فعلياً) على
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
    return (order.total ?? 0) - c.unitCost * (order.qty ?? 0) - (c.courierCost ?? 0) - c.adsCost;
  }
  if (order.deliveryStatus === 'returned') {
    return -c.returnLoss;
  }
  return 0;
};

/** لقطة التكاليف وقت قرار التوصيل — تتخزّن على الطلب وما تتبدّلش من بعد */
export const costSnapshotOf = (costs, product = null) => ({
  unitCost: product?.unitCost ?? costs.productCost,
  adsCost: costs.adsCost,
  courierCost: costs.courierCost ?? 0,
  returnLoss: costs.returnLoss,
});

export const dzTime = (date = new Date()) =>
  date.toLocaleString('fr-DZ', {
    timeZone: 'Africa/Algiers',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

/** "قبل 3 سوايع" / "قبل يومين" — يستعمل فـ /state باش يبان قداش عندو طلب بلا حركة */
export function elapsedLabel(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return 'دروك';
  if (hours < 24) return `قبل ${hours} سا`;
  const days = Math.floor(hours / 24);
  return `قبل ${days} يوم`;
}

/*
 * الرقم مكتوب نص عادي (ماشي <code>) قصداً: تيليغرام يتعرّف على أرقام الهاتف
 * ويديرها قابلة للنقر — تنقر عليها وتعيّط مباشرة. <code> يديرها نسخ برك.
 */
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
    lines.push(`🚫 <b>هذا الرقم محظور عندك</b>${reason}`);
  }

  /*
   * فحص الثقة البرّاني يجي بعدها: هو اللي يشوف الزبائن اللي نصبو عند
   * تجّار آخرين — الحاجة اللي تاريخك ما يقدرش يشوفها.
   * العوامل تبان غير كي تكون النتيجة تستاهل الانتباه، بلا ضجّة على الزبون العادي.
   */
  const trust = record.trust;
  if (trust?.tier) {
    const score = typeof trust.score === 'number' ? ` (${trust.score.toFixed(2)})` : '';
    lines.push(`${tierIcon(trust.tier)} فحص الثقة: <b>${esc(tierLabel(trust.tier))}</b>${score}`);

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
      const balance = delivered ? ` (بصح ${delivered} توصّلت)` : '';
      lines.push(`⚠️ زبون عندو تاريخ: ${denied} رفض، ${returned} رجعة${balance}`);
    } else if (delivered > 0) {
      lines.push(`✅ زبون موثوق: ${delivered} طلبية توصّلت من قبل`);
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
    `🚚 ${SHIPPING_LABEL[record.shipping]} — الكمية ×${record.qty}`,
    `📣 ${esc(channelLabel(record.attribution))}${campaign ? ` · ${esc(campaign)}` : ''}`,
    '',
    `<b>المجموع: ${dz(record.total)}</b> — كاش عند الاستلام`,
  );

  if (record.confirmedAt) {
    lines.push('', `📞 <b>تأكد بالتيليفون</b> — ${esc(record.confirmedBy ?? '')} · ${dzTime(new Date(record.confirmedAt))}`);
  }

  if (record.status === 'accepted') {
    lines.push('', `✅ <b>مقبول</b> — ${esc(record.actor ?? '')} · ${dzTime(new Date(record.decidedAt ?? Date.now()))}`);

    if (record.deliveryStatus === 'delivered') {
      lines.push('', `📦 <b>توصّل</b> — ${esc(record.deliveryActor ?? '')} · ${dzTime(new Date(record.deliveryDecidedAt ?? Date.now()))}`);
    } else if (record.deliveryStatus === 'returned') {
      lines.push('', `↩️ <b>رجعت مع المُوصّل</b> — ${esc(record.deliveryActor ?? '')} · ${dzTime(new Date(record.deliveryDecidedAt ?? Date.now()))}`);
      if (record.returnReceivedAt) {
        lines.push(`📥 <b>استلمتها فالمحل</b> — ${esc(record.returnReceivedActor ?? '')} · ${dzTime(new Date(record.returnReceivedAt))} · تزادت للمخزون`);
      } else {
        lines.push('⏳ لسّا ما وصلاتش فيزيائياً للمحل — المخزون ما تزادش بعد');
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
    rows.push([{ text: '📞 تأكدت بالتيليفون', callback_data: `cnf:${record.id}` }]);
  }

  rows.push([
    { text: '✅ قبول الطلب', callback_data: `ok:${record.id}` },
    { text: '❌ رفض الطلب', callback_data: `no:${record.id}` },
  ]);

  rows.push([
    { text: '💬 راسل الزبون واتساب', url: `https://wa.me/${toE164Dz(record.phone).replace('+', '')}` },
  ]);

  return { inline_keyboard: rows };
};

/** بعد ما يتقرّر الطلب نهائياً (رفض، ولا توصيل تقرّر)، يبقى غير زر واتساب */
export const whatsappOnlyButtons = (record) => ({
  inline_keyboard: [
    [{ text: '💬 راسل الزبون واتساب', url: `https://wa.me/${toE164Dz(record.phone).replace('+', '')}` }],
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
      { text: '📦 توصّل', callback_data: `del:${record.id}` },
      { text: '↩️ رجعت', callback_data: `ret:${record.id}` },
    ],
    [
      { text: '💬 راسل الزبون واتساب', url: `https://wa.me/${toE164Dz(record.phone).replace('+', '')}` },
    ],
  ],
});

/**
 * بعد "رجعت" وقبل ما توصل فيزيائياً للمحل: زر وحدة "استلمت الرجعة" —
 * هو اللي يزيد المخزون، ماشي نقرة "رجعت" روحها (المُوصّل يقدر يقول
 * "رجعت" واللي في يدو الطلبية تاخذ يوم ولا يومين باش توصل لعندك).
 */
export const receiveReturnButtons = (record) => ({
  inline_keyboard: [
    [{ text: '📥 استلمت الرجعة', callback_data: `rcv:${record.id}` }],
    [{ text: '💬 راسل الزبون واتساب', url: `https://wa.me/${toE164Dz(record.phone).replace('+', '')}` }],
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
