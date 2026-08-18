/*
 * قسم الثقة — ثلاث بلاطات قصار.
 *
 * في السوق الجزائري الثقة تجي من ثلاث حوايج: تخلّص كي توصل، واحد
 * يتّصل بيك يأكّد، وكاين ضمان. النجوم والأرقام الكبيرة (10,000 زبون!)
 * ما تشريش — بالعكس، تشكّك.
 *
 * ⚠️ الأرقام (stats) بقات في العقد باش الحملات القديمة ما تنكسرش،
 * بصح تتعرض كنص هادي بلا عدّاد متحرّك.
 */
import { esc, escAttr, mapJoin } from '../html.mjs';
import { icon } from '../sprite.mjs';

export default function trust({ data = {} }) {
  const { rating, headline, badges = [], stats = [] } = data;

  const validBadges = badges.filter((b) => b?.label);
  const validStats = stats.filter((s) => s?.value != null && s?.label);

  const line = (rating || headline)
    ? `<p class="head__sub" style="text-align:center">${rating ? `★ ${esc(rating)}` : ''}${rating && headline ? ' · ' : ''}${headline ? esc(headline) : ''}</p>`
    : '';

  const badgesBlock = validBadges.length
    ? `<div class="trust">
        ${mapJoin(validBadges.slice(0, 3), (b) => `<div class="trust__it">${icon(b.icon)}<b>${esc(b.label)}</b></div>`)}
      </div>`
    : '';

  const statsBlock = validStats.length
    ? `<div class="trust">
        ${mapJoin(validStats.slice(0, 3), (s) => `<div class="trust__it"><b>${esc(String(s.value))}${esc(s.suffix ?? '')}</b><small>${esc(s.label)}</small></div>`)}
      </div>`
    : '';

  if (!line && !badgesBlock && !statsBlock) return '';

  return `<section class="strip">
  ${line}
  ${badgesBlock}
  ${statsBlock}
</section>`;
}
