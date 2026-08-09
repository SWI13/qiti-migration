/* ==========================================================================
   Qiti admin — الاتصال بالخادم
   كل الأكشنات تمرّ من هنا. 401 يعني الجلسة طاحت — نرجّعو لشاشة الدخول
   بدل ما نبيّنو خطأ غامض على كل زر يضغطو المستخدم من بعد.

   ملاحظة على الاستيراد الدائري: api.js يستدعي renderLogin من
   pages/login.js عند 401، وpages/login.js يستدعي loginStep من هنا.
   ES modules تدعم هذا بروابط حيّة طالما الاستعمال داخل دالة (وقت
   التشغيل) ماشي في أعلى الملف (وقت التحميل) — وهو الحال هنا.
   ========================================================================== */
import { state } from './state.js';
import { t } from './i18n.js';
import { renderLogin } from './pages/login.js';

export async function api(action, payload) {
  var response = await fetch('/.netlify/functions/admin-api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.assign({ action: action }, payload || {})),
  });

  var data = await response.json().catch(function () { return {}; });

  if (response.status === 401) {
    state.authed = false;
    renderLogin();
    throw new Error(t('login.sessionExpired'));
  }
  if (!response.ok) throw new Error(data.error || t('common.error'));
  return data;
}

export async function loginStep(payload) {
  var response = await fetch('/.netlify/functions/admin-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  var data = await response.json().catch(function () { return {}; });
  if (!response.ok) throw new Error(data.error || t('common.error'));
  return data;
}
