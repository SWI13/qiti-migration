/*
 * سيرفر ستاتيك خفيف للتطوير المحلي، بلا أي dependency.
 *
 * ⚠️ هذا يخدم **الملفات برك** — ما فيهش فنكشنات ولا rewrites.
 *
 * للواجهة الإدارية يكفي: هارنس الاختبار يعترض /api/admin-api ويجاوب
 * بداتا مزيّفة، فما نحتاجوش سيرفر حقيقي باش نجرّبو اللوحة.
 *
 * كي تحتاج الفنكشنات الحقيقية (دخول حقيقي، طلبات، تخزين) استعمل:
 *     npx vercel dev
 * هو اللي يقرا vercel.json، يشغّل api/*.mjs، ويدير الـ rewrites كيما
 * في الإنتاج. هذا السيرفر يبقى للحالة السريعة: بدّل ملف في admin/ وأعمل
 * refresh، بلا build وبلا حساب Vercel.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { injectShippingRates } from './inject-rates.mjs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const port = Number(process.env.PORT) || 8896;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path.includes('..')) { res.writeHead(400); res.end(); return; }

    let full = join(root, path);
    let info = await stat(full).catch(() => null);
    if (info?.isDirectory()) {
      full = join(full, 'index.html');
      info = await stat(full).catch(() => null);
    }
    if (!info) { res.writeHead(404); res.end('Not found'); return; }

    /* نفس الحقن اللي في scripts/build.mjs — بلاه، التجريب المحلّي
       يعرض تسعيرة توصيل غير اللي يعرضها الموقع المنشور */
    const body = full.endsWith('index.html')
      ? injectShippingRates(await readFile(full, 'utf8'))
      : await readFile(full);
    res.writeHead(200, { 'content-type': TYPES[extname(full)] ?? 'application/octet-stream' });
    res.end(body);
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});

server.listen(port, () => console.log(`dev-server: serving ${root} on :${port}`));
