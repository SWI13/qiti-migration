/* ==========================================================================
   Qiti admin — قائمة منسدلة
   لأفعال الصف الزايدة. صف الحملة عندو 5 أزرار جنب بعضهم — على 360px
   يتكدّسو ويولّي الصف أطول من الشاشة. الحلّ: فعل ولا زوج يبقاو بارزين،
   والباقي يدخلو تحت زر "⋯".

   المستمعين: واحد على document يتسجّل مرّة وحدة وقت الاستيراد. علاش
   ماشي bind بعد كل رندر: اللوحة تعاود تبني الـ HTML كامل بـ innerHTML
   في كل تبديل — أي مستمع مربوط بعنصر يموت معاه، والطالب لازمو يتفكّر
   يعاود يوصّل. مستمع مفوَّض على document ما يموتش.

   عناصر القائمة تخرج بـ data-act/data-id عادي — يعني المستمع تاع
   app.js هو اللي يدير الفعل، وهذا هنا يسكّر برك.
   ========================================================================== */
import { esc } from '../dom.js';
import { t } from '../i18n.js';
import { icon } from './icon.js';

var seq = 0;

function itemHtml(item) {
  if (item.sep) return '<div class="menu__sep" role="separator"></div>';

  var cls = 'menu__item' + (item.danger ? ' menu__item--danger' : '');
  var inner = (item.icon ? icon(item.icon) : '') + '<span>' + esc(item.label) + '</span>';

  if (item.href) {
    return '<a class="' + cls + '" role="menuitem" href="' + esc(item.href) + '"' +
      (item.external ? ' target="_blank" rel="noopener"' : '') + '>' + inner + '</a>';
  }
  return '<button type="button" class="' + cls + '" role="menuitem"' +
    ' data-act="' + esc(item.act) + '"' +
    (item.id != null ? ' data-id="' + esc(item.id) + '"' : '') +
    '>' + inner + '</button>';
}

/**
 * menuHtml({ id, label, btnClass, btnIcon, items }) → HTML
 *   id:       اختياري — يتولّد وحدو إذا ما عطيتوش
 *   label:    الاسم المقروء للزر (aria-label) — إجباري عمليًا، الزر
 *             فيه أيقونة برك وقارئ الشاشة ما عندو واش يقرا بلاه
 *   btnClass: أصناف الزر (افتراضي 'mini-btn')
 *   btnIcon:  اسم الأيقونة (افتراضي 'more')
 *   items:    [{ label, act, id, href, external, icon, danger }] ولا { sep: true }
 */
export function menuHtml(opts) {
  opts = opts || {};
  var id = opts.id || ('qmenu' + (++seq));
  var label = opts.label || t('common.more');
  var items = (opts.items || []).map(itemHtml).join('');

  return '<div class="menu" data-menu="' + esc(id) + '">' +
    '<button type="button" class="' + esc(opts.btnClass || 'mini-btn') + ' menu__btn"' +
      ' data-menu-btn aria-haspopup="menu" aria-expanded="false"' +
      ' aria-controls="' + esc(id) + '-popup" aria-label="' + esc(label) + '">' +
      icon(opts.btnIcon || 'more') +
    '</button>' +
    '<div class="menu__popup" id="' + esc(id) + '-popup" role="menu" aria-label="' + esc(label) + '">' +
      items +
    '</div>' +
  '</div>';
}

/* ── السلوك (مفوَّض على document، مرّة وحدة) ─────────────────────────── */

