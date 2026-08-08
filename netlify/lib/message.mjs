/*
 * صيغة رسالة الطلب وأزرارها — مشتركة بين الفنكشنز باش تبقى وحدة.
 * الويبهوك يعاود يبني نفس الرسالة من الطلب المخزّن، فما يحتاجش يخمّن
 * التنسيق من النص اللي يعطيه تيليغرام.
 */

export const PRODUCT_PRICE = 3900;
export const SHIPPING = { home: 600, desk: 400 };
export const SHIPPING_LABEL = { home: 'للدار', desk: 'لمكتب التوصيل' };

/** الاسم والبلدية يكتبهم الزبون — لازم نهربوهم وإلا `<` يهرّس الرسالة */
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const dz = (n) => `${n.toLocaleString('en-US')} دج`;

/** 0661445566 → +213661445566 (صيغة E.164) */
export const toE164Dz = (localPhone) => `+213${String(localPhone).replace(/\D/g, '').replace(/^0/, '')}`;

export const totalFor = ({ shipping, qty }) => PRODUCT_PRICE * qty + SHIPPING[shipping];

export const dzTime = (date = new Date()) =>
  date.toLocaleString('fr-DZ', {
    timeZone: 'Africa/Algiers',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

/*
 * الرقم مكتوب نص عادي (ماشي <code>) قصداً: تيليغرام يتعرّف على أرقام الهاتف
 * ويديرها قابلة للنقر — تنقر عليها وتعيّط مباشرة. <code> يديرها نسخ برك.
 */
export function ownerMessage(record) {
  const lines = [
    '<b>🐱 طلب جديد — Qiti</b>',
    '',
    `<b>${esc(record.name)}</b>`,
    `📞 ${esc(toE164Dz(record.phone))}`,
    `📍 ${esc(record.wilaya)} / ${esc(record.commune)}`,
    `🚚 ${SHIPPING_LABEL[record.shipping]} — الكمية ×${record.qty}`,
    '',
    `<b>المجموع: ${dz(record.total)}</b> — كاش عند الاستلام`,
  ];

  if (record.status === 'accepted') {
    lines.push('', `✅ <b>مقبول</b> — ${esc(record.actor ?? '')} · ${dzTime(new Date(record.decidedAt ?? Date.now()))}`);

    if (record.deliveryStatus === 'delivered') {
      lines.push('', `📦 <b>توصّل</b> — ${esc(record.deliveryActor ?? '')} · ${dzTime(new Date(record.deliveryDecidedAt ?? Date.now()))}`);
    } else if (record.deliveryStatus === 'returned') {
      lines.push('', `↩️ <b>رجعت الطلبية</b> — ${esc(record.deliveryActor ?? '')} · ${dzTime(new Date(record.deliveryDecidedAt ?? Date.now()))}`);
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

/** الأزرار الصحيحة حسب حالة الطلب — نفس المنطق يخدم عند البعث وعند الرسم مجدّداً */
export function buttonsFor(record) {
  if (record.status === 'accepted' && !record.deliveryStatus) return deliveryButtons(record);
  return whatsappOnlyButtons(record);
}
