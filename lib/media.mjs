/*
 * الميديا — تخزين صور المنتجات على Netlify Blobs. هذا هو الأساس لخطوة
 * "ارفع صور منتجك" في باني الحملات، اللي دروك ما تحتها حتى حاجة.
 *
 * ── ليش زوج stores ماشي واحد ────────────────────────────────────────
 * البينات الثنائية (bytes) عندها طبيعة مختلفة على الـ metadata (JSON):
 * listMedia() تحتاج تلوّح على كل الصور باش تعرض المكتبة، وما تحتاجش
 * تجرّ كل صورة كاملة باش تعرف اسمها وقياسها. لو كانو مخلوطين في نفس
 * الـ store، كل list يخاطر يقرا ميغابايتات بلا داعي.
 *
 *   media-bin:<id>    البينات الخام — تتقرا بـ arrayBuffer
 *   media-meta:<id>   { id, filename, contentType, size, alt, width, height, createdAt }
 *
 * width/height دايماً null: ماعندناش مكتبة صور نقرا بيها الأبعاد
 * (parse-and-measure)، وما نزيدوش dependency على خاطر هذا برك.
 */
import { getStore } from './blobs.mjs';
import { newId } from './catalog.mjs';

const MEDIA_BIN = 'media-bin';
const MEDIA_META = 'media-meta';

const binaries = () => getStore(MEDIA_BIN);
const meta = () => getStore(MEDIA_META);

/** يخزّن الصورة (بينات + وصف) ويرجع السجل — الفاليداصيون تصرا قبل ما توصل هنا */
export async function saveMedia({ bytes, contentType, filename, alt = null }) {
  const id = newId('med_');
  const record = {
    id,
    filename: String(filename ?? '').slice(0, 200),
    contentType,
    size: bytes.byteLength ?? 0,
    alt: alt ? String(alt).slice(0, 200) : null,
    width: null,
    height: null,
    createdAt: new Date().toISOString(),
  };

  /* البينات قبل الـ metadata: لو الميتاداتا نجحت والبينات لا، السجل
     يشاور على صورة ماكاينة — عكس هذا أسلم (بينات يتيمة بلا سجل، تتمحى
     وحدها المرّة الجاية). */
  await binaries().set(id, bytes);
  await meta().setJSON(id, record);
  return record;
}

export const getMedia = (id) => meta().get(id, { type: 'json' });

export const getMediaBytes = (id) => binaries().get(id, { type: 'arrayBuffer' });

/** الأحدث أولاً — هكذا الصورة اللي زدتها دروك تبان في رأس المكتبة */
export async function listMedia() {
  const { blobs } = await meta().list();
  const records = await Promise.all(blobs.map((b) => meta().get(b.key, { type: 'json' })));
  return records.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteMedia(id) {
  const existing = await getMedia(id);
  if (!existing) return false;
  await binaries().delete(id);
  await meta().delete(id);
  return true;
}

/** الرابط اللي تستعملو الصفحات — content-addressed بالإنشاء، يعني id واحد ما يتبدّلش أبداً */
export const mediaUrl = (id) => `/media/${id}`;
