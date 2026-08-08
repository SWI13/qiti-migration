/*
 * قسم الهيرو — أوّل حاجة يشوفها الزبون.
 *
 * ⚠️ هذا القسم هو **المرجع** لكل الأقسام الأخرى. أي قسم جديد يتبع نفس
 * العقد اللي هنا:
 *
 *   1. يصدّر `export default function (ctx)` ويرجع نص HTML.
 *   2. ctx = { data, product, campaign, theme, priceView }  — شوف
 *      render/index.mjs للتفاصيل.
 *   3. كل نص جاي من `data` يمرّ على esc()، وكل رابط على safeUrl().
 *   4. إذا المعلومة ناقصة، القسم يرجع '' — ما يعرضش بلوك فارغ.
 *   5. ما يعرفش على الأقسام الأخرى، وما يقراش من التخزين. المعطيات
 *      كامل توصلو في ctx.
 *
 * الـ HTML هنا مأخوذ حرفياً من index.html — نفس الكلاسات ونفس البنية.
 * الهدف بلّي الطوق يتعرض من المعطيات ويطلع نفس الصفحة بالضبط.
 */
import { esc, escAttr, safeUrl, mapJoin } from '../html.mjs';
import { icon } from '../sprite.mjs';

export default function hero({ data = {}, priceView }) {
  const {
    title, subtitle, image, imageAlt,
    rating, ratingNote, ctaLabel, ctaHref = '#order',
    secondaryLabel, secondaryHref = '#how',
    assurances = [],
    floatCards = [],
    priceNote,
  } = data;

  if (!title) return '';

  /* شارة التقييم — تبان غير إذا عندك تقييم حقيقي تعرضو */
  const ratingPill = rating
    ? `<div class="rating-pill reveal">
        <span class="stars stars--solid" role="img" aria-label="تقييم ${escAttr(rating)} من 5">★★★★★</span>
        <span><strong>${esc(rating)}</strong>${ratingNote ? ` · ${esc(ratingNote)}` : ''}</span>
      </div>`
    : '';

  /* السومة تجي من المنتج (خادم)، ماشي من نصوص الحملة */
  const priceBlock = priceView
    ? `<div class="hero__price reveal" style="--d:150ms">
        <span class="hero__price-amount">${esc(priceView.amount)} <small>دج</small></span>
        ${priceNote ? `<span class="hero__price-note">${esc(priceNote)}</span>` : ''}
      </div>`
    : '';

  const assuranceList = assurances.length
    ? `<ul class="hero__assurances reveal" style="--d:240ms">
        ${mapJoin(assurances, (item) => `<li>${icon('i-check')} ${esc(item)}</li>`)}
      </ul>`
    : '';

  /*
   * الكروت العائمة فوق الصورة — أيقونة + سطرين.
   *
   * ⚠️ الصفحة الحالية عندها كارت فيه خريطة SVG متحرّكة ("البلاصة
   * مباشرة"). هذاك مرسوم خصّيصاً للطوق وما يتعمّمش، فما جبناهش. اللي
   * يحبّو يقدر يديرو كقسم خاص ولا صورة. الكارت البسيط (أيقونة + نص)
   * يخدم لأي منتج، وهو هذا.
   *
   * ما ناخذوش أكثر من زوج — فوق هذا يغطّيو الصورة روحها.
   */
  const cards = floatCards.slice(0, 2);
  const floating = cards.length
    ? mapJoin(cards, (card, i) => `
        <div class="float-card float-card--${i === 0 ? 'batt' : 'start'}" data-float${i ? ' style="--delay:-2.5s"' : ''}>
          ${icon(card.icon)}
          <div>
            ${card.title ? `<strong>${esc(card.title)}</strong>` : ''}
            ${card.note ? `<span>${esc(card.note)}</span>` : ''}
          </div>
        </div>`)
    : '';

  const media = image
    ? `<div class="hero__media reveal" style="--d:100ms">
        <div class="hero__photo">
          <img src="${safeUrl(image)}" alt="${escAttr(imageAlt ?? '')}"
               width="1100" height="1300" fetchpriority="high" decoding="async">
        </div>
        ${floating}
      </div>`
    : '';

  return `<section class="hero">
  <div class="hero__glow" aria-hidden="true"></div>
  <div class="container hero__grid">

    <div class="hero__copy">
      ${ratingPill}
      <h1 class="hero__title reveal" style="--d:60ms">${esc(title)}</h1>
      ${subtitle ? `<p class="hero__sub reveal" style="--d:120ms">${esc(subtitle)}</p>` : ''}
      ${priceBlock}

      <div class="hero__cta reveal" style="--d:180ms">
        <a href="${safeUrl(ctaHref, '#order')}" class="btn btn--primary btn--lg">
          ${esc(ctaLabel ?? 'اطلب الان')} ${icon('i-arrow-rtl')}
        </a>
        ${secondaryLabel
          ? `<a href="${safeUrl(secondaryHref, '#how')}" class="btn btn--ghost btn--lg">
              ${icon('i-play')} ${esc(secondaryLabel)}
            </a>`
          : ''}
      </div>

      ${assuranceList}
    </div>

    ${media}
  </div>
</section>`;
}
