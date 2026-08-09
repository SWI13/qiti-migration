/*
 * عدّاد الزيارات — أساس نسبة التحويل (طلبات/زيارات) في اللوحة الإدارية.
 *
 * علاش ملف وحدو، ماشي زيادة في store.mjs ولا catalog.mjs: هذا تخزين
 * "أفضل جهد" (best-effort) — إذا ضاعت زيارة ولا زوج، ما فيها مشكل، بخلاف
 * الطلبات والمخزون اللي لازم يبقاو مضبوطين بالفلوس. خلطهم في نفس الملف
 * يخلّي القارئ يحسب بلّي visits() عندها نفس الجدّية تاع orders() — وماشي
 * صحيح.
 *
 * علاش compare-and-swap ماشي قراية-ثم-كتابة: Netlify Blobs ما فيهاش
 * عدّاد ذرّي (atomic increment). لو قرينا وكتبنا بلا شرط، بزوج زيارات
 * جايين في نفس اللحظة (وهذا عادي بزاف — البيكون يتبعث من كل صفحة) توّة
 * وحدة تبلع الأخرى. `onlyIfMatch`/`onlyIfNew` يخلّيو الكتابة تفشل إذا حد
 * سبقنا، ونعاودو نقرا ونحسبو من جديد.
 */
import { getStore } from '@netlify/blobs';
import { algiersDate } from './store.mjs';

const visits = () => getStore('visits');

/* الأنواع المسموحة — أي واحد آخر يتردّ، بلا ما يوقّف البيكون */
export const VISIT_KINDS = new Set(['campaign', 'product']);

/** يزيد عدّادات اليوم. عمرها ما ترمي خطأ — ترجع false إذا فشلت. */
export async function recordVisit({ kind, id, unique = false, now = new Date() }) {
  const store = visits();
  const key = algiersDate(now);
  const pageKey = `${kind}:${id}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    const current = existing?.data ?? { day: key, totals: { views: 0, uniques: 0 }, pages: {}, updatedAt: null };

    /* سقف التفرّع: بعد 200 صفحة مختلفة في نفس اليوم، الباقي يتجمّع تحت 'other'
       باش صفحة واحدة نادرة (بوت، رابط قديم...) ما تضخّمش الكائن بلا حدّ */
    const knownKeys = Object.keys(current.pages);
    const targetKey = (knownKeys.length >= 200 && !knownKeys.includes(pageKey)) ? 'other' : pageKey;

    const pageEntry = current.pages[targetKey] ?? { views: 0, uniques: 0 };
    const next = {
      day: key,
      totals: {
        views: current.totals.views + 1,
        uniques: current.totals.uniques + (unique ? 1 : 0),
      },
      pages: {
        ...current.pages,
        [targetKey]: {
          views: pageEntry.views + 1,
          uniques: pageEntry.uniques + (unique ? 1 : 0),
        },
      },
      updatedAt: new Date().toISOString(),
    };

    try {
      const result = existing
        ? await store.setJSON(key, next, { onlyIfMatch: existing.etag })
        : await store.setJSON(key, next, { onlyIfNew: true });
      if (result.modified) return true;
    } catch {
      /* etag تبدّل ولا المفتاح تولد بين يدين — نعاودو نقرا ونحسبو */
    }

    /* استنّاء عشوائي قصير قبل ما نعاودو، باش ما نتصادموش مرّة ثانية بالضبط */
    await new Promise((r) => setTimeout(r, 10 + Math.random() * 50));
  }
  console.warn(`recordVisit: gave up after 5 attempts for ${pageKey} on ${key}`);
  return false;
}

/** الأيام بين startDay وendDay (شاملين)، تصاعدي، بلا الأيام الفارغة. */
export async function listVisitDays(startDay, endDay) {
  const { blobs } = await visits().list();
  const inRange = blobs.filter((blob) => blob.key >= startDay && blob.key <= endDay);
  const days = await Promise.all(inRange.map((blob) => visits().get(blob.key, { type: 'json' })));
  return days.filter(Boolean).sort((a, b) => a.day.localeCompare(b.day));
}

/** أوّل يوم عندنا فيه بيانات زيارات، ولا null. */
export async function firstVisitDay() {
  const { blobs } = await visits().list();
  if (!blobs.length) return null;
  return blobs.reduce((min, blob) => (blob.key < min ? blob.key : min), blobs[0].key);
}
