/*
 * تسجيل الدخول للوحة التحكم — كلمة سر + عامل ثاني عبر تيليغرام. المنطق:
 *
 *   1. {step:'password', password} → إذا صحيحة، نولّدو كود 6 أرقام
 *      ونبعثوه في تيليغرام (TELEGRAM_CHAT_ID)، ونخزّنو تحدّي (challenge)
 *      في Blobs بصلاحية 5 دقايق. نرجّعو challengeId برك — الكود ما
 *      يتبعثش في الجواب، غير في تيليغرام.
 *   2. {step:'code', challengeId, code} → نتحقّقو من الكود (5 محاولات
 *      أقصى، من بعدها التحدّي يتحرق). إذا صحيح، كوكي الجلسة تتحطّ.
 *   3. {step:'logout'} → الكوكي تتمسح.
 *
 * ⚠️ رسالة الخطأ نفسها في كل حالات الفشل (كلمة سر غالطة، كود غالط، تحدّي
 * فات وقتو...) — ما نبيّنوش شكون بالضبط اللي غالط، باش مهاجم ما يقدرش
 * يعرف وين وصل (شوف auth.mjs لتفاصيل التوقيع والفشل المغلق).
 *
 * ── environment variables ────────────────────────────────────────────
 *   ADMIN_PASSWORD_HASH / ADMIN_SESSION_SECRET — شوف lib/auth.mjs
 *   TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID       — نفس بوت order.mjs،
 *                                                 هو اللي يبعثلك الكود
 */
import { getStore } from '../lib/blobs.mjs';
import { toVercel } from '../lib/http.mjs';
import {
  verifyPassword, generateCode, newChallengeId, timingSafeStringEqual,
  sessionCookie, clearCookie,
} from '../lib/auth.mjs';

const CHALLENGES = 'admin-login-challenges';
const challenges = () => getStore(CHALLENGES);

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const TELEGRAM_TIMEOUT_MS = 10_000;

/* رسالة عامة وحيدة لكل فشل — شوف الملاحظة فوق */
const GENERIC_ERROR = 'الدخول ماشي صحيح. عاود من البداية.';

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
});

/** يبعث الكود لصاحب المحل عبر نفس بوت الطلبات */
async function sendCode(code) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not configured');

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `🔐 كود الدخول للوحة التحكم: <b>${code}</b>\nصالح 5 دقايق. إذا ماشي انت اللي طلبتو، تجاهله.`,
      parse_mode: 'HTML',
    }),
    signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(`Telegram ${response.status}: ${result.description ?? 'unknown error'}`);
  }
}

async function handlePassword(payload) {
  const password = String(payload.password ?? '');

  if (!verifyPassword(password)) return json(401, { error: GENERIC_ERROR });

  const code = generateCode();
  const challengeId = newChallengeId();

  /*
   * نبعثو قبل ما نخزّنو: إذا تيليغرام طاح، ما نخلّيوش تحدّي معلّق حيّ
   * بلا ما الزبون (صاحب المحل) يقدر يشوف الكود تاعو أصلاً.
   */
  try {
    await sendCode(code);
  } catch (err) {
    console.error('Admin login: failed to send Telegram code:', err.message);
    return json(502, { error: 'ما قدرناش نبعثو الكود دروك. عاود حاول.' });
  }

  /* ttlSeconds يخلّي المخزن يمسحو وحدو كي يفوت وقتو. expiresAt يبقى
     مكتوب ومتفحّص تحت: التحقّق في الكود هو الحارس الحقيقي، والـ TTL
     غير باش التحدّيات الميتة ما تتكدّسش للأبد. */
  /* الكتابة كانت بلا حماية: عطب في التخزين كان يطلع "server error"
     عام من الجسر، والمستخدم ما يعرفش واش صرا ولا وين يشوف. */
  try {
    await challenges().setJSON(challengeId, {
      code,
      attempts: 0,
      expiresAt: Date.now() + CODE_TTL_MS,
    }, { ttlSeconds: Math.ceil(CODE_TTL_MS / 1000) });
  } catch (err) {
    console.error('Admin login: failed to store challenge:', err.message);
    return json(503, { error: 'التخزين ماشي متوفّر دروك. عاود حاول.' });
  }

  return json(200, { challengeId });
}

async function handleCode(payload) {
  const challengeId = String(payload.challengeId ?? '');
  const code = String(payload.code ?? '');
  if (!challengeId || !code) return json(401, { error: GENERIC_ERROR });

  const challenge = await challenges().get(challengeId, { type: 'json' });
  if (!challenge || Date.now() >= challenge.expiresAt) {
    /* منتهي ولا ماكانش أصلاً — نتأكّدو ما بقاش، بلا خطأ إذا ماكانش */
    await challenges().delete(challengeId).catch(() => {});
    return json(401, { error: GENERIC_ERROR });
  }

  if (!timingSafeStringEqual(code, challenge.code)) {
    const attempts = challenge.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      /* 5 محاولات غالطة تكفي — التحدّي يتحرق، يخصّو يبدا من كلمة السر */
      await challenges().delete(challengeId);
    } else {
      /* ⚠️ الكتابة بلا ttlSeconds تمسح وقت الانتهاء اللي حطّيناه في
         handlePassword — التحدّي يقعد للأبد. نعاودو نحسبو الباقي من
         expiresAt بدل ما نجدّدو الخمس دقايق: محاولة غالطة ما تستاهلش
         تمدّد عمر التحدّي. */
      const remaining = Math.max(1, Math.ceil((challenge.expiresAt - Date.now()) / 1000));
      await challenges().setJSON(challengeId, { ...challenge, attempts }, { ttlSeconds: remaining });
    }
    return json(401, { error: GENERIC_ERROR });
  }

  /* صحيح — نحرقو التحدّي فوراً (one-time)، وما يتعاودش استعمالو */
  await challenges().delete(challengeId);

  return json(200, { ok: true }, { 'set-cookie': sessionCookie() });
}

function handleLogout() {
  return json(200, { ok: true }, { 'set-cookie': clearCookie() });
}

async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'طلب ماشي صحيح.' });
  }

  if (payload?.step === 'password') return handlePassword(payload);
  if (payload?.step === 'code') return handleCode(payload);
  if (payload?.step === 'logout') return handleLogout();

  return json(400, { error: 'خطوة ماشي معروفة.' });
}

/* توقيع Vercel هو (req,res) — الجسر في lib/http.mjs */
export default toVercel(handler);
