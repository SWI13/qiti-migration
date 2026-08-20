/*
 * Redis مزيّف في نفس العملية — باش الفحوصات تمسّ التخزين الحقيقي.
 *
 * ── علاش سيرفر HTTP وماشي mock على الموديل ────────────────────────
 * `lib/blobs.mjs` يخدم بعميل Upstash فوق REST. لو زوّرنا `getStore`
 * روحها، نفحصو منطقنا احنا وما نفحصوش الطبقة اللي تحتو — و`onlyIfNew`
 * (SET NX) هي بالضبط الحاجة اللي طاحت مرّة قبل وخسّرت المخزون. هنا
 * السيرفر يتكلّم نفس البروتوكول، فالفحص يعدّي على العميل الحقيقي
 * وعلى بناء المفاتيح الحقيقي.
 *
 * ⚠️ يدعم غير الأوامر اللي المشروع يستعملها. أمر جديد في blobs.mjs
 * لازم يتزاد هنا — والفحص يطيح بوضوح بدل ما يكذب.
 */
import { createServer } from 'node:http';

export function fakeRedis() {
  const db = new Map();
  const hashes = new Map();
  const lists = new Map();
  const expiries = new Map();

  /* المفتاح اللي فات وقتو يتحسب غير موجود — التحقّق كسول، كيما Redis */
  const alive = (key) => {
    const at = expiries.get(key);
    if (at !== undefined && Date.now() >= at) {
      db.delete(key);
      hashes.delete(key);
      lists.delete(key);
      expiries.delete(key);
      return false;
    }
    return true;
  };

  function run(command) {
    const [name, ...args] = command;
    const op = String(name).toUpperCase();
    const key = args[0];

    if (op === 'SET') {
      alive(key);
      const rest = args.slice(2).map((a) => String(a).toUpperCase());
      if (rest.includes('NX') && db.has(key)) return null;
      db.set(key, args[1]);
      const exAt = rest.indexOf('EX');
      if (exAt >= 0) expiries.set(key, Date.now() + Number(args[2 + exAt + 1]) * 1000);
      else expiries.delete(key);
      return 'OK';
    }
    if (op === 'GET') return alive(key) && db.has(key) ? db.get(key) : null;
    if (op === 'DEL') { expiries.delete(key); hashes.delete(key); lists.delete(key); return db.delete(key) ? 1 : 0; }
    if (op === 'INCR') {
      alive(key);
      const next = (Number(db.get(key)) || 0) + 1;
      db.set(key, String(next));
      return next;
    }
    if (op === 'EXPIRE') { expiries.set(key, Date.now() + Number(args[1]) * 1000); return 1; }
    if (op === 'HINCRBY') {
      const hash = hashes.get(key) ?? new Map();
      const next = (Number(hash.get(args[1])) || 0) + Number(args[2]);
      hash.set(args[1], next);
      hashes.set(key, hash);
      return next;
    }
    if (op === 'HGET') return hashes.get(key)?.get(args[1]) ?? null;
    /* ⚠️ Upstash REST يرجّع HGETALL لائحة مسطّحة [حقل, قيمة, …] والعميل
       هو اللي يبنيها كائن. كائن من هنا يخلّي العميل يطيح في deserialize،
       والمفتاح اللي ما كاينش لازم يرجّع لائحة خاوية ماشي null. */
    if (op === 'HGETALL') {
      const hash = alive(key) ? hashes.get(key) : null;
      if (!hash) return [];
      return [...hash].flatMap(([field, value]) => [field, String(value)]);
    }
    if (op === 'HSET') {
      const hash = hashes.get(key) ?? new Map();
      const fields = args[1] && typeof args[1] === 'object' ? args[1] : {};
      for (const [field, value] of Object.entries(fields)) hash.set(field, value);
      hashes.set(key, hash);
      return 1;
    }
    if (op === 'HEXISTS') return hashes.get(key)?.has(args[1]) ? 1 : 0;
    if (op === 'LPUSH') {
      alive(key);
      const list = lists.get(key) ?? [];
      list.unshift(...args.slice(1).reverse());
      lists.set(key, list);
      return list.length;
    }
    if (op === 'LRANGE') {
      const list = alive(key) ? (lists.get(key) ?? []) : [];
      const start = Number(args[1]);
      const stop = Number(args[2]);
      /* Redis: -1 = آخر واحد، والمجال شامل */
      const from = start < 0 ? Math.max(list.length + start, 0) : start;
      const to = stop < 0 ? list.length + stop : Math.min(stop, list.length - 1);
      return from > to ? [] : list.slice(from, to + 1);
    }
    if (op === 'LTRIM') {
      const list = lists.get(key) ?? [];
      const start = Number(args[1]);
      const stop = Number(args[2]);
      const from = start < 0 ? Math.max(list.length + start, 0) : start;
      const to = stop < 0 ? list.length + stop : Math.min(stop, list.length - 1);
      lists.set(key, from > to ? [] : list.slice(from, to + 1));
      return 'OK';
    }
    if (op === 'LLEN') return (alive(key) ? (lists.get(key) ?? []) : []).length;
    if (op === 'SCAN') {
      const matchAt = args.findIndex((arg) => String(arg).toUpperCase() === 'MATCH');
      const prefix = (matchAt >= 0 ? String(args[matchAt + 1]) : '*').replace(/\*$/, '');
      const keys = new Set([...db.keys(), ...lists.keys(), ...hashes.keys()]);
      return ['0', [...keys].filter((k) => alive(k) && k.startsWith(prefix))];
    }
    throw new Error(`fake redis: unsupported command ${op}`);
  }

  /*
   * ⚠️ العميل يبعث `Upstash-Encoding: base64` ويفكّ كل نصّ في الجواب.
   * السيرفر المزيّف كان يرجّع نصّ خام: JSON يعدّي بالصدفة (atob يرمي
   * على الأقواس فالعميل يرجّع النصّ كيما هو)، بصح اسم حقل قصير كيما
   * `total` هو base64 صالح — فيتفكّ ويولّي بايتات خربة. النتيجة:
   * عدّادات بأسماء حقول مكسّرة، وسجلّ يقول صفر وهو مكتوب.
   *
   * نرمّزو كيما يدير Upstash الحقيقي، والفحص يمشي على نفس الطريق.
   */
  const encode = (value) => {
    if (typeof value === 'string') return Buffer.from(value, 'utf8').toString('base64');
    if (Array.isArray(value)) return value.map(encode);
    return value;
  };

  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const parsed = body ? JSON.parse(body) : [];
      const isPipeline = request.url.includes('pipeline') || Array.isArray(parsed[0]);
      const result = isPipeline
        ? parsed.map((command) => ({ result: encode(run(command)) }))
        : { result: encode(run(parsed)) };
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(result));
    });
  });

  return {
    async start() {
      await new Promise((resolve) => server.listen(0, resolve));
      process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${server.address().port}`;
      process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
      return this;
    },
    stop: () => server.close(),
    /* الفحص يقدر يشوف الخام كي يحتاج يتأكّد من شكل مفتاح */
    raw: () => db,
  };
}
