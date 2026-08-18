/*
 * قسم الطلب — الفورم. هذا هو القسم الوحيد اللي فيه فلوس.
 *
 * ── علاش هذا القسم مختلف على الباقي ────────────────────────────────
 * الأقسام الأخرى تعرض نصوص وصور من الحملة. هذا يلزمو الحقيقة تاع
 * السيرفر: السومة، التوصيل، المقاسات، وواش كاين في المخزون. لو خلّينا
 * الحملة تكتب السومة بيدها، تبدّل سومة المنتج وتنسى الصفحة — الزبون
 * يشوف 3900 والفورم يحسب 4200، وتخسر الطلبية ولا تخسر الثقة.
 *
 * فالقاعدة: **كل رقم هنا يجي من `product`، ولا من ثوابت التوصيل.**
 * نصوص الحملة تتحكّم في الكلام برك (العنوان، الوصف، كتابة الزر).
 *
 * ── وكمان: هذا العرض برك ────────────────────────────────────────────
 * السومة اللي نكتبوها هنا هي **للعرض**. السيرفر يعاود يحسب المجموع في
 * order.mjs من نفس معطيات المنتج وما يثق حتى في رقم جاي من المتصفّح.
 * لو واحد بدّل الـ JSON في الصفحة، ما يبدّل والو في اللي يتخلّص.
 */
import { esc, escAttr, safeUrl, mapJoin, dz } from '../html.mjs';
import { icon } from '../sprite.mjs';
import { WILAYAS } from '../../wilayas.mjs';
/* التوصيل سومة تاع شركة التوصيل، ماشي تاع المنتج — فتبقى في بلاصة وحدة
   مشتركة بين الفورم ورسالة تيليغرام وحساب الربح. */
import { SHIPPING } from '../../message.mjs';
/* التسعيرة حسب الولاية — الجدول يمشي للمتصفّح في وسم JSON، والسيرفر
   يعاود يحسب بنفس الملف في api/order.mjs */
import { ratesScriptTag, isServed } from '../../shipping-rates.mjs';

/* الولايات تتعمّر في السيرفر — قبل كانت مكرّرة في main.js وهنا */
/* الولاية اللي DHD ما توصّلش ليها تبان معمية بسبب مكتوب — تحييدها
   من القائمة يخلّي الزبون يقلّب عليها ويحسب راه غالط في القراية */
const wilayaOptions = () =>
  WILAYAS.map((name, i) => {
    const off = !isServed(i + 1);
    return `<option value="${escAttr(name)}" data-id="${i + 1}"${off ? ' disabled' : ''}>${i + 1} - ${esc(name)}${off ? ' — ما نوصلوش' : ''}</option>`;
  }).join('');

/**
 * مختارات المقاس واللون. تبان غير إذا المنتج عندو خيارات — الطوق
 * ما عندوش، فالفورم يبقى كيما هو بالضبط.
 */
function optionPickers(product) {
  if (!product?.options?.length) return '';

  return mapJoin(product.options, (option, index) => `
          <div class="field field--full">
            <span class="label">${esc(option.name)}</span>
            <div class="opt-values" role="radiogroup" aria-label="${escAttr(option.name)}">
              ${mapJoin(option.values, (value, vi) => `
                <label class="opt">
                  <input type="radio" name="opt-${index}" value="${escAttr(value)}"${vi === 0 ? ' checked' : ''}
                         data-option="${escAttr(option.name)}">
                  <span class="opt__box">${esc(value)}</span>
                </label>`)}
            </div>
            <p class="err" data-err-for="opt-${index}"></p>
          </div>`);
}

/*
 * معطيات التسعير للمتصفّح.
 *
 * قبل، main.js كان فيه `var PRODUCT_PRICE = 3900` مكتوبة باليد — يعني
 * السومة كانت في زوج بلايص (المتصفّح والسيرفر) ولازم تبدّلهم مع بعض.
 * دروك السيرفر يبعثها والمتصفّح يقراها.
 *
 * JSON في وسم script مغلق أحسن من متغيّر عام: المتصفّح ما ينفّذوش
 * ككود، ونهربو `<` باش نص فيه "</script>" ما يخرجش من الوسم.
 */
function pricingData(product) {
  const payload = {
    productId: product?.id ?? null,
    price: product?.price ?? 0,
    shipping: SHIPPING,
    options: product?.options ?? [],
    variants: (product?.variants ?? []).map((v) => ({
      sku: v.sku,
      options: v.options,
      priceDelta: v.priceDelta ?? 0,
    })),
  };

  return `<script type="application/json" id="qiti-pricing">${
    JSON.stringify(payload).replace(/</g, '\\u003c')
  }</script>`;
}

