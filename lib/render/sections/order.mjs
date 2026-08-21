/*
 * قسم الطلب — الفورم. هذا هو القسم الوحيد اللي فيه فلوس.
 *
 * ── علاش هذا القسم مختلف على الباقي ────────────────────────────────
 * الأقسام الأخرى تعرض نصوص وصور من الحملة. هذا يلزمو الحقيقة تاع
 * السيرفر: السومة، التوصيل، المقاسات، وواش كاين في المخزون. لو خلّينا
 * الحملة تكتب السومة بيدها، تبدّل سومة المنتج وتنسى الصفحة — الزبون
 * يشوف 3900 والفورم يحسب 4200، وتخسر الطلبية ولا تخسر الثقة.
 *
 * فالقاعدة: **كل رقم هنا يجي من `product`، ولا من جدول التوصيل.**
 * نصوص الحملة تتحكّم في الكلام برك (العنوان، كتابة الزر).
 *
 * ── وكمان: هذا العرض برك ────────────────────────────────────────────
 * السومة اللي نكتبوها هنا هي **للعرض**. السيرفر يعاود يحسب المجموع في
 * api/order.mjs من نفس معطيات المنتج وما يثق حتى في رقم جاي من
 * المتصفّح. لو واحد بدّل الـ JSON في الصفحة، ما يبدّل والو في اللي
 * يتخلّص.
 *
 * ── أربع حقول، ماشي عشرة ────────────────────────────────────────────
 * الاسم، الرقم، الولاية، البلدية. كل حقل زايد على هذي الأربعة هو سبب
 * جديد باش الزبون يحبس في النص: البريد الإلكتروني ما نحتاجوهش (نتصلو
 * بالتيليفون)، والعنوان الكامل يتاخذ في مكالمة التأكيد — وقتها يكون
 * واحد يسمع ويصحّح، خير من حقل نص حرّ يكتب فيه أي شي.
 */
import { esc, escAttr, mapJoin, dz } from '../html.mjs';
import { icon } from '../sprite.mjs';
import { WILAYAS } from '../../wilayas.mjs';
/* التوصيل سومة تاع شركة التوصيل، ماشي تاع المنتج — فتبقى في بلاصة وحدة
   مشتركة بين الفورم ورسالة تيليغرام وحساب الربح. */
import { SHIPPING } from '../../message.mjs';
/* التسعيرة حسب الولاية — الجدول يمشي للمتصفّح في وسم JSON، والسيرفر
   يعاود يحسب بنفس الملف في api/order.mjs */
import { ratesScriptTag, isServed } from '../../shipping-rates.mjs';
/* الباقات والعرض الإضافي — الماركب تاعهم برّا، شوف offers-ui.mjs */
import { offerPicker, upsellBlock, bundlesPricing } from '../offers-ui.mjs';

/* الولاية اللي DHD ما توصّلش ليها تبان معمية بسبب مكتوب — تحييدها
   من القائمة يخلّي الزبون يقلّب عليها ويحسب راه غالط في القراية */
const wilayaOptions = () =>
  WILAYAS.map((name, i) => {
    const off = !isServed(i + 1);
    return `<option value="${escAttr(name)}" data-id="${i + 1}"${off ? ' disabled' : ''}>${i + 1} - ${esc(name)}${off ? ' — ما نوصلوش' : ''}</option>`;
  }).join('');

/**
 * مختارات المقاس واللون — مربّعات كبار للإصبع، ماشي قائمة منسدلة.
 * تبان غير إذا المنتج عندو خيارات — الطوق ما عندوش، فالفورم يبقى
 * كيما هو بالضبط.
 */
function optionPickers(product) {
  if (!product?.options?.length) return '';

  return mapJoin(product.options, (option, index) => `
        <div class="field">
          <span class="label">${esc(option.name)}</span>
          <div class="picks picks--opts" role="radiogroup" aria-label="${escAttr(option.name)}">
            ${mapJoin(option.values, (value, vi) => `
              <label class="pick">
                <input type="radio" name="opt-${index}" value="${escAttr(value)}"${vi === 0 ? ' checked' : ''}
                       data-option="${escAttr(option.name)}">
                <span class="pick__box"><b>${esc(value)}</b></span>
              </label>`)}
          </div>
          <p class="err" data-err-for="opt-${index}"></p>
        </div>`);
}

/*
 * معطيات التسعير للمتصفّح.
 *
 * JSON في وسم مغلق أحسن من متغيّر عام: المتصفّح ما ينفّذوش ككود،
 * ونهربو `<` باش نص فيه "</script>" ما يخرجش من الوسم.
 */
