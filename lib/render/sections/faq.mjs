/*
 * الأسئلة الشائعة — <details> عادية.
 *
 * بلا جافاسكريبت خالص: المتصفّح يحلّ ويسكّر وحدو. قبل كان كود يسكّر
 * البقية كي تحلّ وحدة — سلوك ما طلبو حتى واحد وكان يخبّي جواب الزبون
 * راه يقراه.
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

export default function faq({ data = {} }) {
  const { eyebrow, title, items = [] } = data;

  const valid = items.filter((i) => i?.question && i?.answer);
  if (!valid.length) return '';

  const rows = valid
    .map((i) => `<details>
      <summary class="faq__q">${esc(i.question)}</summary>
      <p class="faq__a">${esc(i.answer)}</p>
    </details>`)
    .join('\n');

  return `<section class="strip" id="faq">
  ${head(eyebrow, title, '')}
  <div class="faq">
    ${rows}
  </div>
</section>`;
}
