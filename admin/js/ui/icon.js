/* ==========================================================================
   Qiti admin — أيقونات
   مصدر واحد لكل أيقونة في اللوحة. قبل، نفس الـ <svg> كان مكتوب في
   shell.js وstate-block.js وinline في الصفحات — تبديل سماكة الخط ولا
   إضافة أيقونة كان يتطلّب تلقى كل النسخ. دروك: مسار واحد، دالة واحدة.

   كلّهم على شبكة 24×24 وبخط برك (stroke) — .ico في styles.css هو اللي
   يعطي fill:none وstroke:currentColor وstroke-width:2. يعني الأيقونة
   تاخذ لون النص اللي حداها وحدها، بلا ما نلوّنوها هنا.
   ========================================================================== */

var PATHS = {
  /* ملاحة (الشريط الجانبي) — كل صفحة عندها شكل مميّز باش تتفرّق بالعين
     بلا ما تقرا النص، خاصة في وضع سكة الأيقونات (64px) */
  dashboard:  '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  orders:     '<path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.8h7.2a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>',
  campaigns:  '<path d="M3 10v4a1 1 0 0 0 1 1h2l7 4V5L6 9H4a1 1 0 0 0-1 1Z"/><path d="M17.5 8.5a4 4 0 0 1 0 7"/>',
  media:      '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5.5-5.5L11 15l-2.5-2.5L3 18"/>',
  products:   '<path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  categories: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  sidebar:    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="m15 8-4 4 4 4"/>',

  /* بلوكات الحالة */
  empty: '<path d="M3 7l9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  error: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v5"/><path d="M12 17h.01"/>',

  /* أفعال وإشارات */
  check:    '<path d="m20 6-11 11-5-5"/>',
  alert:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><path d="M12 16h.01"/>',
  info:     '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  close:    '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  chevron:  '<path d="m6 9 6 6 6-6"/>',
  search:   '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus:     '<path d="M12 5v14"/><path d="M5 12h14"/>',
  trash:    '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  drag:     '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
  more:     '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',

  /* الترتيب: "sort" هي الحالة المحايدة (العمود يتقدّ يترتّب بصح مازال) */
  sort:       '<path d="m8 9 4-4 4 4"/><path d="m8 15 4 4 4-4"/>',
  'sort-asc':  '<path d="m6 15 6-6 6 6"/>',
  'sort-desc': '<path d="m6 9 6 6 6-6"/>',
};

/**
 * icon(name, className) → '<svg …>…</svg>'
 * اسم ما كاينش يرجّع '' — الثقب يبان في الواجهة بلا ما يطيح الرندر كامل.
 * className أسماء أصناف من الكود تاعنا برك (ماشي مدخل مستخدم) — ما
 * نهربوهاش (escape).
 */
export function icon(name, className) {
  var path = PATHS[name];
  if (!path) return '';
  return '<svg class="ico' + (className ? ' ' + className : '') + '" viewBox="0 0 24 24" ' +
    'aria-hidden="true" focusable="false">' + path + '</svg>';
}
