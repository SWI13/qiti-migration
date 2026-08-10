/*
 * سكريبت تحقّق يدوي لـ lib/auth.mjs — يفحص الفنكشنز الصافية
 * (بلا Blobs) بتعديل process.env مباشرة بين كل حالة.
 */
import assert from 'node:assert/strict';

const AUTH_PATH = '../../lib/auth.mjs';

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
    pass++;
  } catch (err) {
    console.log(`FAIL  ${name}`);
    console.log(`      ${err.message}`);
    fail++;
  }
}

function fakeRequest(cookieHeader) {
  return {
    headers: {
      get(name) {
        if (name.toLowerCase() === 'cookie') return cookieHeader;
        return null;
      },
    },
  };
}

async function main() {
  // ── 1. cookie صحيحة تتحقّق ──────────────────────────────────────────
  process.env.ADMIN_PASSWORD_HASH = 'x'.repeat(64);
  process.env.ADMIN_SESSION_SECRET = 'super-secret-session-key-1';
  const auth1 = await import(`${AUTH_PATH}?t=1`);

  const setCookieHeader = auth1.sessionCookie(3600);
  console.log('\nSet-Cookie produced:', setCookieHeader);
  const cookieValue = setCookieHeader.split(';')[0].split('=').slice(1).join('=');

  check('كوكي صحيحة تتحقّق (requireAdmin → true)', () => {
    const req = fakeRequest(`qiti_admin=${cookieValue}`);
    assert.equal(auth1.requireAdmin(req), true);
  });

  check('verifyToken يرجّع payload صحيح لكوكي صحيحة', () => {
    const payload = auth1.verifyToken(cookieValue);
    assert.ok(payload);
    assert.equal(typeof payload.iat, 'number');
    assert.equal(typeof payload.exp, 'number');
  });

  // ── 2. clearCookie تنتج Max-Age=0 ───────────────────────────────────
  check('clearCookie تنتج Max-Age=0', () => {
    const cleared = auth1.clearCookie();
    assert.match(cleared, /Max-Age=0/);
    assert.match(cleared, /^qiti_admin=;/);
  });

  // ── 3. حمولة متلاعب فيها (tampered payload) ─────────────────────────
  check('payload متلاعب فيه يفشل', () => {
    const [payloadB64, sig] = cookieValue.split('.');
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const tamperedPayload = { ...decoded, exp: decoded.exp + 1000 * 60 * 60 * 24 * 365 }; // مدّد الصلاحية بلا حق
    const tamperedB64 = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url');
    const tamperedToken = `${tamperedB64}.${sig}`;
    const req = fakeRequest(`qiti_admin=${tamperedToken}`);
    assert.equal(auth1.requireAdmin(req), false);
  });

  // ── 4. توقيع متلاعب فيه (tampered signature) ────────────────────────
  check('توقيع متلاعب فيه يفشل', () => {
    const [payloadB64, sig] = cookieValue.split('.');
    const tamperedSig = sig.slice(0, -1) + (sig.at(-1) === 'A' ? 'B' : 'A');
    const tamperedToken = `${payloadB64}.${tamperedSig}`;
    const req = fakeRequest(`qiti_admin=${tamperedToken}`);
    assert.equal(auth1.requireAdmin(req), false);
  });

  // ── 5. كوكي منتهية الصلاحية ──────────────────────────────────────────
  check('كوكي منتهية الصلاحية تفشل', () => {
    const expiredToken = auth1.sessionCookie(-10); // Max-Age سالب = منتهية فوراً
    const expiredValue = expiredToken.split(';')[0].split('=').slice(1).join('=');
    const req = fakeRequest(`qiti_admin=${expiredValue}`);
    assert.equal(auth1.requireAdmin(req), false);
  });

  // ── 6. كوكي موقّعة بسرّ مختلف ────────────────────────────────────────
  check('كوكي موقّعة بسرّ مختلف تفشل', async () => {
    process.env.ADMIN_SESSION_SECRET = 'a-totally-different-secret-key';
    const authOtherSecret = await import(`${AUTH_PATH}?t=2`);
    const otherCookie = authOtherSecret.sessionCookie(3600);
    const otherValue = otherCookie.split(';')[0].split('=').slice(1).join('=');

    // نرجّعو للسرّ الأصلي ونتحقّقو بيه من كوكي مولّدة بسرّ آخر
    process.env.ADMIN_SESSION_SECRET = 'super-secret-session-key-1';
    const req = fakeRequest(`qiti_admin=${otherValue}`);
    assert.equal(auth1.requireAdmin(req), false);
  });

  // ── 7. env vars ناقصين → requireAdmin ديما false ────────────────────
  check('ADMIN_SESSION_SECRET ناقص → requireAdmin false (حتى بكوكي صحيحة)', () => {
    delete process.env.ADMIN_SESSION_SECRET;
    const req = fakeRequest(`qiti_admin=${cookieValue}`);
    assert.equal(auth1.requireAdmin(req), false);
    process.env.ADMIN_SESSION_SECRET = 'super-secret-session-key-1';
  });

  check('ADMIN_PASSWORD_HASH ناقص → requireAdmin false (حتى بكوكي صحيحة)', () => {
    delete process.env.ADMIN_PASSWORD_HASH;
    const req = fakeRequest(`qiti_admin=${cookieValue}`);
    assert.equal(auth1.requireAdmin(req), false);
    process.env.ADMIN_PASSWORD_HASH = 'x'.repeat(64);
  });

  check('لا env vars خالص → requireAdmin false', () => {
    delete process.env.ADMIN_SESSION_SECRET;
    delete process.env.ADMIN_PASSWORD_HASH;
    const req = fakeRequest(`qiti_admin=${cookieValue}`);
    assert.equal(auth1.requireAdmin(req), false);
    process.env.ADMIN_SESSION_SECRET = 'super-secret-session-key-1';
    process.env.ADMIN_PASSWORD_HASH = 'x'.repeat(64);
  });

  check('بلا كوكي أصلاً → requireAdmin false', () => {
    const req = fakeRequest(null);
    assert.equal(auth1.requireAdmin(req), false);
  });

  check('كوكي فارغة/مشوّهة → requireAdmin false', () => {
    const req = fakeRequest('qiti_admin=garbage-not-a-token');
    assert.equal(auth1.requireAdmin(req), false);
  });

  // ── إضافي: verifyPassword ───────────────────────────────────────────
  const nodeCrypto = await import('node:crypto');
  check('verifyPassword ينجح بكلمة سر صحيحة', () => {
    process.env.ADMIN_PASSWORD_HASH = nodeCrypto.createHash('sha256').update('كلمة-سر-تجريبية').digest('hex');
    assert.equal(auth1.verifyPassword('كلمة-سر-تجريبية'), true);
  });

  check('verifyPassword يفشل بكلمة سر غالطة', () => {
    assert.equal(auth1.verifyPassword('غالطة'), false);
  });

  check('verifyPassword يفشل بلا ADMIN_PASSWORD_HASH', () => {
    delete process.env.ADMIN_PASSWORD_HASH;
    assert.equal(auth1.verifyPassword('كلمة-سر-تجريبية'), false);
  });

  check('generateCode يرجّع 6 أرقام ديما', () => {
    for (let i = 0; i < 200; i++) {
      const code = auth1.generateCode();
      assert.equal(code.length, 6);
      assert.match(code, /^\d{6}$/);
    }
  });

  check('timingSafeStringEqual: متطابق true، مختلف false، أطوال مختلفة false', () => {
    assert.equal(auth1.timingSafeStringEqual('abc', 'abc'), true);
    assert.equal(auth1.timingSafeStringEqual('abc', 'abd'), false);
    assert.equal(auth1.timingSafeStringEqual('abc', 'abcd'), false);
    assert.equal(auth1.timingSafeStringEqual('', ''), true);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
