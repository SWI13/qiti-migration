/*
 * يخدم صورة مخزّنة. الرابط العام `/media/:id` يوصل هنا عبر redirect
 * في vercel.json — الـ id هو آخر جزء في المسار، ونفس المنطق يخدم
 * سواء الـ redirect جا بـ :id ولا بـ :splat.
 */
import { getMedia, getMediaBytes } from '../lib/media.mjs';
import { toVercel } from '../lib/http.mjs';

/* الـ id مبني على وقت الإنشاء (newId في catalog.mjs) وما يتبدّلش أبداً
   بعد ما يتخلق — فالكاش يقدر يبقى سنة كاملة بلا خوف من صورة قديمة عالقة */
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

const notFound = () => new Response('Not found', {
  status: 404,
  headers: { 'x-content-type-options': 'nosniff' },
});

async function handler(request) {
  const url = new URL(request.url);
  /* الـ rewrite في vercel.json يمرّر المعرّف في ?id= — pathname بعد
     الـ rewrite يولّي /api/media-serve وما فيهش المعرّف. آخر جزء من
     المسار يبقى احتياط للنداء المباشر. */
  const raw = url.searchParams.get('id') ?? url.pathname.split('/').filter(Boolean).pop() ?? '';
  const id = decodeURIComponent(raw);
  if (!id) return notFound();

  const record = await getMedia(id);
  if (!record) return notFound();

  const bytes = await getMediaBytes(id);
  if (!bytes) return notFound();

  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': record.contentType,
      'cache-control': CACHE_CONTROL,
      'x-content-type-options': 'nosniff',
    },
  });
}

/* توقيع Vercel هو (req,res) — الجسر في lib/http.mjs */
export default toVercel(handler);
