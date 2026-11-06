import { useId } from 'react';
import { reducedMotion } from './format';

function smooth(p: [number, number][], maxY = Infinity) {
  if (!p.length) return '';
  const cy = (v: number) => Math.min(maxY, v);
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    d += ` C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)},${cy(b[1] + (c[1] - a[1]) / 6).toFixed(1)} ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)},${cy(c[1] - (e[1] - b[1]) / 6).toFixed(1)} ${c[0].toFixed(1)},${c[1].toFixed(1)}`;
  }
  return d;
}

/** Sparkline drawn left to right with a clip reveal. */
export function Spark({ values, small }: { values: number[]; small?: boolean }) {
  const id = 'sp' + useId().replace(/:/g, '');
  const W = 200, H = 40, vs = values.length > 1 ? values : [0, 0];
  const mn = Math.min(...vs), mx = Math.max(...vs);
  const pts = vs.map((v, i) => [i / (vs.length - 1) * W, H - 4 - (v - mn) / (mx - mn || 1) * (H - 8)] as [number, number]);
  const anim = !reducedMotion();
  return (
    <svg className={small ? 'ts-spark-sm' : 'ts-spark'} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <clipPath id={id}>
        <rect x="-2" y="-10" width={anim ? 0 : W + 4} height={H + 20}>
          {anim && <animate attributeName="width" from="0" to={W + 4} dur="1.2s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".65 0 .35 1" />}
        </rect>
      </clipPath>
      <path clipPath={`url(#${id})`} d={smooth(pts, H - 4)} />
    </svg>
  );
}
