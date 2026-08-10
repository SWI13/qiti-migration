/*
 * يتأكّد بلي فورم اللوحة يغطّي كل حقل الأقسام تقراه.
 *
 * علاش: SECTION_FIELDS في admin.js وdestructuring في sections/*.mjs
 * هما نفس العقد مكتوب مرّتين في بلاصتين بعيدين. زيد حقل في قسم وتنسى
 * الفورم؟ الحقل يبقى ميّت للأبد وحتى واحد ما يلاحظ — الصفحة تتعرض بلاه
 * برك. هذا السكريبت يخلّي النسيان هذاك يطيح بدل ما يبقى مخبّي.
 *
 *   node scripts/check-admin-fields.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SECTIONS_DIR = 'lib/render/sections';

/* ── واش يقرا كل قسم؟ ─────────────────────────────────────────────── */

/** يقرا `const { a, b = 1, c } = data;` ويرجع ['a','b','c'] */
function destructuredKeys(source, from) {
  const start = source.indexOf('const {', from);
  const end = source.indexOf('} = data;', start);
  if (start === -1 || end === -1) return [];
  return [...new Set(
    source.slice(start + 7, end)
      .split(',')
      .map((part) => (part.split('=')[0] || '').trim())
      .filter((name) => /^[a-zA-Z_]\w*$/.test(name)),
  )];
}

/**
 * أسماء الخصائص اللي تتقرا من عناصر القوائم: `c.title` → title
 *
 * ملاحظة: المقارنة تتدار على مجموعة مسطّحة، ماشي قائمة بقائمة. يعني
 * لو `label` كانت في قائمتين وحيّدتها من وحدة، السكريبت ما يحسّش. باش
 * نديروها بالضبط لازمنا نحلّلو كل map في القسم — تعقيد ماشي مستاهل
 * على حقل الفورم يبان ناقص بالعين أوّل ما تفتح الحملة.
 */
function itemKeys(source) {
  return [...new Set(
    [...source.matchAll(/\b[a-z]\.([a-zA-Z_]\w+)\b/g)].map((m) => m[1]),
  )].filter((name) => !['map', 'filter', 'join', 'slice', 'length', 'trim', 'push'].includes(name));
}

/* ── واش يكتب الفورم؟ ─────────────────────────────────────────────── */

/* admin/admin.js (وحقلو t()) صار ملف ميّت — الفورم الحيّ راهو
   admin/js/section-fields.js، وفيه field() بدل t() (شوف الملاحظة
   فوق في ذاك الملف: t() تصادمت مع i18n.js). الملف كامل هو الوصفة،
   بلا حاجة نقصّو — ما فيهش والو بعد SECTION_FIELDS. */
const registry = readFileSync('admin/js/section-fields.js', 'utf8');

const FIELD_CALL = /\b(?:field|area|num|img|ico|bool|lines|list)\('([\w.]+)'/g;

/** حقول قسم واحد: العليا وحدها، والعليا + اللي جوّا القوائم */
function formFields(type) {
  const head = registry.indexOf(`\n  ${type}: [`);
  if (head === -1) return null;

  /* نبداو من بعد "[" تاع القسم روحو — وإلا الـ replace تحت يبلع
     من هذا القوس حتى لأوّل "]" ويمسح نص الحقول */
  const start = registry.indexOf('[', head) + 1;
  /* نهاية البلوك: أول "  ]," في أوّل العمود تاعو */
  const end = registry.indexOf('\n  ],', head);
  const body = registry.slice(start, end);

  const all = [...body.matchAll(FIELD_CALL)].map((m) => m[1]).filter((k) => !k.includes('.'));
  /* بلا اللي جوّا [ … ] — هذوك حقول العناصر ماشي حقول القسم */
  const top = [...body.replace(/\[[\s\S]*?\]/g, '[]').matchAll(FIELD_CALL)]
    .map((m) => m[1]).filter((k) => !k.includes('.'));

  return { top, all };
}

/* ── المقارنة ─────────────────────────────────────────────────────── */

let failures = 0;

for (const file of readdirSync(SECTIONS_DIR).filter((name) => name.endsWith('.mjs'))) {
  const type = file.replace('.mjs', '');
  const source = readFileSync(join(SECTIONS_DIR, file), 'utf8');
  const fields = formFields(type);

  if (!fields) {
    failures++;
    console.log(`✗ ${type} — ماكانش في SECTION_FIELDS تاع اللوحة`);
    continue;
  }

  const reads = destructuredKeys(source, source.indexOf('export default'));
  /* حقول العناصر تتفحّصو غير في الأقسام اللي عندها قوائم. القسم بلا
     قائمة (order مثلاً) يقرا `v.sku` و`o.name` تاع المنتج، ماشي تاع
     الحملة — وهذوك ما عندهمش خانة في الفورم أصلاً. */
  const hasLists = fields.all.length > fields.top.length;
  const items = hasLists ? itemKeys(source) : [];

  const missingTop = reads.filter((key) => !fields.top.includes(key));
  const missingItem = items.filter((key) => !fields.all.includes(key));

  if (missingTop.length || missingItem.length) {
    failures++;
    console.log(`✗ ${type}`);
    if (missingTop.length) console.log(`   حقول القسم الناقصة في الفورم: ${missingTop.join(', ')}`);
    if (missingItem.length) console.log(`   حقول العناصر الناقصة: ${missingItem.join(', ')}`);
  } else {
    console.log(`✓ ${type} — ${fields.top.length} حقل، ${fields.all.length - fields.top.length} حقل عنصر`);
  }
}

console.log(failures ? `\n${failures} قسم فيه فرق` : '\nالفورم يغطّي كل الأقسام.');
process.exit(failures ? 1 : 0);
