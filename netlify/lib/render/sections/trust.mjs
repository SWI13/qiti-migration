/*
 * قسم الثقة — نجوم + بادجات + أرقام متحرّكة.
 *
 * كل جزء يبان وحدو: التقييم يبان بلا بادجات، والبادجات تبان بلا أرقام.
 * القسم كامل يختفي إذا ما كانش عندو حتى جزء.
 */
import { esc, escAttr, mapJoin } from '../html.mjs';
import { icon } from '../sprite.mjs';

/* أيقونة من data — نبيّنوها غير إذا كاينة في السبرايت، وإلا نخبّيوها
   بدل ما نبيّنو أيقونة غالطة */

export default function trust({ data = {} }) {
  const { rating, headline, badges = [], stats = [] } = data;

  const validBadges = badges.filter((b) => b?.label);
  const validStats = stats.filter((s) => s?.value != null && s?.label);

  const starsBlock = rating
    ? `<span class="stars stars--solid stars--lg" role="img" aria-label="${escAttr(rating)} من 5">★★★★★</span>`
    : '';

  const head = (starsBlock || headline)
    ? `<div class="trust__head reveal">
        ${starsBlock}
        ${headline ? `<p>${esc(headline)}</p>` : ''}
      </div>`
    : '';

  const badgesBlock = validBadges.length
    ? `<ul class="badges reveal" style="--d:80ms">
        ${mapJoin(validBadges, (b) => `<li>${icon(b.icon)} ${esc(b.label)}</li>`)}
      </ul>`
    : '';

  const statsBlock = validStats.length
    ? `<div class="stats reveal" style="--d:140ms">
        ${mapJoin(validStats, (s) => `<div class="stat"><b data-count="${escAttr(s.value)}" data-suffix="${escAttr(s.suffix ?? '')}">0</b><span>${esc(s.label)}</span></div>`)}
      </div>`
    : '';

  if (!head && !badgesBlock && !statsBlock) return '';

  return `<section class="trust">
  <div class="container">
    ${head}
    ${badgesBlock}
    ${statsBlock}
  </div>
</section>`;
}
