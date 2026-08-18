/*
 * قسم المميزات — أسطر بعلامة صح، ماشي بطاقات.
 *
 * البطاقة (أيقونة كبيرة + عنوان + فقرة) تاخذ شاشة كاملة في الهاتف لكل
 * ميزة، والزبون يزحلق عليها. السطر القصير يتقرا وهو يزحلق — وهذا هو
 * كل الفرق بين "قرا المميزات" و"عدّى عليهم".
 */
import { esc } from '../html.mjs';
import { icon } from '../sprite.mjs';

/* عنوان القسم — سطر واحد قصير. العنوان الفرعي والـ eyebrow يبانو غير
   إذا كتبهم صاحب المتجر؛ ثلاث سطور فوق كل قسم تدفع المحتوى تحت. */
const head = (eyebrow, title, subtitle) => (title || subtitle
  ? `<div class="strip__title">
      ${title ? `<h2>${esc(title)}</h2>` : ''}
      ${subtitle ? `<p class="head__sub">${esc(subtitle)}</p>` : ''}
    </div>`
  : '');

export default function features({ data = {} }) {
  const { eyebrow, title, subtitle, cards = [] } = data;

  const validCards = cards.filter((c) => c?.title && c?.body);
  if (!validCards.length) return '';

  const rows = validCards
    .map((c) => `<p class="perk">${icon('i-check')}<span><b>${esc(c.title)}</b> — ${esc(c.body)}</span></p>`)
    .join('\n');

  return `<section class="strip" id="features">
  ${head(eyebrow, title, subtitle)}
  <div class="perks">
    ${rows}
  </div>
</section>`;
}
