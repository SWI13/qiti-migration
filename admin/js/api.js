import { state } from './state.js';
import { t } from './i18n.js';
import { renderLogin } from './pages/login.js';

export async function api(action, payload) {
  var response = await fetch('/api/admin-api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.assign({ action: action }, payload || {})),
  });

  var data = await response.json().catch(function () { return {}; });

  if (response.status === 401) {
    state.authed = false;
    renderLogin();
    var expired = new Error(t('login.sessionExpired'));
    expired.unauthorized = true;
    throw expired;
  }
  if (!response.ok) throw new Error(data.error || t('common.error'));
  return data;
}

export async function loginStep(payload) {
  var response = await fetch('/api/admin-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  var data = await response.json().catch(function () { return {}; });
  if (!response.ok) throw new Error(data.error || t('common.error'));
  return data;
}
