/*
 * قسم آراء الزبائن — بلوك على شكل منشور إنستغرام.
 *
 * تعليقات الصفحة الحالية (index.html) مختلقة. باش ما نكذبوش على الزبون،
 * القسم يختفي كامل إذا ما كانش عندو تعليقات حقيقية — ماشي بلوك فارغ.
 */
import { esc, escAttr, safeUrl, mapJoin } from '../html.mjs';
import { icon } from '../sprite.mjs';

export default function reviews({ data = {} }) {
  const {
    eyebrow, title,
    handle, handleNote,
    photo, photoAlt,
    likesCount, caption, totalComments,
    comments = [],
  } = data;

  const validComments = comments.filter((c) => c?.text);
  if (!validComments.length) return '';

  const header = (eyebrow || title)
    ? `<header class="section__head reveal">
        ${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ''}
        ${title ? `<h2 class="section__title">${esc(title)}</h2>` : ''}
      </header>`
    : '';

  const headBlock = handle
    ? `<div class="social-post__head">
        <span class="social-post__avatar">${icon('i-pin')}</span>
        <div class="social-post__who">
          <b>${esc(handle)}</b>
          ${handleNote ? `<small>${esc(handleNote)}</small>` : ''}
        </div>
      </div>`
    : '';

  const photoBlock = photo
    ? `<div class="social-post__photo">
        <img src="${safeUrl(photo)}" alt="${escAttr(photoAlt ?? '')}">
      </div>`
    : '';

  const likesBlock = likesCount ? `<p class="social-post__likes"><b>${esc(likesCount)}</b> إعجاب</p>` : '';
  const captionBlock = caption
    ? `<p class="social-post__caption">${handle ? `<b>${esc(handle)}</b> ` : ''}${esc(caption)}</p>`
    : '';
  const viewAllBlock = totalComments
    ? `<p class="social-post__viewall">عرض كل الـ ${esc(totalComments)} تعليق</p>`
    : '';

  /* تعليق العلامة التجارية (ردّ رسمي) عندو بنية مختلفة — بلا صورة وبلا قلب */
  const commentsHtml = mapJoin(validComments, (c) => `<li class="comment${c.isBrand ? ' comment--reply' : ''}">
      ${c.isBrand
        ? `<span class="comment__pic comment__pic--brand">${icon('i-pin')}</span>`
        : `<img class="comment__pic" src="${safeUrl(c.avatar ?? '')}" alt="" loading="lazy">`}
      <div class="comment__body">
        <p><b>${esc(c.name ?? '')}</b> ${esc(c.text)}</p>
        <div class="comment__meta"><span>${esc(c.timeAgo ?? '')}</span>${c.likes ? `<span>${esc(c.likes)} إعجاب</span>` : ''}<span>ردّ</span></div>
      </div>
      ${c.isBrand ? '' : '<svg class="comment__heart ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-heart"/></svg>'}
    </li>`);

  return `<section class="section section--gray" id="reviews">
  <div class="container container--narrow">
    ${header}

    <div class="social-post reveal">
      ${headBlock}
      ${photoBlock}

      <div class="social-post__actions">
        ${icon('i-heart')}
        ${icon('i-bubble')}
        ${icon('i-send')}
      </div>

      ${likesBlock}
      ${captionBlock}
      ${viewAllBlock}

      <ul class="comments">
        ${commentsHtml}
      </ul>

      <div class="social-post__add">
        <input type="text" placeholder="زيد تعليق..." aria-label="زيد تعليق" disabled>
        <button type="button" disabled>نشر</button>
      </div>
    </div>
  </div>
</section>`;
}
