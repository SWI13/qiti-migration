/*
 * معرض المنتج — سلايدر بالإصبع + مواصفات + سومة.
 *
 * ⚠️ قبل كان: صورة كبيرة، شريط صور مصغّرة تتبدّل بالنقر (JS)، جهاز
 * عائم بحلقات متحرّكة، وعمود جانبي. على الهاتف العمود الجانبي يطيح
 * تحت، والصور المصغّرة تولّي شريط ثاني يزحلق، والحلقات تحرق البطارية.
 * دروك: scroll-snap — نفس حركة الأنستغرام، بلا جافاسكريبت، وتخدم
 * حتى لو الـ JS ما وصلش.
 *
 * المعطيات ما تبدّلتش: نفس الحقول اللي تكتبها اللوحة (mainImage,
 * thumbs, deviceImage, specs, priceNote, ctaLabel) — الحملات القديمة
 * تبقى تخدم كيما هي.
 */
import { esc, escAttr, safeUrl, mapJoin } from '../html.mjs';
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

  /* الصورة الرئيسية أوّلاً، وبعدها المصغّرات (كانو نسخ أكبر تتعرض
     بالنقر — دروك هوما روحهم شرائح السلايدر) وفي الأخير صورة الجهاز */
  const slides = [
    { src: mainImage, alt: mainImageAlt ?? title ?? '' },
    ...thumbs.filter((t) => t?.src).map((t) => ({ src: t.src, alt: t.alt ?? '' })),
    ...(deviceImage ? [{ src: deviceImage, alt: deviceImageAlt ?? '' }] : []),
  ].slice(0, 8);

  const shots = mapJoin(slides, (slide, i) => `<div class="shot">
      <img src="${safeUrl(slide.src)}" alt="${escAttr(slide.alt)}"
           width="800" height="800" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
    </div>`);

  const dots = slides.length > 1
    ? `<div class="dots" id="dots" aria-hidden="true">${slides.map((_, i) => `<span class="dot${i ? '' : ' is-on'}"></span>`).join('')}</div>`
    : '';

  const validSpecs = specs.filter((s) => s?.label);
  const specsBlock = validSpecs.length
    ? `<div class="perks">
        ${mapJoin(validSpecs, (s) => `<p class="perk">${icon('i-check')}<span>${s.value ? `<b>${esc(s.value)}</b> — ` : ''}${esc(s.label)}</span></p>`)}
      </div>`
    : '';

  /* السومة تجي من الخادم (priceView)، ماشي من نصوص الحملة */
  const priceBlock = priceView
    ? `<div class="pricebar">
        <span class="price">${esc(Number(priceView.amount).toLocaleString('en-US'))} دج</span>
        ${priceNote ? `<span class="tag">${esc(priceNote)}</span>` : ''}
      </div>`
    : '';

  return `<section class="strip" id="product">
  ${title
    ? `<div class="strip__title">
        ${title ? `<h2>${esc(title)}</h2>` : ''}
      </div>`
    : ''}
  <div class="shots" id="shots">
    ${shots}
  </div>
  ${dots}
  ${priceBlock}
  ${specsBlock}
  ${ctaLabel
    ? `<a href="${safeUrl(ctaHref, '#order')}" class="btn btn--primary btn--block" style="margin-top:14px">${esc(ctaLabel)}</a>`
    : ''}
</section>`;
}