export default function order({ data = {}, product, campaign, priceView, preview = false }) {
  if (!product) return '';

  const {
    eyebrow = 'اطلب الآن',
    title, subtitle,
    productBlurb,
    submitLabel = 'أكّد الطلب',
    codNote = 'تخلّص كاش كي يوصلك الطلب',
    footnote = 'نتصلو بيك في أقرب وقت باش نأكّدو الطلب.',
    image,
  } = data;

  const amount = priceView?.amount ?? product.price ?? 0;

  return `<section class="order" id="order">
  <div class="container">
    <header class="section__head reveal">
      <span class="eyebrow">${esc(eyebrow)}</span>
      ${title ? `<h2 class="section__title">${esc(title)}</h2>` : ''}
      ${subtitle ? `<p class="section__sub">${esc(subtitle)}</p>` : ''}
    </header>

    <div class="order__card reveal">
      <form class="order__form" id="orderForm" novalidate${preview ? ' data-preview="1"' : ''}>

        <!-- فخّ البوتات: مخبّي على المستخدم، البوتات برك اللي تعمّرو -->
        <div class="hp" aria-hidden="true">
          <label for="fWebsite">لا تعمّر هذا الحقل</label>
          <input id="fWebsite" name="website" type="text" tabindex="-1" autocomplete="off">
        </div>

        <!-- واش راه يتطلب — السيرفر يقرا منهم، ماشي من السومة المعروضة -->
        <input type="hidden" name="productId" value="${escAttr(product.id ?? '')}">
        <input type="hidden" name="campaignId" value="${escAttr(campaign?.id ?? '')}">

        <div class="order__product">
          ${image ? `<img src="${safeUrl(image)}" alt="${escAttr(product.name ?? '')}" loading="lazy">` : ''}
          <div>
            <h3>${esc(product.name ?? '')}</h3>
            ${productBlurb ? `<p>${esc(productBlurb)}</p>` : ''}
            <span class="order__product-price">${dz(amount)}</span>
          </div>
        </div>

        <div class="fields">
          <div class="field field--full">
            <label for="fName">الاسم الكامل <span aria-hidden="true">*</span></label>
            <div class="input-wrap">
              ${icon('i-user')}
              <input id="fName" name="name" type="text" required autocomplete="name" placeholder="مثال: محمد بن علي">
            </div>
            <p class="err" data-err-for="fName"></p>
          </div>

          <div class="field field--full">
            <label for="fPhone">رقم الهاتف <span aria-hidden="true">*</span></label>
            <div class="input-wrap">
              ${icon('i-call')}
              <input id="fPhone" name="phone" type="tel" required inputmode="numeric"
                     autocomplete="tel" placeholder="0X XX XX XX XX" dir="ltr">
            </div>
            <p class="err" data-err-for="fPhone"></p>
          </div>

          <div class="field">
            <label for="fWilaya">الولاية <span aria-hidden="true">*</span></label>
            <select id="fWilaya" name="wilaya" required>
              <option value="">اختر الولاية</option>
              ${wilayaOptions()}
            </select>
            <p class="err" data-err-for="fWilaya"></p>
          </div>

          <div class="field">
            <label for="fCommune">البلدية <span aria-hidden="true">*</span></label>
            <input id="fCommune" name="commune" type="text" required placeholder="اكتب اسم البلدية">
            <p class="err" data-err-for="fCommune"></p>
          </div>
${optionPickers(product)}
          <div class="field field--full">
            <span class="label">نوع التوصيل</span>
            <p class="ship-hint" id="shipHint">اختر ولايتك باش تبان سومة التوصيل.</p>
            <div class="ship-opts">
              <label class="ship">
                <input type="radio" name="shipping" value="home" checked>
                <span class="ship__box">
                  ${icon('i-truck')}
                  <span class="ship__txt"><b>للدار</b><small>يوصلك لباب الدار</small></span>
                  <span class="ship__price" data-price="home">—</span>
                </span>
              </label>
              <label class="ship">
                <input type="radio" name="shipping" value="desk">
                <span class="ship__box">
                  ${icon('i-store')}
                  <span class="ship__txt"><b>لمكتب التوصيل</b><small>تروح تجيبو وحدك — أرخص</small></span>
                  <span class="ship__price" data-price="desk">—</span>
                </span>
              </label>
            </div>
          </div>

          <div class="field field--full">
            <span class="label">الكمية</span>
            <div class="qty">
              <button type="button" class="qty__btn" data-qty="-1" aria-label="نقّص">−</button>
              <input id="fQty" class="qty__val" name="qty" type="number" value="1" min="1" max="10" inputmode="numeric" readonly>
              <button type="button" class="qty__btn" data-qty="1" aria-label="زيد">+</button>
            </div>
          </div>
        </div>

        <details class="ship-rates" id="shipRates" hidden>
          <summary>سومة التوصيل لكل ولاية</summary>
          <div class="ship-rates__body"></div>
        </details>

        <div class="summary" aria-live="polite">
          <div class="summary__row"><span>المنتج <em id="sumQty">×1</em></span><b id="sumProduct">${dz(amount)}</b></div>
          <div class="summary__row"><span>التوصيل</span><b id="sumShip">—</b></div>
          <div class="summary__row summary__row--total"><span>المجموع</span><b id="sumTotal">${dz(amount)}</b></div>
          <p class="summary__cod">
            ${icon('i-cash')}
            ${esc(codNote)}
          </p>
          ${/*
             * ⚠️ في المعاينة الزرّ ميّت. بلا هذا، صاحب المحل يجرّب الفورم
             * في اللوحة ويطيح طلبية حقيقية: تتسجّل، توصل إشعار، والزبون
             * الوهمي يتّصل بيه — والرقم اللي كتبو يدخل في تاريخ الزبائن
             * وفي حساب الثقة للأبد. main.js تاني يوقف على data-preview.
             */''}
          <button type="submit" class="btn btn--primary btn--xl" id="submitBtn"${preview ? ' disabled' : ''}>
            ${esc(submitLabel)} ${icon('i-arrow-rtl')}
          </button>
          ${preview ? '<p class="summary__note">👁️ معاينة — الطلب ما يتبعثش من هنا.</p>' : ''}
          <p class="err err--submit" id="submitErr" role="alert"></p>
          <p class="summary__note">${esc(footnote)}</p>
        </div>
      </form>

      <div class="order__done" id="orderDone" hidden>
        <span class="order__done-ico">${icon('i-check')}</span>
        <h3>تسجّل الطلب!</h3>
        <p id="orderDoneMsg"></p>
        <button type="button" class="btn btn--ghost" id="orderAgain">اطلب مرّة أخرى</button>
      </div>
    </div>
  </div>
  ${pricingData(product)}
  ${ratesScriptTag()}
</section>`;
}
