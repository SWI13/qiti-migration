/*
 * سيرفر ستاتيك خفيف للتطوير المحلي، بلا أي dependency.
 *
 * ⚠️ علاش هذا موجود: `netlify dev` بلا [dev].command يستعمل سيرفر
 * ستاتيك مبني فيه ("simple static server") — وهذا مكسور فعلياً في
 * النسخة الحالية: يخدم index.html في الجذر برك، وأي ملف في مجلّد
 * فرعي (`/admin/admin.js`, `/assets/js/main.js`, …) يرجع 403 بلا
 * حتى تسجيل. جرّبناه — كل الملفات الفرعية طايحة، ماشي غير `/admin`.
 *
 * الحل: سيرفر بسيط نكتبوه بروحنا، و`netlify dev` يستعملو كـ [dev].command
 * (شوف netlify.toml) — netlify راهو يدير البروكسي فوقو للفنكشنات
 * والـ redirects، وهذا السيرفر يخدم غير الملفات.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
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

    const body = await readFile(full);
    res.writeHead(200, { 'content-type': TYPES[extname(full)] ?? 'application/octet-stream' });
    res.end(body);
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});

server.listen(port, () => console.log(`dev-server: serving ${root} on :${port}`));
