/*
 * آراء الزبائن — كلام الناس، بلا زخرفة.
 *
 * ⚠️ قبل كان القسم مرسوم كمنشور إنستغرام: صورة، قلوب، عدد إعجابات،
 * "عرض كل الـ 214 تعليق"، وحقل "زيد تعليق..." ميّت. هذا يقلّد شبكة
 * اجتماعية وما هوش — والزبون الجزائري يعرف الفرق كي يضغط على القلب
 * وما يصرا والو. قلّة الثقة هذي تتعدّى للسومة والتوصيل.
 *
 * دروك: اسم + كلمة. نفس الحقول اللي تكتبها اللوحة (comments[] فيهم
 * name/text/avatar/timeAgo/likes/isBrand) — الصورة الشخصية تتقرا بصح
 * ما تتعرضش: كانت صور ستوك تاع ناس أجانب.
 */
import { esc, mapJoin } from '../html.mjs';

export default function reviews({ data = {} }) {
  const {
    eyebrow, title,
    handle, handleNote,
    photo, photoAlt,
    likesCount, caption, totalComments,
    comments = [],
  } = data;

  const valid = comments.filter((c) => c?.text);
  if (!valid.length) return '';

  const quotes = mapJoin(valid, (c) => `<article class="quote${c.isBrand ? ' quote--reply' : ''}">
      <div class="quote__top">
        <span class="quote__who">${esc(c.name ?? (c.isBrand ? 'Qiti' : ''))}</span>
        ${c.timeAgo ? `<span class="quote__stars">${esc(c.timeAgo)}</span>` : ''}
      </div>
      <p>${esc(c.text)}</p>
    </article>`);

  return `<section class="strip" id="reviews">
  ${title
    ? `<div class="strip__title">
        ${title ? `<h2>${esc(title)}</h2>` : ''}
      </div>`
    : ''}
  <div class="quotes">
    ${quotes}
  </div>
</section>`;
}
