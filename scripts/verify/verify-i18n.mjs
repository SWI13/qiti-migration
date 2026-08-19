/*
 * كل مفتاح نصّ تستعملو اللوحة، واش راه معرَّف؟
 *
 * ── علاش ───────────────────────────────────────────────────────────
 * `t()` في admin/js/i18n.js ترجّع **المفتاح روحو** كي ما تلقاهش:
 *
 *     export function t(key, vars) {
 *       var str = STRINGS_EN[key];
 *       if (str == null) return key;
 *
 * يعني مفتاح ناقص ما يطيّح والو — يطبع `dashboard.lowStock` في وسط
 * اللوحة كأنّها تسمية. ما كاين لا خطأ في الكونسول لا صفحة بيضا، غير
 * نص غريب في بلاصة نص عادي. وهذا يعيش حتى يشوفو واحد بعينو.
 *
 * ── التقريب ────────────────────────────────────────────────────────
 * ⚠️ بعض المفاتيح تتبنى بالتركيب: `t('campaigns.step' + key)` في
 * صفحة الحملات. هاذو ما نقدروش نتحقّقو منهم ساكن، فنقبلو أي مفتاح
 * مستعمل يكون **بادئة** لمفتاح معرَّف — `campaigns.step` تعدّي على
 * خاطر `campaigns.stepDetails` موجودة.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const ok = (label, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

const stringsDir = join(repo, 'admin', 'js', 'strings');
const declared = new Set();
for (const file of walk(stringsDir)) {
  for (const m of readFileSync(file, 'utf8').matchAll(/'([\w.]+)'\s*:/g)) declared.add(m[1]);
}

ok('لائحة النصوص ماشي فارغة', declared.size > 100, `${declared.size} مفتاح`);

/* مفتاح مستعمل يعدّي إذا كان معرَّف، ولا كان بادئة لواحد معرَّف */
const known = (key) => declared.has(key) || [...declared].some((one) => one.startsWith(key));

const missing = [];
for (const file of walk(join(repo, 'admin', 'js'))) {
  if (file.includes(`${'strings'}`)) continue;
  const source = readFileSync(file, 'utf8');
  for (const m of source.matchAll(/\bt\(\s*'([\w.]+)'/g)) {
    if (!known(m[1])) missing.push(`${m[1]} (${relative(repo, file).replace(/\\/g, '/')})`);
  }
}

ok('كل مفتاح تستعملو اللوحة معرَّف', missing.length === 0, missing.join(' · '));

/*
 * والعكس: مفتاح معرَّف وما يتنادى عمرو = نصّ ميّت. ماشي عطب، بصح
 * يكبّر اللائحة ويخلّي المترجم يترجم حوايج ما تبانش.
 *
 * ⚠️ ما نطيّحوش عليه — بعض المفاتيح تتبنى بالتركيب فما نقدروش نعرفو
 * بالضبط شكون مستعمل. نعدّوهم برك باش الرقم يبان كي يكبر.
 */
const usedKeys = new Set();
for (const file of walk(join(repo, 'admin', 'js'))) {
  if (file.includes('strings')) continue;
  const source = readFileSync(file, 'utf8');
  for (const m of source.matchAll(/'([\w]+\.[\w.]+)'/g)) usedKeys.add(m[1]);
}
const orphans = [...declared].filter((key) => !usedKeys.has(key));
console.log(`\nمفاتيح ما لقيناهمش مستعملين مباشرةً: ${orphans.length} من ${declared.size} (بعضهم يتبنى بالتركيب)`);

/* مفاتيح مكرّرة في نفس الملف — الثانية تغلب الأولى بالسكات */
let duplicates = 0;
for (const file of walk(stringsDir)) {
  const seen = new Set();
  for (const m of readFileSync(file, 'utf8').matchAll(/'([\w.]+)'\s*:/g)) {
    if (seen.has(m[1])) {
      duplicates += 1;
      console.log(`FAIL  مفتاح مكرّر: ${m[1]} في ${relative(repo, file).replace(/\\/g, '/')}`);
    }
    seen.add(m[1]);
  }
}
ok('ما كاينش مفتاح مكرّر', duplicates === 0);

process.exit(missing.length || duplicates ? 1 : 0);