function pricingData(product, campaign) {
  const payload = {
    productId: product?.id ?? null,
    /* الاسم للعرض في أحداث تيك توك (content_name) — بلاه، التقارير
       تبان بـ id خام وما تعرفش أشمن منتج يبيع */
    productName: product?.name ?? null,
    price: product?.price ?? 0,
    shipping: SHIPPING,
    options: product?.options ?? [],
    variants: (product?.variants ?? []).map((v) => ({
      sku: v.sku,
      options: v.options,
      priceDelta: v.priceDelta ?? 0,
    })),
    /* الباقات: id وسومة برك. المتصفّح يعرض بيهم المجموع، والسيرفر
       يعاود يقرا السومة من الحملة — رقم مبدّل هنا ما يبدّل والو. */
    bundles: bundlesPricing(campaign),
  };

  return `<script type="application/json" id="qiti-pricing">${
    JSON.stringify(payload).replace(/</g, '\\u003c')
  }</script>`;
}

/*
 * "باقي 4 برك" — من العدّاد الحقيقي، ماشي من رقم مكتوب.
 *
 * القاعدة: تبان غير كي المخزون يهبط للحدّ اللي حطّيتو انت (threshold)
 * ويكون فوق الصفر. عدّاد كذّاب (يرجع لـ 5 كل ساعة) الزبون يشوفو
 * مرّتين ويفهمو — ووقتها يشكّ في السومة وفي التوصيل تاني، ماشي في
 * الشارة برك. الندرة الصادقة تبيع؛ المخترعة تخسّر الثقة كاملة.
 */
function stockBadge(rows) {
  const live = (rows ?? []).filter((row) => row?.stock && row.stock.qty > 0);
  if (!live.length) return '';

  const total = live.reduce((sum, row) => sum + row.stock.qty, 0);
  const low = live.some((row) => row.stock.qty <= (row.stock.threshold ?? 0));
  if (!low) return '';

  return `<p class="left">باقي ${total} برك في المخزون</p>`;
}

