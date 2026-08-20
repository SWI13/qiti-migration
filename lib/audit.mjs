/*
 * سجلّ التدقيق — واش صرا، شكون دارو، ومنين.
 *
 * ── علاش هاذ الملف موجود ──────────────────────────────────────────
 * كل حاجة تصرا في هاذ المحل كانت تعيش في بلاصة وحدة: الطلب روحو.
 * الحالة الحالية مكتوبة عليه، والقرار الأخير معاه — بصح **الطريق**
 * اللي وصلو للحالة هذي ما كانش مخزّن في حتى بلاصة. كي المشغّل يسأل
 * "شكون رفض هاذ الطلب؟" ولا "علاش الطردة ما خرجتش؟" ولا "واش تبدّل
 * في السومة البارح؟"، الجواب الوحيد كان `console.log` تاع Vercel
 * اللي يعيش ساعة ومن بعد يطير.
 *
 * هنا سجلّ مكتوب مرّة وما يتبدّلش (append-only): كل حدث سطر واحد فيه
 * الوقت، الفاعل، المصدر، الفعل، الكيان اللي تمسّ، القيمة القديمة
 * والجديدة، والنتيجة.
 *
 * ── قواعد ما تتكسرش ───────────────────────────────────────────────
 *
 * 1. **التسجيل عمرو ما يطيّح الشغل.** `logEvent` تبلع كل خطأ فيها.
 *    طلب يتقبل والسجلّ يطيح خير من طلب ما يتقبلش على خاطر السجلّ
 *    طاح. القاعدة هذي هي اللي تخلّي التسجيل يتزاد في الطريق الحرج
 *    بلا خوف.
 *
 * 2. **الأسرار ما تدخلش.** `redact()` تمشي على كل قيمة داخلة وتقصّ
 *    أي حقل اسمو يشبه لكلمة سر / توكن / كوكي. حتى لو واحد مرّر
 *    الجسم كامل تاع الطلب.
 *
 * 3. **الكتابة ذرّية بقدر ما يقدر Redis.** LPUSH + LTRIM في رحلة
 *    وحدة، والعدّادات HINCRBY في السيرفر — زوج أحداث في نفس اللحظة
 *    ما ياكلوش بعضهم.
 *
 * 4. **نفس الحدث ما يتكتبش مرّتين.** `dedupeKey` يمرّ على SET NX
 *    بمهلة — تيليغرام يعاود يبعث نفس الـ update كي الجواب يتأخّر،
 *    والويبهوك اللي يتعاود ما يزيدش سطر ثاني.
 *
 * ── التخزين ────────────────────────────────────────────────────────
 *   audit / stream           — قائمة الأحداث كاملة (الأحدث أوّل)
 *   audit / order:<id>       — نفس الأحداث تاع طلب واحد (الخطّ الزمني)
 *   audit / log:<id>         — الحدث وحدو بمفتاحو (فتح التفاصيل)
 *   audit / counts:<YYYY-MM-DD> — عدّادات اليوم (hash، HINCRBY)
 *   audit / seen:<key>       — مفاتيح منع التكرار (TTL)
 */
import { randomUUID } from 'node:crypto';
import { getStore } from './blobs.mjs';
import { algiersDate } from './store.mjs';

const STORE = 'audit';
const store = () => getStore(STORE);

/*
 * حدود الاحتفاظ.
 *
 * ⚠️ سجلّ بلا حدّ يكبر حتى يولّي هو روحو المشكل: القراية تبطّي،
 * والتخزين يعمر. 20,000 حدث ≈ عدّة أشهر على محل بمئات الطلبات في
 * الشهر، والذيل يطيح وحدو مع كل كتابة (LTRIM) بلا مهمّة تنظيف.
 */
export const STREAM_CAP = 10_000;
export const ORDER_CAP = 300;
/** الحدث بمفتاحو يعيش 180 يوم — القائمة تبقى المرجع، وهذا للفتح المباشر */
const EVENT_TTL_SECONDS = 180 * 24 * 60 * 60;
const DEDUPE_TTL_SECONDS = 24 * 60 * 60;

/** أكبر نافذة نقراوها من القائمة في استعلام واحد */
export const SCAN_WINDOW = 2_000;

/* ── الأسرار ما تتخزّنش ──────────────────────────────────────────── */

/*
 * ⚠️ القائمة سوداء بقصد، وواسعة بقصد. المدخلات هنا تجي من أجسام
 * طلبات كاملة (اللوحة تبعث `body` كيما هو)، فأي حقل جديد فيه سرّ
 * لازم يتقصّ بلا ما يتزاد لهنا بيدك.
 */
const SECRET_KEY = /pass|secret|token|hash|auth|cookie|credential|apikey|api_key|otp|challenge|signature|session/i;
export const REDACTED = '[محجوب]';

