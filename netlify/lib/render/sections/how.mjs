/*
 * قسم "كيفاش يخدم" — خطوات مرقّمة.
 *
 * رقم الخطوة (1، 2، 3...) بنائي، يتحسب من الترتيب — ماشي من data.
 */
import { esc } from '../html.mjs';
import { icon } from '../sprite.mjs';


export default function how({ data = {} }) {
  const { eyebrow, title, subtitle, steps = [] } = data;

  const validSteps = steps.filter((s) => s?.title && s?.body);
  if (!validSteps.length) return '';

  const header = (eyebrow || title || subtitle)
    ? `<header class="section__head reveal">
        ${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ''}
        ${title ? `<h2 class="section__title">${esc(title)}</h2>` : ''}
        ${subtitle ? `<p class="section__sub">${esc(subtitle)}</p>` : ''}
      </header>`
    : '';

  const stepsHtml = validSteps
    .map((s, i) => `<li class="step reveal"${i ? ` style="--d:${i * 100}ms"` : ''}>
        <span class="step__num">${i + 1}</span>
        <span class="step__icon">${icon(s.icon)}</span>
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.body)}</p>
      </li>`)
    .join('\n');

  return `<section class="section section--cream" id="how">
  <div class="container">
    ${header}

    <ol class="steps">
      ${stepsHtml}
    </ol>
  </div>
</section>`;
}
