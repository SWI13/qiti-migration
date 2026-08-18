/*
 * النداء الأخير — سطر وزرّ.
 *
 * الشريط الثابت تحت راهو ديما في الشاشة، فهذا القسم ما بقاش يلزمو
 * تدرّج ولا خلفية خاصة. يبقى موجود للحملة اللي تحبّ تسكّر الصفحة
 * بكلمة أخيرة.
 */
import { esc, safeUrl, mapJoin } from '../html.mjs';
import { icon } from '../sprite.mjs';

export default function cta({ data = {} }) {
  const { title, subtitle, ctaLabel, ctaHref = '#order', assurances = [] } = data;

  if (!title) return '';

  const validAssurances = assurances.filter((a) => a?.label);

  return `<section class="card" style="text-align:center">
  <h2>${esc(title)}</h2>
  ${subtitle ? `<p class="head__sub" style="margin-top:6px">${esc(subtitle)}</p>` : ''}
  ${ctaLabel
    ? `<a href="${safeUrl(ctaHref, '#order')}" class="btn btn--primary btn--block btn--xl" style="margin-top:14px">${esc(ctaLabel)}</a>`
    : ''}
  ${validAssurances.length
    ? `<div class="perks" style="margin-top:14px;text-align:start">
        ${mapJoin(validAssurances, (a) => `<p class="perk">${icon('i-check')}<span>${esc(a.label)}</span></p>`)}
      </div>`
    : ''}
</section>`;
}
