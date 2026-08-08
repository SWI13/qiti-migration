/*
 * قسم الأسلوب الحياتي — صورة كاملة العرض + طبقة ظل + نداء للفعل.
 *
 * الصورة هي جوهر القسم — بلاها ما كاين معنى نعرضو حتى حاجة.
 */
import { esc, escAttr, safeUrl } from '../html.mjs';
import { icon } from '../sprite.mjs';

export default function lifestyle({ data = {} }) {
  const { image, imageAlt, title, paragraphs = [], ctaLabel, ctaHref = '#order' } = data;

  if (!image || !title) return '';

  const validParagraphs = paragraphs.filter(Boolean);
  const parasHtml = validParagraphs
    .map((p, i) => `<p class="reveal" style="--d:${100 + i * 60}ms">${esc(p)}</p>`)
    .join('\n');

  const ctaDelay = 100 + validParagraphs.length * 60;
  const ctaBlock = ctaLabel
    ? `<a href="${safeUrl(ctaHref, '#order')}" class="btn btn--light btn--lg reveal" style="--d:${ctaDelay}ms">
        ${esc(ctaLabel)} ${icon('i-arrow-rtl')}
      </a>`
    : '';

  return `<section class="lifestyle">
  <img class="lifestyle__bg"
    src="${safeUrl(image)}"
    alt="${escAttr(imageAlt ?? '')}" loading="lazy" decoding="async">
  <div class="lifestyle__scrim" aria-hidden="true"></div>
  <div class="container">
    <div class="lifestyle__inner">
      <h2 class="lifestyle__title reveal">${esc(title)}</h2>
      ${parasHtml}
      ${ctaBlock}
    </div>
  </div>
</section>`;
}
