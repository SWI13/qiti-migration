/*
 * الجغرافيا تاع الموصّل: الولايات، البلديات، والمكاتب.
 *
 * ── علاش هاذ الملف موجود ───────────────────────────────────────────
 * الموصّل ما يقبلش بلدية مكتوبة كيما جات. أوّل طردة تجريبية رجعت:
 *
 *     commune: Commune mal écrite, ou désactivée.
 *
 * وأسماؤهم باللاتيني ("Blida", "Ouled Yaich") والفورم تاعنا يجمع عربي
 * ("البليدة", "أولاد يعيش"). فلازم قائمتهم هي المرجع: الزبونة تختار
 * منها، والطلب يخزّن الاسم اللي يقبلوه.
 *
 * ── المخزن ─────────────────────────────────────────────────────────
 * 1542 بلدية ما تتبدّلش كل نهار. نخزّنوها في Redis لـ 24 ساعة: الصفحة
 * والفنكشنات يقراو من التخزين، والنداء البرّاني يصرا مرّة في النهار.
 * فشل التحديث ما يمسحش المخزون القديم — قائمة قديمة بيوم خير من فورم
 * بلا بلديات.
 *
 * ⚠️ `get/desks` ما كاينش في نطاق DHD (404). المكتب معروف من البلدية
 * روحها: `has_stop_desk`.
 */
import { getStore } from '../blobs.mjs';
import { listWilayas, listCommunes } from './client.mjs';

const GEO = 'ecotrack-geo';
const KEY = 'communes';
const TTL_MS = 24 * 60 * 60 * 1000;

const store = () => getStore(GEO);

const unwrap = (payload) => {
  const data = payload?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

/**
 * تطبيع الاسم للمقارنة: حروف صغيرة، بلا علامات (é → e)، والشرطة
 * والفاصلة يولّيو فراغ. "Ouled-Yaïch" و"ouled yaich" يولّيو نفس المفتاح.
 */
export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .trim();
}

/** يجيب من عندهم ويخزّن. يرجع الشكل المخزّن، ولا الخطأ إذا طاح. */
export async function refreshGeo() {
  const [wilayas, communes] = await Promise.all([listWilayas(), listCommunes()]);
  if (wilayas.error || communes.error || wilayas.skipped || communes.skipped) {
    return { error: wilayas.error ?? communes.error ?? 'ECOTRACK_URL / ECOTRACK_TOKEN غير مضبوطين' };
  }

  /* جواب سليم بلا بلديات = حاجة ماشي في محلّها. ما نخزّنوش الفراغ:
     الكاش يبقى على القديم، والنداء الجاي يعاود يجرّب. */
  if (!unwrap(communes).length) return { error: 'الموصّل رجّع قائمة بلديات فارغة' };

  const rows = unwrap(communes).map((row) => ({
    name: row.nom ?? row.name ?? '',
    wilayaId: Number(row.wilaya_id ?? row.wilayaId ?? 0),
    postalCode: row.code_postal ?? null,
    desk: Boolean(row.has_stop_desk),
  })).filter((row) => row.name && row.wilayaId);

  const record = {
    wilayas: unwrap(wilayas).map((row) => ({
      id: Number(row.wilaya_id ?? row.id ?? 0),
      name: row.wilaya_name ?? row.name ?? '',
    })).filter((row) => row.id),
    communes: rows,
    fetchedAt: new Date().toISOString(),
  };

  await store().setJSON(KEY, record);
  return record;
}

/** المخزّن كيما هو — بلا نداء برّاني */
export const readGeo = () => store().get(KEY, { type: 'json' });

/**
 * المخزّن، ويحدّثو إذا فات عليه يوم. `force` تعاود الجلب مهما كان.
 * فشل التحديث يرجّع القديم — الفورم يبقى يخدم.
 */
export async function getGeo({ force = false } = {}) {
  const cached = await readGeo().catch(() => null);
  /* كاش فارغ (من نسخة قديمة فيها العلّة) يتحسب قديم — وإلا يقعد
     يجاوب بفراغ حتى يفوت اليوم */
  const empty = !cached?.communes?.length;
  const stale = empty || !cached?.fetchedAt
    || Date.now() - new Date(cached.fetchedAt).getTime() > TTL_MS;

  if (!force && cached && !stale) return cached;

  const fresh = await refreshGeo();
  if (fresh.error) return cached ?? { wilayas: [], communes: [], fetchedAt: null, error: fresh.error };
  return fresh;
}

/** بلديات ولاية وحدة، مرتّبة بالاسم */
export const communesOf = (geo, wilayaId) =>
  (geo?.communes ?? [])
    .filter((row) => row.wilayaId === Number(wilayaId))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

/**
 * يلقى البلدية اللي يقبلها الموصّل.
 *
 * الطلب الجديد يخزّن الاسم تاعهم كيما هو، فالمطابقة تصيب من أوّل
 * محاولة. الطلبات القديمة (نص حرّ عربي) نجرّبو معاهم المطابقة المطبّعة،
 * وإذا ما صابتش نرجعو null — والمشغّل يختار بيدو في اللوحة. التخمين
 * هنا معناه طردة تروح لبلدية أخرى.
 */
export function matchCommune(geo, wilayaId, name) {
  const rows = communesOf(geo, wilayaId);
  if (!rows.length) return null;

  const wanted = normalizeName(name);
  if (!wanted) return null;

  return rows.find((row) => normalizeName(row.name) === wanted)
    ?? rows.find((row) => normalizeName(row.name).startsWith(wanted))
    ?? null;
}

/**
 * بلدية المكتب لطلب "للمكتب": بلدية الزبونة إذا فيها مكتب، وإلا أوّل
 * بلدية فيها مكتب في نفس الولاية — نفس اللي تديرو التكاملات الأخرى.
 * ولاية بلا مكتب خالص ترجع null، والنادي يقرّر.
 */
export function deskCommuneFor(geo, wilayaId, communeName) {
  const own = matchCommune(geo, wilayaId, communeName);
  if (own?.desk) return own;
  return communesOf(geo, wilayaId).find((row) => row.desk) ?? null;
}
