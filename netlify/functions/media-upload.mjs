/*
 * يستقبل صورة (multipart/form-data) ويخزّنها عبر lib/media.mjs.
 *
 * ⚠️ TODO — قبل الـ deploy: هذا الـ endpoint دروك بلا أي حماية حقيقية.
 * requireAdmin() تحت غير stub يرجع true دايماً — أي واحد يعرف الرابط
 * يقدر يرفع صور. نظام الدخول للوحة التحكم راهو قرار معماري يتاخذ في
 * مكان آخر؛ لازم هذا الفنكشن يتربط بيه قبل ما يطلع للإنتاج.
 */
import { saveMedia } from '../lib/media.mjs';

/** stub — يتبدّل كي يتحطّ نظام الدخول للوحة التحكم */
export function requireAdmin(request) {
  return true;
}

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

const MAX_SIZE = 5 * 1024 * 1024; /* 5 ميغا — حد صارم، ماشي اقتراح */
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

/*
 * يفحص أوّل بايتات الملف الحقيقية ويرجع الـ content-type اللي يوافقها،
 * ولا null إذا ما عرفهاش. هذا هو الفحص الوحيد اللي نثقو فيه — الـ
 * content-type اللي يبعثه المتصفح (declared) قصّة يقدر أي حد يبدّلها.
 */
export function sniffImageType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 12) return null;

  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';

  const ascii = (start, len) => String.fromCharCode(...b.slice(start, start + len));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }

  return null;
}

/*
 * التحقّق الكامل — بلا أي لمسة تخزين، باش يتقدر يتفحّص وحدو (سكريبت
 * ولا اختبار) بلا ما يحتاج Netlify Blobs. نرفضو، ما نصلّحوش: ملف
 * مشبوه يتشدّ برّا، ما نحاولوش نخمّنو شنو كان قاصد صاحبو.
 */
export function validateUpload({ bytes, declaredContentType }) {
  const size = bytes?.byteLength ?? 0;

  if (!bytes || size === 0) return { ok: false, error: 'الملف فارغ.' };
  if (size > MAX_SIZE) return { ok: false, error: 'الصورة كبيرة برشا. الحد الأقصى 5 ميغا.' };
  if (!ALLOWED_TYPES.has(declaredContentType)) {
    return { ok: false, error: 'نوع الملف ماشي مقبول. غير jpeg, png, webp, avif.' };
  }

  const sniffed = sniffImageType(bytes);
  if (!sniffed) return { ok: false, error: 'الملف هذا ماشي صورة حقيقية.' };
  /* الداخل ما يوافقش الملصق: كذّاب. نرفضو، ما نمشيوش وراء sniffed برك. */
  if (sniffed !== declaredContentType) {
    return { ok: false, error: 'محتوى الملف ماشي مطابق للنوع اللي صرّح بيه.' };
  }

  return { ok: true, contentType: sniffed };
}

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!requireAdmin(request)) return json(401, { error: 'ما عندكش صلاحية.' });

  let form;
  try {
    form = await request.formData();
  } catch {
    return json(400, { error: 'الطلب ماشي صحيح — خاصو يكون multipart/form-data.' });
  }

  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return json(400, { error: 'ما لقيناش صورة في الطلب.' });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const declaredContentType = file.type || '';

  const result = validateUpload({ bytes, declaredContentType });
  if (!result.ok) return json(400, { error: result.error });

  const alt = form.get('alt');

  try {
    const record = await saveMedia({
      bytes,
      contentType: result.contentType,
      filename: file.name ?? 'upload',
      alt: alt ? String(alt) : null,
    });
    return json(200, record);
  } catch (err) {
    console.error('Media save failed:', err.message);
    return json(502, { error: 'ما قدرناش نحفظو الصورة دروك. عاود حاول.' });
  }
}
