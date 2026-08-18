/*
 * قسم الهيرو — أوّل حاجة يشوفها الزبون.
 *
 * ⚠️ هذا القسم هو **المرجع** لكل الأقسام الأخرى. أي قسم جديد يتبع نفس
 * العقد اللي هنا:
 *
 *   1. يصدّر `export default function (ctx)` ويرجع نص HTML.
 *   2. ctx = { data, product, campaign, theme, priceView }  — شوف
 *      render/index.mjs للتفاصيل.
 *   3. كل نص جاي من `data` يمرّ على esc()، وكل رابط على safeUrl().
 *   4. إذا المعلومة ناقصة، القسم يرجع '' — ما يعرضش بلوك فارغ.
 *   5. ما يعرفش على الأقسام الأخرى، وما يقراش من التخزين. المعطيات
 *      كامل توصلو في ctx.
 *
 * ── الترتيب: صورة ← اسم ← سومة ← فوائد ← زرّ ────────────────────────
 * هذا هو ترتيب القرار عند الزبون، فهو ترتيب الصفحة. الشاشة الأولى في
 * الهاتف تسع ~600px: صورة كبيرة + سومة + سطر يفهّم. كل حاجة أخرى
 * (تقييمات، كروت عائمة، ضوء خلفي) تسرق من هاذيك المساحة.
 */
import { esc, escAttr, safeUrl, mapJoin } from '../html.mjs';
import { icon } from '../sprite.mjs';

export default function hero({ data = {}, priceView }) {
  const {
    title, subtitle, image, imageAlt,
    rating, ratingNote, ctaLabel, ctaHref = '#order',
    assurances = [],
    priceNote,
  } = data;

  if (!title) return '';

  /*
   * الصورة أوّل عنصر في الوسم — fetchpriority عالية باش المتصفّح
   * يجيبها قبل أي حاجة. مقاساتها مكتوبة: البلاصة تتحجز قبل ما توصل،
   * فالنص ما يقفزش تحتها ويضغط الزبون في بلاصة غالطة.
   */
  const media = image
    ? `<div class="shots shots--one">
      <div class="shot">
        <img src="${safeUrl(image)}" alt="${escAttr(imageAlt ?? title)}"
             width="800" height="800" fetchpriority="high" decoding="async">
      </div>
    </div>`
    : '';

  const priceBlock = priceView
    ? `<div class="pricebar">
        <span class="price">${esc(Number(priceView.amount).toLocaleString('en-US'))} دج</span>
        ${priceView.compareAt && priceView.compareAt > priceView.amount
          ? `<span class="price__old">${esc(Number(priceView.compareAt).toLocaleString('en-US'))} دج</span>
             <span class="tag tag--save">ربحت ${esc(Number(priceView.compareAt - priceView.amount).toLocaleString('en-US'))} دج</span>`
          : ''}
        ${priceNote ? `<span class="tag">${esc(priceNote)}</span>` : ''}
      </div>`
    : '';

  /* التقييم سطر صغير حذا السومة — ماشي شارة بنجوم كبار. الجزائري
     يثق في التأكيد بالتيليفون وفي الدفع عند الاستلام قبل النجوم. */
  const ratingLine = rating
    ? `<p class="head__sub">★ ${esc(rating)}${ratingNote ? ` · ${esc(ratingNote)}` : ''}</p>`
    : '';

  const perks = assurances.length
    ? `<div class="perks">
        ${mapJoin(assurances, (item) => `<p class="perk">${icon('i-check')}<span>${esc(item)}</span></p>`)}
      </div>`
    : '';

  return `${media}
<section class="head">
  <h1>${esc(title)}</h1>
  ${subtitle ? `<p class="head__sub">${esc(subtitle)}</p>` : ''}
  ${ratingLine}
  ${priceBlock}
  ${perks}
  <a href="${safeUrl(ctaHref, '#order')}" class="btn btn--primary btn--block btn--xl" style="margin-top:16px">
    ${esc(ctaLabel ?? 'Commander — اطلب الآن')}
  </a>
</section>`;
}
