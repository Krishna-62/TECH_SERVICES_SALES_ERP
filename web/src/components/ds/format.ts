export const inr = (v: number) => '₹' + Math.round(v || 0).toLocaleString('en-IN');
export const lakh = (v: number) => {
  if (!v) return '₹0';
  const l = v / 1e5;
  return '₹' + (l >= 100 ? (l / 100).toFixed(2) + ' Cr' : (l >= 10 ? l.toFixed(1) : l.toFixed(2)).replace(/\.0+$/, '') + 'L');
};
export const lakhShort = (v: number) =>
  v < 1e3 ? '₹' + Math.round(v) : v >= 1e7 ? '₹' + (v / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr' : v >= 1e5 ? '₹' + (v / 1e5).toFixed(1).replace(/\.0$/, '') + 'L' : '₹' + Math.round(v / 1e3) + 'K';
export function niceStep(v: number) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}
export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** "2026-10-21" -> "Oct 21, 2026" (short: "Oct 21"). Anything unparseable is returned as is. */
export function fmtDay(d?: string | null, short = false) {
  if (!d) return '—';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(d);
  const dt = new Date(+m[1], +m[2] - 1, +m[3]);
  return dt.toLocaleDateString('en-US', short ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}
