/* ==========================================================================
   Qiti admin — شاشة الدخول
   خطوتين: كلمة السر، ومن بعدها كود يوصل في تيليغرام. renderLogin
   مُصدّرة (ماشي مستعملة من route() — الجلسة تتفحّص في boot()، شوف app.js).
   ========================================================================== */
import { state } from '../state.js';
import { t } from '../i18n.js';
import { loginStep } from '../api.js';
import { boot } from '../app.js';

var root = document.getElementById('adminRoot');

export function renderLogin() {
  root.innerHTML =
    '<div class="login-screen"><div class="login-card">' +
      '<h1>' + t('login.heading') + '</h1>' +
      '<p class="sub">' + t('login.sub') + '</p>' +
      '<div class="err-msg" id="loginErr"></div>' +
      '<form id="loginForm">' +
        '<div class="field" id="pwField">' +
          '<label for="pw">' + t('login.password') + '</label>' +
          '<input type="password" id="pw" autocomplete="current-password" required>' +
        '</div>' +
        '<div class="field" id="codeField" hidden>' +
          '<label for="code">' + t('login.code') + '</label>' +
          '<input type="text" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6">' +
        '</div>' +
        '<button class="btn btn--primary" type="submit" id="loginBtn">' + t('login.next') + '</button>' +
      '</form>' +
    '</div></div>';

  var challengeId = null;
  var form = document.getElementById('loginForm');
  var err = document.getElementById('loginErr');
  var btn = document.getElementById('loginBtn');

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    err.textContent = '';
    btn.disabled = true;

    try {
      if (!challengeId) {
        var res = await loginStep({ step: 'password', password: document.getElementById('pw').value });
        challengeId = res.challengeId;
        document.getElementById('pwField').hidden = true;
        document.getElementById('codeField').hidden = false;
        document.getElementById('code').focus();
        btn.textContent = t('login.signIn');
      } else {
        await loginStep({ step: 'code', challengeId: challengeId, code: document.getElementById('code').value });
        state.authed = true;
        await boot();
        return;
      }
    } catch (error) {
      err.textContent = error.message;
      /* الكود الغالط يرجّعنا لكلمة السر — التحدّي يقدر يكون تحرق */
      if (challengeId) {
        challengeId = null;
        document.getElementById('pwField').hidden = false;
        document.getElementById('codeField').hidden = true;
        btn.textContent = t('login.next');
      }
    } finally {
      btn.disabled = false;
    }
  });
}
