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
import { cp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectShippingRates } from './inject-rates.mjs';
import { injectTikTokPixel } from './inject-pixel.mjs';
import { stripCss, stripHtml } from './strip-comments.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(repo, 'dist');

/* كل ما يخصّ الزائر — ولا واحد آخر */
const PUBLIC = ['index.html', 'checkout-success.html', 'assets', 'admin'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const entry of PUBLIC) {
  await cp(join(repo, entry), join(out, entry), { recursive: true });
}

/*
 * جدول التوصيل يتحقن في الصفحة الستاتيك.
 *
 * الصفحات المعروضة من الخادم تاخذ الجدول من renderer، بصح index.html
 * ملف ثابت — بلا حقن، الصفحة تحسب بتسعيرة وحدة قديمة والزبون يشوف
 * سومة غير سومة اللي يحسبها السيرفر.
 */
/* التعليقات تبقى في المصدر وتخرج من المنشور — شوف strip-comments.mjs */
const cssPath = join(out, 'assets', 'css', 'styles.css');
await writeFile(cssPath, stripCss(await readFile(cssPath, 'utf8')));

const indexPath = join(out, 'index.html');
await writeFile(
  indexPath,
  injectTikTokPixel(injectShippingRates(stripHtml(await readFile(indexPath, 'utf8')))),
);

/*
 * صفحة نجاح الطلب لازمها البيكسل حتى هي — هي الرابط اللي تيك توك
 * تعرّف بيه التحويل، وبلا بيكسل الزيارة ما تتحسبش. جدول التوصيل
 * ما يلزمهاش: ما فيها حتى حساب سومة.
 */
const successPath = join(out, 'checkout-success.html');
await writeFile(
  successPath,
  injectTikTokPixel(stripHtml(await readFile(successPath, 'utf8'))),
);

console.log(`dist/ ready — ${PUBLIC.join(', ')} (+ جدول التوصيل + بيكسل تيك توك)`);