function closeAll(except) {
  Array.prototype.forEach.call(document.querySelectorAll('.menu.is-open'), function (menu) {
    if (menu === except) return;
    menu.classList.remove('is-open');
    unplace(menu);
    var btn = menu.querySelector('[data-menu-btn]');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
}

function itemsOf(menu) {
  return Array.prototype.slice.call(menu.querySelectorAll('.menu__item'));
}

/*
 * البوب-أب كان position:absolute جوّا .menu. المشكل: القائمة تقعد في
 * خلية جدول، و.table-wrap عندو overflow-x:auto — وCSS يفرض بلي وقتاش
 * محور واحد يولّي auto، الآخر (visible) يولّي auto تاني. يعني الغلاف
 * يقصّ: أفعال آخر صف (كرّر/انشر/امسح) ما يوصلهم حتى واحد.
 *
 * الحلّ: position:fixed محسوبة من مكان الزر — تخرج من أي غلاف يقصّ.
 * الثمن: الزحليق ما يجرّهاش معاه، علاش نسكّرو على scroll/resize (وهذا
 * على كل حال السلوك المعتاد تاع القوائم المنسدلة).
 */
var GAP = 6;
var EDGE = 8;

function place(menu) {
  var btn = menu.querySelector('[data-menu-btn]');
  var popup = menu.querySelector('.menu__popup');
  if (!btn || !popup) return;

  popup.style.position = 'fixed';
  popup.style.top = '0px';
  popup.style.left = '0px';

  var rect = btn.getBoundingClientRect();
  var width = popup.offsetWidth;
  var height = popup.offsetHeight;

  /* تحت الزر إذا كان بلاصة، وإلا فوقو. وإذا ما كانش لا هنا لا هنا
     (نافذة قصيرة برشا) نبقاو تحت — الزحليق تاع البوب-أب روحو يكمّل. */
  var roomBelow = window.innerHeight - rect.bottom;
  var top = (roomBelow >= height + GAP || rect.top < height + GAP)
    ? rect.bottom + GAP
    : rect.top - height - GAP;

  /* محاذاة لطرف الزر، مقصوصة على حدود الشاشة باش ما تخرجش */
  var left = Math.min(
    Math.max(EDGE, rect.right - width),
    Math.max(EDGE, window.innerWidth - width - EDGE),
  );

  popup.style.top = Math.max(EDGE, top) + 'px';
  popup.style.left = left + 'px';
}

function unplace(menu) {
  var popup = menu.querySelector('.menu__popup');
  if (!popup) return;
  popup.style.position = '';
  popup.style.top = '';
  popup.style.left = '';
}

document.addEventListener('click', function (event) {
  var btn = event.target.closest('[data-menu-btn]');
  if (btn) {
    var menu = btn.closest('.menu');
    var opening = !menu.classList.contains('is-open');
    closeAll(menu);
    menu.classList.toggle('is-open', opening);
    btn.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (opening) {
      /* الترتيب مهمّ: is-open تبان الأوّل باش offsetWidth/Height يعطيو
         قياس حقيقي — عنصر display:none قياسو صفر */
      place(menu);
      var first = itemsOf(menu)[0];
      if (first) first.focus();
    } else {
      unplace(menu);
    }
    return;
  }
  /* ضغطة على عنصر: نسكّرو برك — الفعل روحو يديرو المستمع تاع app.js.
     وضغطة برّا أي قائمة: نسكّرو كلشي. */
  closeAll(null);
});

document.addEventListener('keydown', function (event) {
  var menu = document.querySelector('.menu.is-open');
  if (!menu) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    closeAll(null);
    /* الفوكس يرجع للزر — بلا هذا يطيح على <body> واللي يخدم بالكيبورد
       يلزمو يعاود من أوّل الصفحة */
    var btn = menu.querySelector('[data-menu-btn]');
    if (btn) btn.focus();
    return;
  }

  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  var items = itemsOf(menu);
  if (!items.length) return;
  event.preventDefault();
  var at = items.indexOf(document.activeElement);
  var next = event.key === 'ArrowDown'
    ? (at + 1) % items.length
    : (at <= 0 ? items.length - 1 : at - 1);
  items[next].focus();
});

/* البوب-أب fixed ما يتحرّكش مع المحتوى — لو بقا محلول والصفحة تزحلق،
   يبقى معلّق فوق صف ماشي تاعو. capture:true باش نمسكو حتى الزحليق
   جوّا غلاف داخلي (.table-wrap) اللي ما يوصلش لـ window. */
function closeOnShift() { closeAll(null); }
window.addEventListener('scroll', closeOnShift, true);
window.addEventListener('resize', closeOnShift);

/* الفوكس خرج من القائمة (Tab) = تسكّر. ضغطة برّا تمسكها click فوق،
   بصح الكيبورد وحدو ما يديرش click. */
document.addEventListener('focusin', function (event) {
  if (!document.querySelector('.menu.is-open')) return;
  if (event.target.closest('.menu.is-open')) return;
  closeAll(null);
});
