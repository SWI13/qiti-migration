/* ==========================================================================
   Qiti admin — DOM helpers
   esc/getPath/setPath/delPath are pure and framework-free on purpose: the
   whole admin builds HTML by string concatenation, no template engine.
   toast() is the one stateful thing here — a small stacking notification
   queue (see .toast-stack in css/components.css).
   ========================================================================== */

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

/* ── توست مكدّس ─────────────────────────────────────────────────────
   عدّة توست يقدرو يبانو في نفس الوقت (مثلاً رفع بزوج صور)، كل وحدة
   تختفي وحدها بعد وقتها — بلا ما توقف ولا تعاود توست قبلها. */
var TOAST_MS = 3200;

function toastStack() {
  var node = document.querySelector('.toast-stack');
  if (!node) {
    node = document.createElement('div');
    node.className = 'toast-stack';
    document.body.appendChild(node);
  }
  return node;
}

/** نفس التوقيع القديم: toast(message, isError) — الفرق كامل داخلي. */
export function toast(message, isError) {
  var stack = toastStack();
  var node = document.createElement('div');
  node.className = 'toast toast--' + (isError ? 'error' : 'success');
  node.textContent = message;
  stack.appendChild(node);

  /* frame واحد قبل ما نزيدو is-visible باش الـ transition يخدم */
  requestAnimationFrame(function () {
    node.classList.add('is-visible');
  });

  setTimeout(function () {
    node.classList.remove('is-visible');
    setTimeout(function () { node.remove(); }, 220);
  }, TOAST_MS);
}
