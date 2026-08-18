import { state } from '../state.js';
import { t } from '../i18n.js';
import { loginStep } from '../api.js';
import { boot } from '../app.js';
import { validate, showErrors, clearErrors } from '../ui/form.js';

var root = document.getElementById('adminRoot');

var PASSWORD_RULES = { password: { required: true } };
var CODE_RULES = { code: { required: true, pattern: /^\d{6}$/, message: t('login.errCode') } };

export function renderLogin() {
  root.innerHTML =
    '<div class="login-screen"><div class="login-card">' +
      '<h1>' + t('login.heading') + '</h1>' +
      '<p class="sub">' + t('login.sub') + '</p>' +
      '<div class="err-msg" id="loginErr" role="alert"></div>' +
      '<form id="loginForm" novalidate>' +
        '<div class="field" id="pwField">' +
          '<label for="pw">' + t('login.password') + '</label>' +
          '<input type="password" id="pw" data-path="password" autocomplete="current-password">' +
        '</div>' +
        '<div class="field" id="codeField" hidden>' +
          '<label for="code">' + t('login.code') + '</label>' +
          '<input type="text" id="code" data-path="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6">' +
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

    var step = challengeId ? 'code' : 'password';
    var values = {
      password: document.getElementById('pw').value,
      code: document.getElementById('code').value,
    };
    var check = validate(values, step === 'password' ? PASSWORD_RULES : CODE_RULES);
    clearErrors(form);
    if (!check.ok) { showErrors(form, check.errors); return; }

    btn.classList.add('is-busy');
    try {
      if (step === 'password') {
        var res = await loginStep({ step: 'password', password: values.password });
        challengeId = res.challengeId;
        document.getElementById('pwField').hidden = true;
        document.getElementById('codeField').hidden = false;
        document.getElementById('code').focus();
        btn.textContent = t('login.signIn');
      } else {
        await loginStep({ step: 'code', challengeId: challengeId, code: values.code });
        state.authed = true;
        await boot();
        return;
      }
    } catch (error) {
      err.textContent = error.message;
      if (challengeId) {
        challengeId = null;
        document.getElementById('pwField').hidden = false;
        document.getElementById('codeField').hidden = true;
        btn.textContent = t('login.next');
      }
    } finally {
      btn.classList.remove('is-busy');
    }
  });
}
