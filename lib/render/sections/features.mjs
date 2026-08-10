/*
 * قسم المميزات — بطاقات (أيقونة + عنوان + نص).
 *
 * بلا كروت ما كاين والو نعرضو — العنوان وحدو بلا محتوى بلوك فارغ.
 */
import { esc } from '../html.mjs';
import { icon } from '../sprite.mjs';


export default function features({ data = {} }) {
  const { eyebrow, title, subtitle, cards = [] } = data;

  const validCards = cards.filter((c) => c?.title && c?.body);
  if (!validCards.length) return '';

  const header = (eyebrow || title || subtitle)
    ? `<header class="section__head reveal">
        ${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ''}
        ${title ? `<h2 class="section__title">${esc(title)}</h2>` : ''}
        ${subtitle ? `<p class="section__sub">${esc(subtitle)}</p>` : ''}
      </header>`
    : '';

  /* التأخير يتصاعد بالترتيب كيما في index.html — 60ms بين كل كرت */
  const cardsHtml = validCards
    .map((c, i) => `<article class="card reveal"${i ? ` style="--d:${i * 60}ms"` : ''}>
        <span class="card__icon">${icon(c.icon)}</span>
        <h3>${esc(c.title)}</h3>
        <p>${esc(c.body)}</p>
      </article>`)
    .join('\n');

  return `<section class="section" id="features">
  <div class="container">
    ${header}

    <div class="cards">
      ${cardsHtml}
    </div>
  </div>
</section>`;
}
