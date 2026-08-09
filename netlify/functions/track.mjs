/*
 * بيكون تتبّع الزيارات — يتبعث من `<script>` مزروع في صفحة الحملة/المنتج
 * (شوف lib/render/layout.mjs). لازم يكون هنا وماشي في render.mjs على
 * خاطر صفحات render.mjs مخبّية في الـ CDN لمدّة 5 دقائق، فالعدّ من جوّا
 * الفنكشن يبان كاذب — الزائر رقم 1000 يجي بلا ما render.mjs يحسّ بيه.
 *
 * الجواب ديماً 204 بلا محتوى، مهما صرا (طلب ماشي POST، JSON مكسور،
 * قيم ماشي صحيحة، فشل التخزين...) — البيكون ما يهمّوش الجواب، وما نبعثوش
 * تفاصيل الخطأ لصفحة عمومية.
 */
import { requireAdmin } from '../lib/auth.mjs';
import { recordVisit, VISIT_KINDS } from '../lib/visits.mjs';

const ID_RE = /^[A-Za-z0-9_:-]{1,64}$/;

const noContent = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

export default async function handler(request) {
  if (request.method !== 'POST') return new Response(null, { status: 405 });

  /* جلسة الإدمين متسجّلة عبر كوكي — نستثنيوها باش تصفّح المشغّل روحو
     ما يضخّمش نسبة التحويل بزيارات وهمية */
  if (requireAdmin(request)) return noContent();

  let body;
  try {
    body = await request.json();
  } catch {
    return noContent();
  }

  if (!VISIT_KINDS.has(body?.k) || !ID_RE.test(String(body?.i ?? ''))) return noContent();

  await recordVisit({ kind: body.k, id: body.i, unique: body.u === 1 }).catch(() => false);

  return noContent();
}
