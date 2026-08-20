/*
 * المصادقة على لوحة التحكم — كلمة سر + عامل ثاني عبر تيليغرام (بلا خدمة
 * OTP خارجية: عندك قناة موثوقة أصلاً وهي البوت اللي يبعثلك الطلبات)،
 * ومن بعد كوكي جلسة موقّعة (HMAC) بدل ما نخزّنو الجلسة في السيرفر.
 *
 * هذا الملف يدير الكوكي (توقيع/تحقّق) والمقارنات الحسّاسة. منطق الخطوتين
 * (كلمة السر، الكود) ومخزون Blobs تاع التحدّي راهم في functions/admin-login.mjs
 * على خاطر هذا الملف يبقى بلا Blobs — يقدر يتفحّص بسكريبت عادي.
 *
 * ⚠️ فشل مغلق (fail closed): بلا ADMIN_PASSWORD_HASH و ADMIN_SESSION_SECRET
 * مرتاحين في البيئة، requireAdmin ترجع false ديما. لوحة التحكم تبقى
 * مقفلة بدل ما تولّي مفتوحة للعالم كامل بسبب نسيان إعداد.
 *
 * ── environment variables ────────────────────────────────────────────
 *   ADMIN_PASSWORD_HASH   — sha256 hex لكلمة السر، يتولّد بـ:
 *                           node -e "console.log(require('crypto').createHash('sha256').update('كلمتك').digest('hex'))"
 *   ADMIN_SESSION_SECRET  — نص عشوائي طويل (32 بايت أو أكثر)، يوقّع بيه
 *                           كوكي الجلسة. تبدّلو = كل الجلسات الحيّة تنقطع.
 */
import { createHmac, createHash, timingSafeEqual, randomBytes, randomInt } from 'node:crypto';

export const COOKIE_NAME = 'qiti_admin';
export const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60; /* 7 أيام */

export const unauthorized = () => new Response(JSON.stringify({ error: 'ما عندكش صلاحية. دخل من جديد.' }), {
  status: 401,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

/*
 * مقارنة بلا تسريب توقيت (timing attack): مقارنة عادية (===) توقف عند
 * أوّل حرف مختلف، فوقت الجواب يبيّن قداش من حرف كان صحيح. timingSafeEqual
 * يقارن كل البايتات ديما — بصح يرمي خطأ إذا الطول مختلف، فنتحقّقو قبل.
 */
export function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const sha256Hex = (input) => createHash('sha256').update(String(input), 'utf8').digest('hex');

/** يقارن كلمة السر بالهاش المخزّن في ADMIN_PASSWORD_HASH. fail closed بلا هاش. */
export function verifyPassword(password) {
  const expected = process.env.ADMIN_PASSWORD_HASH;
  if (!expected) return false;
  return timingSafeStringEqual(sha256Hex(password), expected);
}

/** كود من 6 أرقام — randomInt (CSPRNG) ماشي Math.random، باش ما يتخمّنش */
export function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** معرّف التحدّي — عشوائي حقيقي (128 بيت)، يخدم كمفتاح في Blobs */
export const newChallengeId = () => randomBytes(16).toString('hex');

/* ── توقيع وتحقّق كوكي الجلسة ─────────────────────────────────────────
 *
 * الشكل: base64url(JSON) + '.' + HMAC-SHA256(نفس النص). ما فيه تشفير —
 * الحمولة تبيّن (وقت الإصدار والانتهاء برك، ما فيها سرّ)، والتوقيع هو
 * اللي يمنع أي تلاعب فيها من برّا.
 */
function sign(payloadB64) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

function buildToken(payload) {
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

/**
 * يتحقّق من قيمة الكوكي ويرجع الحمولة `{iat, exp}` إذا صحيحة وما زالت
 * صالحة، وإلا null. fail closed: بلا ADMIN_SESSION_SECRET، ديما null.
 */
export function verifyToken(token) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || typeof token !== 'string' || !token) return null;

  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  if (!timingSafeStringEqual(sig, sign(payloadB64))) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null; /* JSON مكسور — تلاعب ولا فساد، بالكيف نرفضو */
  }

  if (!payload || typeof payload.exp !== 'number' || Date.now() >= payload.exp) return null;
  return payload;
}

/** يقرا كوكي معيّن من header الطلب — Netlify Functions ما يحلّوهش وحدهم */
function readCookie(request, name) {
  const header = request?.headers?.get?.('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/** واش الطلب جاي من إدمين مسجّل دخوله؟ fail closed بلا الـ env vars. */
export function requireAdmin(request) {
  if (!process.env.ADMIN_PASSWORD_HASH || !process.env.ADMIN_SESSION_SECRET) return false;
  return verifyToken(readCookie(request, COOKIE_NAME)) !== null;
}

/**
 * حمولة الجلسة إذا كانت صالحة — `{ iat, exp }` ولا null.
 *
 * ⚠️ يخدم لسجلّ التدقيق: `iat` هو الوقت اللي تسجّل فيه الدخول، فكل
 * أفعال نفس الجلسة ياخذو نفس المعرّف (`sessionId`) ويتجمعو مع بعضهم.
 * ما فيه حتى سرّ — التوقيع يبقى برّا، وهاذي غير الحمولة المفتوحة.
 */
export function adminSession(request) {
  if (!process.env.ADMIN_PASSWORD_HASH || !process.env.ADMIN_SESSION_SECRET) return null;
  const payload = verifyToken(readCookie(request, COOKIE_NAME));
  if (!payload) return null;
  return { ...payload, sessionId: `s-${Number(payload.iat || 0).toString(36)}` };
}

const cookieAttrs = (maxAgeSeconds) => `Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;

/** Set-Cookie لجلسة جديدة (بعد نجاح الخطوتين) — الحمولة فيها وقت الإصدار والانتهاء */
export function sessionCookie(maxAgeSeconds = SESSION_LIFETIME_SECONDS) {
  const now = Date.now();
  const token = buildToken({ iat: now, exp: now + maxAgeSeconds * 1000 });
  return `${COOKIE_NAME}=${token}; ${cookieAttrs(maxAgeSeconds)}`;
}

/** Set-Cookie يمسح الجلسة (تسجيل الخروج) — Max-Age=0 يخلّي المتصفّح يرميها */
export function clearCookie() {
  return `${COOKIE_NAME}=; ${cookieAttrs(0)}`;
}