/** أطول نص نخزّنوه في قيمة وحدة — قيمة أطول تتقصّ */
const MAX_VALUE = 400;
const MAX_DEPTH = 4;

/*
 * ⚠️ الحجب بالاسم ما يكفيش وحدو: رسالة خطأ جايّة من خدمة برّانية
 * تقدر تحمل التوكن في وسطها (رابط فيه api_token، ولا "Unauthorized:
 * bot<token>"). هنا نمسحو القيم الحقيقية تاع البيئة من أي نصّ داخل،
 * مهما كان اسم الحقل. القيمة القصيرة (أقلّ من 8) ما تتمسحش — تصادف
 * حروف عادية وتخرّب النصّ بلا فايدة.
 */
const SECRET_ENV = [
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'ADMIN_SESSION_SECRET',
  'ADMIN_PASSWORD_HASH', 'ECOTRACK_TOKEN', 'META_ACCESS_TOKEN',
  'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN', 'BLOB_READ_WRITE_TOKEN',
];

function scrubSecrets(text) {
  let out = text;
  for (const name of SECRET_ENV) {
    const value = process.env[name];
    if (value && value.length >= 8 && out.includes(value)) out = out.split(value).join(REDACTED);
  }
  return out;
}

const clip = (text) => {
  const str = scrubSecrets(String(text));
  return str.length > MAX_VALUE ? `${str.slice(0, MAX_VALUE)}…` : str;
};

/**
 * ينظّف قيمة قبل ما تتخزّن: يقصّ الأسرار، يقصّر النصوص الطويلة،
 * ويوقف على عمق معقول باش كائن كبير ما يعمّرش السجلّ.
 */
export function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return clip(value);
  if (depth >= MAX_DEPTH) return '[…]';

  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));

  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? REDACTED : redact(item, depth + 1);
    }
    return out;
  }

  return clip(value);
}

/**
 * رقم الهاتف كي يبان في اللائحة: `0661***566`.
 *
 * ⚠️ التخزين يبقى كامل — الرقم هو نفسو اللي يبان في صفحة الطلبات،
 * وزوجهم وراء نفس القفل. القصّ هنا للعرض السريع برك، باش شاشة
 * مفتوحة قدّام واحد آخر ما تفرّجش أرقام الزبائن كاملة.
 */
export function maskPhone(phone) {
  const str = String(phone ?? '').trim();
  if (str.length < 7) return str;
  return `${str.slice(0, 4)}***${str.slice(-3)}`;
}

/* ── الفرق بين قبل وبعد ──────────────────────────────────────────── */

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * الحقول اللي تبدّلو برك — ماشي الكائن كامل.
 *
 * ⚠️ علاش الفرق وماشي اللقطتين كاملين: لقطة طلب فيها 30 حقل، و29
 * منهم ما تبدّلوش. المشغّل اللي يفتح الحدث يحب يشوف "الحالة: مقبول
 * ← ملغى"، ماشي يقلّب على السطر اللي تبدّل وسط 30 سطر.
 */
export function diff(before, after) {
  const from = before && typeof before === 'object' ? before : {};
  const to = after && typeof after === 'object' ? after : {};
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]);

  const oldValues = {};
  const newValues = {};
  for (const key of keys) {
    if (same(from[key], to[key])) continue;
    if (from[key] !== undefined) oldValues[key] = redact(from[key]);
    if (to[key] !== undefined) newValues[key] = redact(to[key]);
  }

  return { oldValues, newValues, changed: Object.keys(newValues).length + Object.keys(oldValues).length > 0 };
}

/* ── الكتابة ──────────────────────────────────────────────────────── */

