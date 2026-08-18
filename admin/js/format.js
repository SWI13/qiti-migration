
export function fmtMoney(n) {
  return Number(n || 0).toLocaleString('en-US') + ' DZD';
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  var date = new Date(iso);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDay(day) {
  if (!day) return '—';
  var date = new Date(day + 'T00:00:00');
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fmtPct(n) {
  return (Number(n || 0) * 100).toFixed(1) + '%';
}
