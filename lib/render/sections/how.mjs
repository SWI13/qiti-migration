/*
 * قسم "كيفاش يخدم" — خطوات مرقّمة، سطر لكل وحدة.
 *
 * رقم الخطوة بنائي، يتحسب من الترتيب — ماشي من data.
 */
import { esc } from '../html.mjs';

/* عنوان القسم — سطر واحد قصير. العنوان الفرعي والـ eyebrow يبانو غير
   إذا كتبهم صاحب المتجر؛ ثلاث سطور فوق كل قسم تدفع المحتوى تحت. */
const head = (eyebrow, title, subtitle) => (title || subtitle
  ? `<div class="strip__title">
      ${title ? `<h2>${esc(title)}</h2>` : ''}
      ${subtitle ? `<p class="head__sub">${esc(subtitle)}</p>` : ''}
    </div>`
  : '');

export default function how({ data = {} }) {
  const { eyebrow, title, subtitle, steps = [] } = data;

  const validSteps = steps.filter((s) => s?.title && s?.body);
  if (!validSteps.length) return '';

  const rows = validSteps
    .map((s, i) => `<li class="step">
      <span class="step__n">${i + 1}</span>
      <span><b>${esc(s.title)}</b><small>${esc(s.body)}</small></span>
    </li>`)
    .join('\n');

  return `<section class="strip" id="how">
  ${head(eyebrow, title, subtitle)}
  <ol class="steps">
    ${rows}
  </ol>
</section>`;
}
