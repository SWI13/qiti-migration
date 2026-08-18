/*
 * تنظيف مجلّد النشر من التعليقات.
 *
 * ── علاش ──────────────────────────────────────────────────────────
 * التعليقات في هذا المستودع مكتوبة بالدارجة وتشرح **علاش**، وهي جزء
 * من الكود ماشي زخرفة — تبقى في المصدر. بصح الزائر ما يقراهاش، ويخلّص
 * عليها: كل حرف عربي زوج بايت، ونص ملف الـ CSS تعليقات.
 *
 * فالمصدر يبقى مشروح، والمنشور يبقى خفيف.
 *
 * ⚠️ ماشي minifier: ما نمسّوش الأسماء، ما نعاودوش نرتّبو، وما نلمسوش
 * الجافاسكريبت. تصغير الـ JS بلا محلّل نحوي حقيقي يهرّس الكود في
 * حالات صعيبة تلقاها (regex، نص فيه //)، والربح ما يستاهلش الخطر.
 */

/*
 * تعليقات CSS — بلا اللي جوّا نص.
 *
 * `url("...")` يقدر يكون فيه `/*`. نمشيو حرف بحرف بدل regex باش ما
 * نقصّوش من وسط نص ونخرّبو data: URI (كاين وحدة في السهم تاع select).
 */
export function stripCss(css) {
  let out = '';
  let quote = null;

  for (let i = 0; i < css.length; i += 1) {
    const char = css[i];

    if (quote) {
      out += char;
      if (char === '\\') { out += css[i + 1] ?? ''; i += 1; continue; }
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'") { quote = char; out += char; continue; }

    if (char === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 1;
      continue;
    }

    out += char;
  }

  /* الأسطر الفاضية اللي خلاّو التعليقات وراهم */
  return `${out.replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim()}\n`;
}

/*
 * تعليقات HTML.
 *
 * ⚠️ ما نلمسوش اللي داخل <script> و<style> — تعليق JS فيه `-->` نادر
 * بصح كاين، والقصّ الغالط تمّة يقتل الصفحة كاملة.
 */
export function stripHtml(html) {
  const guarded = [];

  /* العلامة تحمل بادئة: لو خلّيناها رقم واقف وحدو، أي رقم في نص
     الصفحة (سومة، كمية) يتبدّل بسكريبت كامل وقت الرجوع */
  const masked = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, (block) => {
    guarded.push(block);
    return ` qiti-keep-${guarded.length - 1} `;
  });

  const cleaned = masked
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n');

  /* الفراغات حوالي العلامة تقدر تتاكل في التنظيف فوق — لو طلبنا فراغ
     على الجهتين، السكريبت ما يرجعش والصفحة تخرج بلا جافاسكريبت */
  return cleaned.replace(/ ?qiti-keep-(\d+) ?/g, (_m, index) => guarded[Number(index)]);
}