export default function order({ data = {}, product, campaign, priceView, preview = false, stock = [], offerProducts = {} }) {
  if (!product) return '';

  const {
    title = 'اطلب — نتصلو بيك نأكّدو',
    submitLabel = 'Commander — اطلب الآن',
    codNote = 'تخلّص كاش كي يوصلك الطلب',
    footnote = 'نتصلو بيك في أقرب وقت باش نأكّدو الطلب.',
  } = data;

  const amount = priceView?.amount ?? product.price ?? 0;

  return `<section class="card" id="order">
  <h2 class="card__title">${icon('i-truck')} ${esc(title)}</h2>

  ${stockBadge(stock)}

  <form id="orderForm" novalidate${preview ? ' data-preview="1"' : ''}>

    <!-- الشريط يبدا معمّر 25%: اختيار المنتج راهو خطوة مكمّلة. مهمّة
         مبدوءة تتكمّل أكثر من مهمّة تبدا من صفر. -->
    <div class="prog">
      <div class="prog__bar"><div class="prog__fill" id="progFill"></div></div>
      <small class="prog__txt" id="progTxt">اخترت المنتج ✓ — باقي 4 معلومات</small>
    </div>

    <!-- فخّ البوتات: مخبّي على المستخدم، البوتات برك اللي تعمّرو -->
    <div class="hp" aria-hidden="true">
      <label for="fWebsite">لا تعمّر هذا الحقل</label>
      <input id="fWebsite" name="website" type="text" tabindex="-1" autocomplete="off">
    </div>

    <!-- واش راه يتطلب — السيرفر يقرا منهم، ماشي من السومة المعروضة -->
    <input type="hidden" name="productId" value="${escAttr(product.id ?? '')}">
    <input type="hidden" name="campaignId" value="${escAttr(campaign?.id ?? '')}">

    <div class="fields">
      <div class="field">
        <label for="fName">الاسم الكامل</label>
        <input id="fName" name="name" class="input" type="text" required autocomplete="name" placeholder="مثال: محمد بن علي">
        <p class="err" data-err-for="fName"></p>
      </div>

      <div class="field">
        <label for="fPhone">رقم الهاتف</label>
        <input id="fPhone" name="phone" class="input" type="tel" required inputmode="numeric"
               autocomplete="tel" placeholder="0555 12 34 56" dir="ltr">
        <p class="err" data-err-for="fPhone"></p>
      </div>

      <div class="field">
        <label for="fWilaya">الولاية</label>
        <select id="fWilaya" name="wilaya" class="input" required>
          <option value="">اختر الولاية</option>
          ${wilayaOptions()}
        </select>
        <p class="err" data-err-for="fWilaya"></p>
      </div>

      <div class="field">
        <label for="fCommune">البلدية</label>
        <!-- القائمة تتعمّر من بلديات الموصّل كي تختار الولاية. الاسم
             اللي يتخزّن هو اللي يقبلوه هوما — بلا هذا الطردة تترفض
             بـ "Commune mal écrite". بلا جافاسكريبت ولا شبكة، الحقل
             يرجع نص حرّ (main.js يبدّلو) والمشغّل يصلّحو في اللوحة. -->
        <select id="fCommune" name="commune" class="input" required data-communes>
          <option value="">اختر الولاية أولاً</option>
        </select>
        <p class="err" data-err-for="fCommune"></p>
      </div>
${optionPickers(product)}${offerPicker({ campaign, product, priceView, offerProducts, stock })}
      <div class="field">
        <span class="label">التوصيل</span>
        <p class="ship-hint" id="shipHint">اختر ولايتك باش تبان سومة التوصيل.</p>
        <!-- "وقتاش يوصلني؟" — الجواب على ولايتو هو، في نفس اللحظة -->
        <p class="eta" id="etaLine" hidden></p>
        <div class="picks">
          <label class="pick">
            <input type="radio" name="shipping" value="home" checked>
            <span class="pick__box">
              <b>للدار</b>
              <small>Domicile</small>
              <span class="pick__price" data-price="home">—</span>
            </span>
          </label>
          <label class="pick">
            <input type="radio" name="shipping" value="desk">
            <span class="pick__box">
              <b>للمكتب</b>
              <small>Stop Desk — أرخص</small>
              <span class="pick__price" data-price="desk">—</span>
            </span>
          </label>
        </div>
      </div>

      <div class="field">
        <span class="label">الكمية</span>
        <div class="qty">
          <button type="button" class="qty__btn" data-qty="-1" aria-label="نقّص">−</button>
          <input id="fQty" class="qty__val" name="qty" type="number" value="1" min="1" max="10" inputmode="numeric" readonly>
          <button type="button" class="qty__btn" data-qty="1" aria-label="زيد">+</button>
        </div>
      </div>
    </div>

    <div class="sum" aria-live="polite">
      <div class="sum__row"><span>المنتج <span id="sumQty">×1</span></span><b id="sumProduct">${dz(amount)}</b></div>
      <div class="sum__row"><span>التوصيل</span><b id="sumShip">—</b></div>
      <div class="sum__row sum__row--total"><span>المجموع</span><b id="sumTotal">${dz(amount)}</b></div>
      <p class="sum__cod">${icon('i-cash')} ${esc(codNote)}</p>
    </div>

    ${/*
       * ⚠️ في المعاينة الزرّ ميّت. بلا هذا، صاحب المحل يجرّب الفورم
       * في اللوحة ويطيح طلبية حقيقية: تتسجّل، توصل إشعار، والزبون
       * الوهمي يتّصل بيه — والرقم اللي كتبو يدخل في تاريخ الزبائن
       * وفي حساب الثقة للأبد. main.js تاني يوقف على data-preview.
       */''}
    <button type="submit" class="btn btn--primary btn--block btn--xl" id="submitBtn"${preview ? ' disabled' : ''}>
      ${esc(submitLabel)}
    </button>
    <!-- مصاغ بالخسارة ماشي بالربح، وصادق: الدفع عند الاستلام معناه
         فعلاً ما يخاطر بوالو -->
    <p class="risk">${icon('i-shield')} ما تخسر والو — تخلّص كي تشوف السلعة في يدك</p>
    ${preview ? '<p class="note">👁️ معاينة — الطلب ما يتبعثش من هنا.</p>' : ''}
    <p class="err err--submit" id="submitErr" role="alert"></p>
    <p class="note">${esc(footnote)}</p>
  </form>

  <div class="done" id="orderDone" hidden>
    <span class="done__ico">${icon('i-check')}</span>
    <h2>تسجّل الطلب!</h2>
    <span class="done__id" id="orderDoneId" hidden></span>
    <p id="orderDoneMsg"></p>
    ${upsellBlock({ campaign, offerProducts })}
    <button type="button" class="btn btn--ghost" id="orderAgain">اطلب مرّة أخرى</button>
  </div>

  ${pricingData(product, campaign)}
  ${ratesScriptTag()}
</section>`;
}
