/*
 * واجهة العروض: مختارات الباقات، وبلوك العرض الإضافي.
 *
 * ── علاش برّا sections/order.mjs ────────────────────────────────────
 * قسم الطلب طويل بزّاف أصلاً، وهو أخطر قسم في الصفحة (فيه الفلوس).
 * الباقات زخرفة حواليه: كي تكون الحملة بلا باقات، الفورم لازم يبقى
 * حرف بحرف كيما كان. الفصل يخلّي هذا واضح — الملف كامل يرجع '' كي
 * ما كانش عرض.
 *
 * ⚠️ نفس قاعدة القسم: كل سومة تتكتب هنا هي **للعرض**. السيرفر يعاود
 * يقراها من الحملة في api/order.mjs، فرقم مبدّل في الصفحة ما يبدّل
 * والو في اللي يتخلّص.
 */
import { esc, escAttr, mapJoin, dz } from './html.mjs';
import { activeBundles, upsellOf, bundleSavings } from '../offers.mjs';
import { variantPrice } from '../catalog.mjs';

/*
 * سومة الوحدة تاع عنصر في باقة — من المنتج الحقيقي. ترجع null إذا
 * المنتج ما تلقاش، وساعتها ما نكتبوش "ربحت" أصلاً بدل ما نخمّنو رقم.
 */
const itemUnitPrice = (offerProducts) => (item) => {
  const product = offerProducts[item.productId];
  if (!product) return null;
  const variant = (product.variants ?? []).find((v) => v.sku === item.sku) ?? null;
  return variantPrice(product, variant);
};

const itemsLine = (bundle, offerProducts) =>
  bundle.items
    .map((item) => `${offerProducts[item.productId]?.name ?? '—'} ×${item.qty}`)
    .join(' · ');

/**
 * مختارات العرض: وحدة ولا باقة.
 *
 * راديو ماشي أزرار "زيد": الزبونة تشوف السوم جنب بعضهن وتختار وحدة.
 * زرّ يبدّل الحالة بلا ما تبان، وتكتشف الفرق في الفاتورة برك.
 *
 * الباقة اللي عنصرها خلص تبان معمية بسبب مكتوب — نبيعو ونحنا نعرفو
 * بلّي ما نقدروش نكمّلو = مكالمة اعتذار من بعد.
 */
export function offerPicker({ campaign, product, priceView, offerProducts = {}, stock = [] }) {
  const bundles = activeBundles(campaign);
  if (!bundles.length) return '';

  const priceOf = itemUnitPrice(offerProducts);
  const single = priceView?.amount ?? product?.price ?? 0;

  /* مخزون المنتج الرئيسي معروف هنا برك (هو اللي جا مع الصفحة). باقي
     العناصر يتفحصو في السيرفر وقت القبول — ما نديروش رحلة تخزين على
     كل عنصر باش نرسمو الصفحة. */
  const mainLeft = (stock ?? []).reduce((sum, row) => sum + (row?.stock?.qty ?? 0), 0);
  const soldOut = (bundle) => (stock ?? []).length > 0 && mainLeft === 0
    && bundle.items.some((item) => item.productId === product?.id);

  const bundleRows = mapJoin(bundles, (bundle) => {
    const saving = bundleSavings(bundle, priceOf);
    const off = soldOut(bundle);

    return `
          <label class="offer${off ? ' offer--off' : ''}">
            <input type="radio" name="offer" value="${escAttr(bundle.id)}"
                   data-offer-price="${escAttr(String(bundle.price))}"${off ? ' disabled' : ''}>
            <span class="offer__box">
              ${bundle.image ? `<img class="offer__img" src="${escAttr(bundle.image)}" alt="" loading="lazy">` : ''}
              <span class="offer__main">
                <b class="offer__name">${esc(bundle.name)}</b>
                ${bundle.description ? `<small class="offer__note">${esc(bundle.description)}</small>` : ''}
                <small class="offer__items">${esc(itemsLine(bundle, offerProducts))}</small>
                ${off ? '<small class="offer__note offer__note--off">خلص المخزون</small>' : ''}
              </span>
              <span class="offer__price">
                <b>${dz(bundle.price)}</b>
                ${saving ? `<s class="offer__old">${dz(saving.compareAt)}</s>` : ''}
                ${saving ? `<small class="offer__save">ربحت ${dz(saving.save)}</small>` : ''}
              </span>
            </span>
          </label>`;
  });

  return `
      <div class="field">
        <span class="label">اختر العرض</span>
        <div class="offers" role="radiogroup" aria-label="العروض">
          <label class="offer">
            <input type="radio" name="offer" value="" checked data-offer-price="${escAttr(String(single))}">
            <span class="offer__box">
              <span class="offer__main">
                <b class="offer__name">وحدة</b>
                <small class="offer__items">${esc(product?.name ?? '')}</small>
              </span>
              <span class="offer__price"><b>${dz(single)}</b></span>
            </span>
          </label>${bundleRows}
        </div>
      </div>`;
}

/**
 * العرض الإضافي بضغطة وحدة — يبان بعد ما يتسجّل الطلب.
 *
 * علاش بعد: قبل التأكيد، كل حاجة زايدة هي سبب باش الزبونة تحبس وتفكّر.
 * بعد ما تسجّل، الطلب راهو عندك — الضغطة إمّا تزيد ولا لا، ما تقدرش
 * تخسّر الطلبية. والفورم ما يتعاودش: السيرفر عندو كلش، الضغطة تبعثلو
 * id تاع الطلب برك.
 */
export function upsellBlock({ campaign, offerProducts = {} }) {
  const upsell = upsellOf(campaign);
  if (!upsell) return '';

  const product = offerProducts[upsell.productId];
  const title = upsell.title ?? product?.name ?? 'زيدها لطلبك';
  const old = upsell.compareAt && upsell.compareAt > upsell.price
    ? `<s class="upsell__old">${dz(upsell.compareAt)}</s>`
    : '';

  return `
    <div class="upsell" id="upsellOffer" data-trigger="${escAttr(upsell.trigger)}" hidden>
      ${upsell.image ? `<img class="upsell__img" src="${escAttr(upsell.image)}" alt="" loading="lazy">` : ''}
      <div class="upsell__txt">
        <b class="upsell__title">${esc(title)}</b>
        ${upsell.description ? `<p class="upsell__note">${esc(upsell.description)}</p>` : ''}
        <p class="upsell__price"><b>${dz(upsell.price)}</b> ${old}</p>
      </div>
      <button type="button" class="btn btn--primary btn--block" id="upsellAdd">زيدها للطلب — ضغطة وحدة</button>
      <p class="upsell__done" id="upsellDone" hidden>✅ زدناها لطلبك.</p>
    </div>`;
}

/** id وسومة كل باقة — المتصفّح يحسب بيهم المجموع المعروض */
export const bundlesPricing = (campaign) =>
  activeBundles(campaign).map((bundle) => ({ id: bundle.id, price: bundle.price }));
