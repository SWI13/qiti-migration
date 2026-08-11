/*
 * قسم معرض المنتج — صورة رئيسية + صور مصغّرة + مواصفات + صندوق السومة.
 *
 * ⚠️ في index.html الأصلي كاين رسم SVG مرسوم باليد لجهاز التتبّع —
 * خاص بطوق القطط، ما يعمّمش على منتجات أخرى. هنا نبدّلوه بـ `deviceImage`
 * جاي من data (صورة عادية)، ونعرضو حتى حاجة إذا ما كانتش موجودة.
 *
 * id="galleryImg" و id="galleryStage" لازمين بالضبط — assets/js/main.js
 * يقرا بيهم مباشرة (getElementById)، ماشي بالكلاس.
 */
import { esc, escAttr, safeUrl, mapJoin, join } from '../html.mjs';
import { icon } from '../sprite.mjs';


export default function gallery({ data = {}, priceView }) {
  const {
    eyebrow, title,
    mainImage, mainImageAlt,
    thumbs = [],
    deviceImage, deviceImageAlt,
    specs = [],
    priceNote,
    ctaLabel, ctaHref = '#order',
  } = data;

  if (!mainImage) return '';

  const header = (eyebrow || title)
    ? `<header class="section__head reveal">
        ${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ''}
        ${title ? `<h2 class="section__title">${esc(title)}</h2>` : ''}
      </header>`
    : '';

  const validThumbs = thumbs.filter((t) => t?.src);
  const thumbsBlock = validThumbs.length
    ? `<div class="gallery__thumbs" role="tablist" aria-label="صور المنتج">
        ${validThumbs
          .map((t, i) => `<button class="thumb${i === 0 ? ' is-active' : ''}" role="tab" aria-selected="${i === 0 ? 'true' : 'false'}"
            data-src="${safeUrl(t.src)}" data-alt="${escAttr(t.alt ?? '')}">
            <img src="${safeUrl(t.thumbSrc ?? t.src)}" alt="" loading="lazy">
          </button>`)
          .join('\n')}
      </div>`
    : '';

  /* الجهاز اليدوي المرسوم في index.html خاص بالقطط — هنا صورة عادية برك */
  const deviceBlock = deviceImage
    ? `<div class="showcase__stage reveal">
        <div class="stage__rings" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="device" data-float>
          <img src="${safeUrl(deviceImage)}" alt="${escAttr(deviceImageAlt ?? '')}">
        </div>
      </div>`
    : '';

  const validSpecs = specs.filter((s) => s?.label);
  const specsBlock = validSpecs.length
    ? `<ul class="specs reveal" style="--d:80ms">
        ${mapJoin(validSpecs, (s) => `<li>${icon(s.icon)}<span>${s.value ? `<b>${esc(s.value)}</b> ` : ''}${esc(s.label)}</span></li>`)}
      </ul>`
    : '';

  /* السومة تجي من الخادم (priceView)، ماشي من نصوص الحملة */
  const priceBox = priceView
    ? `<div class="price-box reveal" style="--d:140ms">
        <div>
          <span class="price-box__amount">${esc(priceView.amount)} <small>دج</small></span>
          ${priceNote ? `<span class="price-box__note">${esc(priceNote)}</span>` : ''}
        </div>
        <a href="${safeUrl(ctaHref, '#order')}" class="btn btn--primary">${esc(ctaLabel ?? 'اطلب الآن')}</a>
      </div>`
    : '';

  const asideInner = join([deviceBlock, specsBlock, priceBox]);
  const aside = asideInner ? `<aside class="gallery__side">\n${asideInner}\n</aside>` : '';

  return `<section class="section" id="product">
  <div class="container">
    ${header}

    <div class="gallery">
      <div class="gallery__main reveal">
        <div class="gallery__stage" id="galleryStage">
          <img id="galleryImg"
            src="${safeUrl(mainImage)}"
            alt="${escAttr(mainImageAlt ?? '')}" decoding="async">
        </div>
        ${thumbsBlock}
      </div>

      ${aside}
    </div>
  </div>
</section>`;
}
