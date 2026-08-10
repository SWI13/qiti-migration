/* ==========================================================================
   Qiti admin — DOM helpers
   esc/getPath/setPath/delPath are pure and framework-free on purpose: the
   whole admin builds HTML by string concatenation, no template engine.
   toast() is kept here as a thin alias over ui/toast.js so the dozens of
   existing `toast(msg, isError)` call sites keep working unchanged.
   ========================================================================== */
import { showToast } from './ui/toast.js';

export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** يقرا قيمة من كائن بمسار "a.b.0.c" */
export function getPath(obj, path) {
  var parts = path.split('.');
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur == null) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

/** يكتب قيمة في كائن بمسار، ويصنع الحلقات الناقصة في الطريق */
export function setPath(obj, path, value) {
  var parts = path.split('.');
  var cur = obj;
  for (var i = 0; i < parts.length - 1; i++) {
    var key = parts[i];
    if (cur[key] == null) cur[key] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}

export function delPath(obj, path) {
  var parts = path.split('.');
  var last = parts.pop();
  var parent = parts.length ? getPath(obj, parts.join('.')) : obj;
  if (!parent) return;
  if (Array.isArray(parent)) parent.splice(Number(last), 1);
  else delete parent[last];
}

/* ── توست ───────────────────────────────────────────────────────────
   المنطق كامل ولّى في ui/toast.js (نغمات، عنوان، وقوف على الفأرة، زر
   تسكير). هذي تبقى هنا بنفس التوقيع القديم — عشرات المناداة في
   pages/*.js تكتب toast(msg, isError) وما ثمّاش سبب باش نبدّلوهم كامل.
   الكود الجديد يستعمل showToast() مباشرة كي يحتاج نغمة 'info' ولا عنوان. */
export function toast(message, isError) {
  return showToast({ message: message, variant: isError ? 'error' : 'success' });
}
