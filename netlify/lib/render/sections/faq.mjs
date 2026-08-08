/*
 * قسم الأسئلة الشائعة — أكورديون بـ <details> (بلا JS للفتح/الغلق،
 * main.js يستعمل حدث toggle غير باش يسكّر البقية).
 */
import { esc } from '../html.mjs';
import { icon } from '../sprite.mjs';

export default function faq({ data = {} }) {
  const { eyebrow, title, items = [] } = data;

  const validItems = items.filter((i) => i?.question && i?.answer);
  if (!validItems.length) return '';

  const header = (eyebrow || title)
    ? `<header class="section__head reveal">
        ${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ''}
        ${title ? `<h2 class="section__title">${esc(title)}</h2>` : ''}
      </header>`
    : '';

  const itemsHtml = validItems
    .map((i) => `<details class="faq__item">
        <summary>${esc(i.question)}${icon('i-chevron')}</summary>
        <div class="faq__body"><p>${esc(i.answer)}</p></div>
      </details>`)
    .join('\n');

  return `<section class="section" id="faq">
  <div class="container container--narrow">
    ${header}

    <div class="faq reveal">
      ${itemsHtml}
    </div>
  </div>
</section>`;
}