const newId = () => `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

/** معرّف يتبع نفس العملية عبر الأنظمة (اللوحة ← الفنكشن ← تيليغرام) */
export const newRequestId = () => randomUUID().slice(0, 12);

const COUNTER_FIELD = {
  admin: 'admin',
  telegram: 'telegram',
  system: 'system',
  storefront: 'storefront',
  cron: 'cron',
};

const clean = (value) => (value === undefined || value === '' ? null : value);

/**
 * يكتب حدث في السجلّ.
 *
 * ما ترميش عمرها، وما ترجّعش وعد لازم تستنّاه: اللي ينادي يقدر
 * يعملها `await` كي يحب يتأكّد (الفحوصات)، ولا يخلّيها تمشي كي
 * يكون في طريق حرج.
 *
 * @returns {Promise<object|null>} الحدث كيما تخزّن، ولا null إذا
 *          تقفز (تكرار) ولا طاح.
 */
export async function logEvent(input = {}) {
  try {
    const at = new Date();
    const source = input.source ?? 'system';

    const event = {
      id: newId(),
      at: at.toISOString(),
      day: algiersDate(at),
      action: String(input.action ?? 'unknown'),
      source,
      status: input.status === 'failed' ? 'failed' : 'success',

      actorId: clean(input.actorId),
      actorName: clean(input.actorName),
      actorType: clean(input.actorType ?? (source === 'admin' ? 'admin' : source)),

      entityType: clean(input.entityType),
      entityId: clean(input.entityId != null ? String(input.entityId) : null),
      orderId: clean(input.orderId),
      productId: clean(input.productId),
      customerPhone: clean(input.customerPhone),

      description: clean(input.description ? clip(input.description) : null),
      oldValues: input.oldValues && Object.keys(input.oldValues).length ? redact(input.oldValues) : null,
      newValues: input.newValues && Object.keys(input.newValues).length ? redact(input.newValues) : null,
      metadata: input.metadata && Object.keys(input.metadata).length ? redact(input.metadata) : null,
      error: clean(input.error ? clip(input.error) : null),

      requestId: clean(input.requestId),
      ip: clean(input.ip),
      userAgent: clean(input.userAgent ? clip(String(input.userAgent).slice(0, 160)) : null),

      telegramChatId: clean(input.telegramChatId != null ? String(input.telegramChatId) : null),
      telegramMessageId: clean(input.telegramMessageId != null ? String(input.telegramMessageId) : null),
      telegramUpdateId: clean(input.telegramUpdateId != null ? String(input.telegramUpdateId) : null),
    };

    /*
     * منع التكرار: أوّل واحد ياخذ المفتاح يكتب، والثاني (نفس الويبهوك
     * يتعاود، ولا نقرتين في نفس اللحظة) يخرج بلا ما يزيد سطر.
     */
    if (input.dedupeKey) {
      const { modified } = await store().setJSON(`seen:${input.dedupeKey}`, { id: event.id },
        { onlyIfNew: true, ttlSeconds: DEDUPE_TTL_SECONDS });
      if (!modified) return null;
    }

    await store().pushCapped('stream', event, STREAM_CAP);
    if (event.orderId) {
      await store().pushCapped(`order:${event.orderId}`, event, ORDER_CAP)
        .catch((error) => console.error('Audit order index failed:', error.message));
    }
    await store().setJSON(`log:${event.id}`, event, { ttlSeconds: EVENT_TTL_SECONDS })
      .catch((error) => console.error('Audit key write failed:', error.message));

    const fields = { total: 1 };
    if (event.status === 'failed') fields.failed = 1;
    const sourceField = COUNTER_FIELD[event.source];
    if (sourceField) fields[sourceField] = 1;
    await store().hincr(`counts:${event.day}`, fields)
      .catch((error) => console.error('Audit counters failed:', error.message));

    return event;
  } catch (error) {
    /* ⚠️ القاعدة الأولى: السجلّ عمرو ما يطيّح الشغل اللي راه يسجّلو */
    console.error('Audit write failed:', error.message, '| action:', input?.action);
    return null;
  }
}

/* ── القراية ──────────────────────────────────────────────────────── */

const inRange = (event, from, to) => {
  if (from && event.at < from) return false;
  if (to && event.at > to) return false;
  return true;
};

const matchText = (event, needle) => {
  if (!needle) return true;
  const q = needle.toLowerCase();
  return [
    event.orderId, event.entityId, event.productId, event.customerPhone,
    event.actorName, event.actorId, event.action, event.description,
    event.error, event.requestId, event.telegramMessageId, event.telegramChatId,
  ].some((field) => field && String(field).toLowerCase().includes(q));
};

/**
 * استعلام السجلّ. كل الفلاتر تتجمع مع بعضها (AND).
 *
 * ⚠️ الفلترة تصرا في الذاكرة على نافذة محدودة (`SCAN_WINDOW`) وماشي
 * في Redis. علاش: Redis هنا مخزن مفاتيح، ما فيهش فهرس ثانوي — بناء
 * فهرس لكل حقل (فعل، مصدر، فاعل، طلب...) معناه ستّ قوائم تتكتب مع
 * كل حدث، وكل وحدة تقدر تنحرف عن الأصل. النافذة تقرا مرّة وحدة
 * وتفلتر في الذاكرة: أبسط، وما يقدرش ينحرف. الطلب على طلب معيّن
 * يقرا من `order:<id>` مباشرةً، فما يدخلش هاذ الطريق أصلاً.
 */
const FILTER_KEYS = ['q', 'source', 'status', 'action', 'actor', 'entityType', 'productId', 'customerPhone', 'from', 'to'];

export async function listEvents(filters = {}) {
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
  const page = Math.max(Number(filters.page) || 1, 1);

  const window = Math.min(Number(filters.window) || SCAN_WINDOW, SCAN_WINDOW);
  const key = filters.orderId ? `order:${filters.orderId}` : 'stream';
  const filtered = FILTER_KEYS.some((name) => filters[name]);

  /*
   * ── الطريق السريع ────────────────────────────────────────────────
   *
   * ⚠️ بلا فلاتر (أوّل ما تحلّ الصفحة، وكل تقليب صفحات) ما نقراوش
   * النافذة كاملة: LRANGE على الصفحة روحها + LLEN للمجموع. الفرق
   * ماشي صغير — نافذة 4000 حدث ≈ ميغابايتين على شبكة يتنقلو باش
   * نعرضو 25 سطر.
   */
  if (!filtered) {
    const start = (page - 1) * limit;
    const [rows, count] = await Promise.all([
      store().range(key, start, start + limit - 1).catch(() => []),
      store().length(key).catch(() => 0),
    ]);
    /* عيّنة صغيرة برك باش نعمّرو قوائم الفلاتر بلا ما نقراو كلشي */
    const sample = start === 0 ? rows : await store().range(key, 0, 199).catch(() => []);

    const pages = Math.max(1, Math.ceil(count / limit));
    return {
      rows,
      total: count,
      page: Math.min(page, pages),
      pages,
      limit,
      truncated: false,
      actions: [...new Set(sample.map((event) => event.action))].sort(),
      actors: [...new Set(sample.map((event) => event.actorName).filter(Boolean))].sort(),
    };
  }

  const all = await store().range(key, 0, window - 1).catch((error) => {
    console.error('Audit read failed:', error.message);
    return [];
  });

  const matched = all.filter((event) => {
    if (filters.source && event.source !== filters.source) return false;
    if (filters.status && event.status !== filters.status) return false;
    if (filters.action && event.action !== filters.action) return false;
    if (filters.actor && event.actorName !== filters.actor) return false;
    if (filters.entityType && event.entityType !== filters.entityType) return false;
    if (filters.orderId && event.orderId !== filters.orderId) return false;
    if (filters.productId && event.productId !== filters.productId) return false;
    if (filters.customerPhone && event.customerPhone !== filters.customerPhone) return false;
    if (!inRange(event, filters.from, filters.to)) return false;
    return matchText(event, filters.q);
  });

  const total = matched.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = (Math.min(page, pages) - 1) * limit;

  return {
    rows: matched.slice(start, start + limit),
    total,
    page: Math.min(page, pages),
    pages,
    limit,
    /* واش النافذة تعمّرت — يعني كاين أقدم منها ما دخلش في الحساب */
    truncated: all.length >= window,
    /* الأفعال والفاعلين الموجودين فعلاً — اللوحة تعمّر بيهم الفلاتر */
    actions: [...new Set(all.map((event) => event.action))].sort(),
    actors: [...new Set(all.map((event) => event.actorName).filter(Boolean))].sort(),
  };
}

/** الخطّ الزمني تاع طلب واحد — من الأقدم للأحدث، كيما صرا */
export async function eventsForOrder(orderId, { limit = ORDER_CAP } = {}) {
  if (!orderId) return [];
  const rows = await store().range(`order:${orderId}`, 0, limit - 1).catch((error) => {
    console.error('Audit order read failed:', error.message);
    return [];
  });
  return rows.slice().reverse();
}

/** حدث واحد بمفتاحو */
export async function getEvent(id) {
  if (!id) return null;
  return store().get(`log:${id}`, { type: 'json' }).catch(() => null);
}

const numbers = (hash) => {
  const out = { total: 0, failed: 0, admin: 0, telegram: 0, system: 0, storefront: 0, cron: 0 };
  for (const [key, value] of Object.entries(hash ?? {})) out[key] = Number(value) || 0;
  return out;
};

/**
 * أرقام فوق الصفحة: نهار اليوم، ونهار البارح للمقارنة، وآخر الأحداث
 * اللي طاحت (هاذوك اللي يستاهلو نظرة قبل أي حاجة أخرى).
 */
export async function auditSummary({ now = new Date(), criticalLimit = 5 } = {}) {
  const today = algiersDate(now);
  const yesterday = algiersDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  const [todayCounts, yesterdayCounts, recent] = await Promise.all([
    store().hgetall(`counts:${today}`).catch(() => ({})),
    store().hgetall(`counts:${yesterday}`).catch(() => ({})),
    store().range('stream', 0, 299).catch(() => []),
  ]);

  const failures = recent.filter((event) => event.status === 'failed').slice(0, criticalLimit);

  return {
    day: today,
    today: numbers(todayCounts),
    yesterday: numbers(yesterdayCounts),
    critical: failures,
    lastEventAt: recent[0]?.at ?? null,
  };
}
