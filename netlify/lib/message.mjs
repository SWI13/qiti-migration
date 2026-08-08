/*
 * صيغة رسالة الطلب وأزرارها — مشتركة بين الفنكشنز باش تبقى وحدة.
 * الويبهوك يعاود يبني نفس الرسالة من الطلب المخزّن، فما يحتاجش يخمّن
 * التنسيق من النص اللي يعطيه تيليغرام.
 */

export const PRODUCT_PRICE = 3900;
export const SHIPPING = { home: 600, desk: 400 };
export const SHIPPING_LABEL = { home: 'للدار', desk: 'لمكتب التوصيل' };

/*
 * ⚠️ هاذوما أرقام placeholder — ماشي التكلفة الحقيقية تاعك! لازم تبدّلهم
 * قبل ما رقم "الربح الصافي" في تقرير آخر النهار يبان صحيح:
 * PRODUCT_COST = شحال تخلص للمورد على كل طوق (سوما البضاعة، ماشي سعر البيع).
 * COURIER_COST = تكلفة التوصيل التقديرية (تخلصها مهما كانت النتيجة —
 * توصّلت الطلبية ولا رجعت، المُوصّل ياخذ فلوسه).
 */
export const PRODUCT_COST = 1500;
export const COURIER_COST = 350;

/** الاسم والبلدية يكتبهم الزبون — لازم نهربوهم وإلا `<` يهرّس الرسالة */
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const dz = (n) => `${n.toLocaleString('en-US')} دج`;

/** 0661445566 → +213661445566 (صيغة E.164) */
export const toE164Dz = (localPhone) => `+213${String(localPhone).replace(/\D/g, '').replace(/^0/, '')}`;

export const totalFor = ({ shipping, qty }) => PRODUCT_PRICE * qty + SHIPPING[shipping];

/*
 * الربح الصافي التقديري لطلب وحدة — تقريب بسيط، ماشي محاسبة دقيقة:
 * - "توصّلت": المجموع اللي خلص الزبون، ناقص سوما البضاعة (PRODUCT_COST × الكمية)،
 *   ناقص تكلفة التوصيل مرّة وحدة.
 * - "رجعت": خسارة صافية — ما دخلش ولا سنتيم، وتكلفة التوصيل تخلصت مرّتين تقريباً
 *   (رايحة للزبون + راجعة للمحل). نحسبها كي `deliveryStatus === 'returned'`
 *   يتسجّل (ماشي كي تتأكد البضاعة "استلمت الرجعة" فعلياً) على خاطر تكلفة
 *   التوصيل تخلصت وضاعت من ساعة ما المُوصّل رجّعها، بلا علاقة بوقت ما
 *   البضاعة توصل فيزيائياً للمحل — هذاك برك يأثّر على المخزون، ماشي الربح.
 * - أي حالة أخرى (pending، denied، في الطريق): 0 — ما فيه لا ربح لا خسارة بعد.
 */
export const profitFor = (order) => {
  if (order.deliveryStatus === 'delivered') {
    return (order.total ?? 0) - PRODUCT_COST * (order.qty ?? 0) - COURIER_COST;
  }
  if (order.deliveryStatus === 'returned') {
    return -COURIER_COST * 2;
  }
  return 0;
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
  if (hours < 1) return 'دروك';
  if (hours < 24) return `قبل ${hours} سا`;
  const days = Math.floor(hours / 24);
  return `قبل ${days} يوم`;
}

/*
 * الرقم مكتوب نص عادي (ماشي <code>) قصداً: تيليغرام يتعرّف على أرقام الهاتف
 * ويديرها قابلة للنقر — تنقر عليها وتعيّط مباشرة. <code> يديرها نسخ برك.
 */
export function ownerMessage(record, { customerHistory } = {}) {
  const lines = ['<b>🐱 طلب جديد — Qiti</b>'];

  /*
   * فقط عند البعث الأول (order.mjs يعطي customerHistory) وفقط إذا عندو
   * تاريخ فعلاً — بلا ضجّة على الزبائن العاديين. الويبهوك يعاود يرسم
   * الرسالة بلا هذا الطرف الثاني، فالتنبيه يختفي وحدو بعد أول قرار.
   */
  if (customerHistory && customerHistory.denied + customerHistory.returned > 0) {
    lines.push(`⚠️ زبون عندو تاريخ: ${customerHistory.denied} رفض، ${customerHistory.returned} رجعة`);
  }

  lines.push(
    '',
    `<b>${esc(record.name)}</b>`,
    `📞 ${esc(toE164Dz(record.phone))}`,
    `📍 ${esc(record.wilaya)} / ${esc(record.commune)}`,
    `🚚 ${SHIPPING_LABEL[record.shipping]} — الكمية ×${record.qty}`,
    '',
    `<b>المجموع: ${dz(record.total)}</b> — كاش عند الاستلام`,
  );

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
export const orderButtons = (record) => ({
  inline_keyboard: [
    [
      { text: '✅ قبول الطلب', callback_data: `ok:${record.id}` },
      { text: '❌ رفض الطلب', callback_data: `no:${record.id}` },
    ],
    [
      { text: '💬 راسل الزبون واتساب', url: `https://wa.me/${toE164Dz(record.phone).replace('+', '')}` },
    ],
  ],
});

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
  if (record.status === 'accepted' && !record.deliveryStatus) return deliveryButtons(record);
  if (record.status === 'accepted' && record.deliveryStatus === 'returned' && !record.returnReceivedAt) {
    return receiveReturnButtons(record);
  }
  return whatsappOnlyButtons(record);
}
