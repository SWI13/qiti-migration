/*
 * بناء مجلّد النشر.
 *
 * ⚠️ علاش هذا موجود: كان مجلّد النشر هو جذر المستودع كامل. أي واحد
 * كان يقدر يفتح:
 *
 *     /lib/catalog.mjs   → مفاتيح التخزين وكل منطق الكاتالوغ
 *     /lib/auth.mjs      → طريقة توقيع الكوكي
 *     /package.json      → …
 *
 * الفنكشنات تتبني وحدها من api/ (Vercel يلقاهم بالاسم)، فماشي لازم
 * يكونو في مجلّد النشر أصلاً. هنا ننسخو غير اللي الزائر محتاجو.
 *
 * قائمة بيضا ماشي سودا: حاجة جديدة ما تتنشرش حتى تكتبها هنا بيدك.
 * العكس (نمنعو حاجة حاجة) ينسى واحدة نهار من النهارات.
 */
import { cp, rm, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(repo, 'dist');

/* كل ما يخصّ الزائر — ولا واحد آخر */
const PUBLIC = ['index.html', 'assets', 'admin'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const entry of PUBLIC) {
  await cp(join(repo, entry), join(out, entry), { recursive: true });
}

console.log(`dist/ ready — ${PUBLIC.join(', ')}`);
