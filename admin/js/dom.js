import { showToast } from './ui/toast.js';

export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function getPath(obj, path) {
  var parts = path.split('.');
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur == null) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

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

export function toast(message, isError) {
  return showToast({ message: message, variant: isError ? 'error' : 'success' });
}
