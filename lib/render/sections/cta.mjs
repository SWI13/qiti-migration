/*
 * قسم النداء الختامي — آخر فرصة تقنع الزبون قبل ما يخرج من الصفحة.
 */
import { esc, safeUrl } from '../html.mjs';
import { icon } from '../sprite.mjs';


export default function cta({ data = {} }) {
  const { title, subtitle, ctaLabel, ctaHref = '#order', assurances = [] } = data;

  if (!title) return '';

  const validAssurances = assurances.filter((a) => a?.label);
  const assurancesBlock = validAssurances.length
    ? `<ul class="cta__assurances reveal" style="--d:200ms">
        ${validAssurances.map((a) => `<li>${icon(a.icon)} ${esc(a.label)}</li>`).join('\n')}
      </ul>`
    : '';

  const ctaBlock = ctaLabel
    ? `<a href="${safeUrl(ctaHref, '#order')}" class="btn btn--dark btn--xl reveal" style="--d:140ms">
        ${esc(ctaLabel)} ${icon('i-arrow-rtl')}
      </a>`
    : '';

  return `<section class="cta">
  <div class="container cta__inner">
    <h2 class="cta__title reveal">${esc(title)}</h2>
    ${subtitle ? `<p class="reveal" style="--d:80ms">${esc(subtitle)}</p>` : ''}
    ${ctaBlock}
    ${assurancesBlock}
  </div>
</section>`;
}
