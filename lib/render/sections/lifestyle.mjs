/*
 * صورة كبيرة + كلمتين.
 *
 * ⚠️ كانت صورة خلفية بطبقة ظل ونص فوقها. على الهاتف النص فوق الصورة
 * يتقرا بالعافية، والصورة الكبيرة كخلفية تتحمّل كاملة حتى لو ما تبانش
 * منها غير شريط. دروك: صورة عادية، والنص تحتها.
 */
import { esc, escAttr, safeUrl } from '../html.mjs';

export default function lifestyle({ data = {} }) {
  const { image, imageAlt, title, paragraphs = [], ctaLabel, ctaHref = '#order' } = data;

  if (!image || !title) return '';

  const paras = paragraphs.filter(Boolean).map((p) => `<p class="head__sub">${esc(p)}</p>`).join('\n');

  return `<section class="strip">
  <div class="shots shots--one">
    <div class="shot">
      <img src="${safeUrl(image)}" alt="${escAttr(imageAlt ?? title)}"
           width="800" height="800" loading="lazy" decoding="async">
    </div>
  </div>
  <div class="strip__title" style="margin-top:12px"><h2>${esc(title)}</h2></div>
  ${paras}
  ${ctaLabel
    ? `<a href="${safeUrl(ctaHref, '#order')}" class="btn btn--primary btn--block" style="margin-top:12px">${esc(ctaLabel)}</a>`
    : ''}
</section>`;
}
