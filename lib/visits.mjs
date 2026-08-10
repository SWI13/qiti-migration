/*
 * عدّاد الزيارات — أساس نسبة التحويل (طلبات/زيارات) في اللوحة الإدارية.
 *
 * علاش ملف وحدو، ماشي زيادة في store.mjs ولا catalog.mjs: هذا تخزين
 * "أفضل جهد" (best-effort) — إذا ضاعت زيارة ولا زوج، ما فيها مشكل، بخلاف
 * الطلبات والمخزون اللي لازم يبقاو مضبوطين بالفلوس. خلطهم في نفس الملف
 * يخلّي القارئ يحسب بلّي visits() عندها نفس الجدّية تاع orders() — وماشي
 * صحيح.
 *
 * ── علاش تبدّل هذا الملف في هجرة Vercel ──────────────────────────────
 * قبل، Netlify Blobs ما كانش فيه عدّاد ذرّي، فكنّا نديرو compare-and-swap:
 * اقرا مع etag، احسب، اكتب بشرط `onlyIfMatch`، وإذا حد سبقنا عاود — خمس
 * محاولات، ومن بعد نستسلمو ونطيّحو الزيارة (`gave up after 5 attempts`).
 * البيكون يتبعث من كل صفحة، فالتصادم كان عادي والضياع حقيقي.
 *
 * Redis عندو HINCRBY: الزيادة تصرا في السيرفر روحو. حلقة المحاولات،
 * الـ etag، والزيارة الضائعة — كلهم تحيّدو. النهار ولّى hash:
 *
 *   views                    مجموع المشاهدات
 *   uniques                  مجموع الزوّار المتفرّدين
 *   npages                   عدد الصفحات المختلفة (للسقف تحت)
 *   updatedAt                آخر لمسة
 *   p:<kind>:<id>:views      مشاهدات صفحة وحدة
 *   p:<kind>:<id>:uniques    متفرّدين صفحة وحدة
 *
 * الشكل اللي يخرج لـ analytics.mjs بقى هو هو بالضبط — القراية تعاود
 * تركّب الكائن القديم من الـ hash.
 */
import { getStore } from './blobs.mjs';
import { algiersDate } from './store.mjs';

const visits = () => getStore('visits');

/* الأنواع المسموحة — أي واحد آخر يتردّ، بلا ما يوقّف البيكون */
export const VISIT_KINDS = new Set(['campaign', 'product']);

/* سقف التفرّع: بعد 200 صفحة مختلفة في نفس اليوم، الباقي يتجمّع تحت
   'other' باش صفحة نادرة (بوت، رابط قديم…) ما تضخّمش الكائن بلا حدّ */
const MAX_PAGES = 200;

const pageField = (pageKey, metric) => `p:${pageKey}:${metric}`;

/** يزيد عدّادات اليوم. عمرها ما ترمي خطأ — ترجع false إذا فشلت. */
export async function recordVisit({ kind, id, unique = false, now = new Date() }) {
  const store = visits();
  const day = algiersDate(now);
  const pageKey = `${kind}:${id}`;

  try {
    /* صفحة معروفة تعدّي مباشرةً. صفحة جديدة تتحسب على السقف أوّلاً —
       npages عدّاد قائم بذاتو باش ما نحسبوش الحقول ونخمّنو. */
    let target = pageKey;
    const known = await store.hexists(day, pageField(pageKey, 'views'));
    let newPage = false;
    if (!known) {
      const count = Number(await store.hget(day, 'npages')) || 0;
      if (count >= MAX_PAGES) target = 'other';
      else newPage = true;
    }

    const bump = unique ? 1 : 0;
    await store.hincr(day, {
      views: 1,
      uniques: bump,
      [pageField(target, 'views')]: 1,
      [pageField(target, 'uniques')]: bump,
      ...(newPage ? { npages: 1 } : {}),
    });
    await store.hset(day, { updatedAt: new Date().toISOString() });
    return true;
  } catch (error) {
    /* أفضل جهد: زيارة ضائعة ما تستاهلش تطيّح الطلب اللي جابها */
    console.warn(`recordVisit failed for ${pageKey} on ${day}: ${error.message}`);
    return false;
  }
}

/*
 * يعاود يركّب شكل اليوم القديم من الـ hash.
 * اسم الصفحة فيه ':' (kind:id)، فالقطع يكون من الطرفين: نحيّدو 'p:'
 * من القدّام و':views'/':uniques' من اللور — بلا split اللي يكسر الاسم.
 */
function dayFromHash(day, hash) {
  if (!hash || !Object.keys(hash).length) return null;

  const pages = {};
  for (const [field, value] of Object.entries(hash)) {
    if (!field.startsWith('p:')) continue;
    const metric = field.endsWith(':uniques') ? 'uniques' : 'views';
    const name = field.slice(2, field.length - metric.length - 1);
    if (!pages[name]) pages[name] = { views: 0, uniques: 0 };
    pages[name][metric] = Number(value) || 0;
  }

  return {
    day,
    totals: { views: Number(hash.views) || 0, uniques: Number(hash.uniques) || 0 },
    pages,
    updatedAt: hash.updatedAt ?? null,
  };
}

/** الأيام بين startDay وendDay (شاملين)، تصاعدي، بلا الأيام الفارغة. */
export async function listVisitDays(startDay, endDay) {
  const store = visits();
  const { blobs } = await store.list();
  const inRange = blobs.filter((blob) => blob.key >= startDay && blob.key <= endDay);
  const days = await Promise.all(
    inRange.map(async (blob) => dayFromHash(blob.key, await store.hgetall(blob.key))),
  );
  return days.filter(Boolean).sort((a, b) => a.day.localeCompare(b.day));
}

/** أوّل يوم عندنا فيه بيانات زيارات، ولا null. */
export async function firstVisitDay() {
  const { blobs } = await visits().list();
  if (!blobs.length) return null;
  return blobs.reduce((min, blob) => (blob.key < min ? blob.key : min), blobs[0].key);
}
