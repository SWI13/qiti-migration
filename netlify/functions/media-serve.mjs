/*
 * يخدم صورة مخزّنة. الرابط العام `/media/:id` يوصل هنا عبر redirect
 * في netlify.toml — الـ id هو آخر جزء في المسار، ونفس المنطق يخدم
 * سواء الـ redirect جا بـ :id ولا بـ :splat.
 */
import { getMedia, getMediaBytes } from '../lib/media.mjs';

/* الـ id مبني على وقت الإنشاء (newId في catalog.mjs) وما يتبدّلش أبداً
   بعد ما يتخلق — فالكاش يقدر يبقى سنة كاملة بلا خوف من صورة قديمة عالقة */
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

const notFound = () => new Response('Not found', {
  status: 404,
  headers: { 'x-content-type-options': 'nosniff' },
});

export default async function handler(request) {
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
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
