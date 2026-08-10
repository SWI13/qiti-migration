/*
 * طبقة التخزين — بديل @netlify/blobs.
 *
 * كل الكود (catalog, store, media, visits, admin-login) يعدّي على
 * getStore(name) وحدها. علاش هذا مهمّ: تبديل المزوّد ما يمسّش ولا سطر
 * في المنطق — 104 نداءات في 6 ملفات يبقاو كيما هوما، ونعاودو نكتبو
 * هاذ الملف وحدو.
 *
 * ── واش راح فين ───────────────────────────────────────────────────
 *   Redis (Upstash)  — كل شي JSON صغير: منتجات، حملات، طلبات، مخزون،
 *                      تكاليف، زيارات، جلسات الدخول. قراءة كثيرة
 *                      وسريعة، والحجم صغير.
 *   Vercel Blob      — 'media-bin' برك: بايتات الصور. ملفات كبيرة،
 *                      تتقرا مرّة وتتخزّن في CDN.
 *
 * ⚠️ الفرق الوحيد اللي يبان للمستدعي: Netlify Blobs كان يرجّع etag مع
 * getWithMetadata، وvisits.mjs كان يبني عليه compare-and-swap. Redis
 * عندو عدّادات ذرّية (HINCRBY) أحسن من CAS — فvisits.mjs تبدّل باش
 * يستعملها، وما بقاش يحتاج etag. شوف lib/visits.mjs.
 */
import { Redis } from '@upstash/redis';
import { put, del as blobDel, list as blobList, head } from '@vercel/blob';

/* البادئة تمنع التصادم لو المخزن مشترك مع مشروع آخر، وتخلّي
   SCAN يقدر يحصر مخزن واحد بلا ما يمشي على المفاتيح كاملة */
const NS = 'qiti';

/* المخزن الوحيد اللي يسكن في Vercel Blob — الباقي كامل Redis */
const BINARY_STORE = 'media-bin';

let redisClient = null;

/* الاتصال يتبنى عند أوّل استعمال ماشي عند الاستيراد: سكريبتات التحقّق
   تستورد catalog.mjs بلا متغيّرات بيئة، ولازم ما تطيحش قبل ما تنادي
   حتى حاجة */
function redis() {
  if (redisClient) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('التخزين ماشي مضبوط: UPSTASH_REDIS_REST_URL و UPSTASH_REDIS_REST_TOKEN ناقصين');
  }
  redisClient = new Redis({ url, token });
  return redisClient;
}

const keyOf = (store, key) => `${NS}:${store}:${key}`;

/* ── مخزن JSON على Redis ─────────────────────────────────────────── */

function redisStore(name) {
  const full = (key) => keyOf(name, key);

  return {
    /*
     * get(key) → نص، وget(key, {type:'json'}) → كائن.
     * Upstash يفكّ الـ JSON وحدو كي يلقى نص JSON صالح، فالنتيجة تقدر
     * تجي كائن حتى بلا {type:'json'} — نرجّعوها كيما هي في الحالتين
     * ونخلّيو النوع يتقرّر من الخيار كيما كان يدير Netlify.
     */
    async get(key, opts) {
      const raw = await redis().get(full(key));
      if (raw == null) return null;
      if (opts?.type === 'json') return typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (opts?.type === 'arrayBuffer') {
        return typeof raw === 'string' ? new TextEncoder().encode(raw).buffer : raw;
      }
      return typeof raw === 'string' ? raw : JSON.stringify(raw);
    },

    /*
     * getWithMetadata كانت تخدم CAS بالـ etag. دروك ما بقى حتى مستدعي
     * يحتاج الـ etag (visits.mjs ولّى HINCRBY) — نخلّيوها ترجّع نفس
     * الشكل { data } باش أي كود قديم ما ينهارش، بلا etag كاذب.
     */
    async getWithMetadata(key, opts) {
      const data = await this.get(key, opts);
      if (data == null) return null;
      return { data, metadata: {} };
    },

    async set(key, value, opts) {
      const ttl = opts?.ttlSeconds;
      if (ttl) return redis().set(full(key), value, { ex: ttl });
      return redis().set(full(key), value);
    },

    async setJSON(key, value, opts) {
      const ttl = opts?.ttlSeconds;
      const payload = JSON.stringify(value);
      if (ttl) return redis().set(full(key), payload, { ex: ttl });
      return redis().set(full(key), payload);
    },

    async delete(key) {
      return redis().del(full(key));
    },

    /*
     * list() تتنادى ديما بلا وسائط في هاذ المشروع — تعني "كل مفاتيح
     * هاذ المخزن". SCAN ماشي KEYS: KEYS يوقّف Redis كامل على مخزن
     * كبير. الشكل المرجَّع ({ blobs: [{ key }] }) هو نفسو تاع Netlify
     * باش المستدعيين ما يتبدّلوش.
     */
    async list() {
      const prefix = `${NS}:${name}:`;
      const client = redis();
      const keys = [];
      let cursor = 0;
      do {
        const [next, batch] = await client.scan(cursor, { match: `${prefix}*`, count: 500 });
        cursor = Number(next);
        for (const k of batch) keys.push(k.slice(prefix.length));
      } while (cursor !== 0);
      return { blobs: keys.map((key) => ({ key })) };
    },

    /* ── عدّادات ذرّية (hash) ──────────────────────────────────────
       زيادة على واجهة Netlify، مستعملة من lib/visits.mjs وحدها.
       العدّاد هنا ماشي "اقرا ثم اكتب": HINCRBY يزيد في السيرفر، فزوج
       زيارات في نفس اللحظة ما ياكلوش بعضهم — وهذا كامل سبب وجود
       حلقة الـ CAS القديمة اللي تحيّدت. */
    async hincr(key, increments) {
      const client = redis();
      const k = full(key);
      const pipe = client.pipeline();
      for (const [field, by] of Object.entries(increments)) pipe.hincrby(k, field, by);
      await pipe.exec();
    },

    async hset(key, fields) {
      return redis().hset(full(key), fields);
    },

    async hget(key, field) {
      return redis().hget(full(key), field);
    },

    async hexists(key, field) {
      return Boolean(await redis().hexists(full(key), field));
    },

    async hgetall(key) {
      return redis().hgetall(full(key));
    },
  };
}

/* ── مخزن البايتات على Vercel Blob ───────────────────────────────── */

/*
 * Vercel Blob ما عندوش "مفتاح" حرّ كيما Netlify — يعطي URL. نخزّنو
 * تحت مسار ثابت (media-bin/<id>) وaddRandomSuffix:false باش المفتاح
 * يبقى هو نفسو اللي نقراو بيه، ونقدرو نلقاو الملف من الـ id وحدو.
 */
function blobStore(name) {
  const pathOf = (key) => `${name}/${key}`;

  return {
    async get(key, opts) {
      const meta = await head(pathOf(key)).catch(() => null);
      if (!meta) return null;
      const res = await fetch(meta.url);
      if (!res.ok) return null;
      if (opts?.type === 'arrayBuffer') return res.arrayBuffer();
      if (opts?.type === 'json') return res.json();
      return res.text();
    },

    async getWithMetadata(key, opts) {
      const data = await this.get(key, opts);
      if (data == null) return null;
      return { data, metadata: {} };
    },

    /* ⚠️ allowOverwrite في @vercel/blob@2 يجي false بالتلقائي، والكتابة
       على مفتاح موجود ترمي خطأ. سلوك Netlify Blobs كان "اكتب فوقو"،
       والمستدعيين مبنيين عليه — فنرجّعوه صريح. */
    async set(key, value) {
      await put(pathOf(key), value, {
        access: 'public', addRandomSuffix: false, allowOverwrite: true,
      });
    },

    async setJSON(key, value) {
      await put(pathOf(key), JSON.stringify(value), {
        access: 'public', addRandomSuffix: false, allowOverwrite: true,
        contentType: 'application/json',
      });
    },

    /* del ياخذ المسار مباشرةً — ما نحتاجوش head قبلها */
    async delete(key) {
      await blobDel(pathOf(key)).catch(() => {});
    },

    async list() {
      const prefix = `${name}/`;
      const out = [];
      let cursor;
      do {
        const page = await blobList({ prefix, cursor, limit: 1000 });
        for (const b of page.blobs) out.push({ key: b.pathname.slice(prefix.length) });
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return { blobs: out };
    },
  };
}

/** getStore(name) — نفس التوقيع تاع @netlify/blobs */
export function getStore(name) {
  return name === BINARY_STORE ? blobStore(name) : redisStore(name);
}
