import { useEffect, useRef } from 'react';
import { reducedMotion } from './format';

const G = { cx: 150, cy: 150, r: 104 };
const P = (deg: number, rad: number) => [G.cx + rad * Math.cos(deg * Math.PI / 180), G.cy - rad * Math.sin(deg * Math.PI / 180)];
function arcD(p: number) {
  p = Math.max(p, 0.002);
  const a1 = 200 - 220 * p, [x0, y0] = P(200, G.r), [x1, y1] = P(a1, G.r);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${G.r} ${G.r} 0 ${220 * p > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
const TICKS = Array.from({ length: 41 }, (_, i) => {
  const a = 200 - 220 * i / 40, long = i % 5 === 0, [x0, y0] = P(a, G.r + 21), [x1, y1] = P(a, G.r + (long ? 33 : 28));
  return { a, x0, y0, x1, y1 };
});

/** 220° gauge with ticks that light up as the arc sweeps to `value` (0 to 1). */
export function Gauge({ value }: { value: number }) {
  const prog = useRef<SVGPathElement>(null), knob = useRef<SVGGElement>(null), svg = useRef<SVGSVGElement>(null);
  const from = useRef(0);
  useEffect(() => {
    const target = Math.max(0, Math.min(1, value || 0));
    const set = (p: number) => {
      prog.current?.setAttribute('d', arcD(p));
      const [x, y] = P(200 - 220 * Math.max(p, 0.002), G.r);
      knob.current?.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      const lim = 200 - 220 * p;
      svg.current?.toggleAttribute('data-empty', p < 0.005);
      svg.current?.querySelectorAll<SVGLineElement>('.ts-tk').forEach((l) => l.setAttribute('opacity', +l.dataset.a! >= lim - 0.01 ? '.95' : '.22'));
    };
    if (reducedMotion()) { set(target); from.current = target; return; }
    const t0 = performance.now(), d = 1700, a = from.current; let raf = 0;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); set(a + (target - a) * e); if (k < 1) raf = requestAnimationFrame(step); else from.current = target; };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <svg ref={svg} className="ts-gauge" viewBox="0 0 300 205" aria-hidden="true">
      <defs>
        <linearGradient id="gg" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="rgb(var(--brand-blue))" /><stop offset=".55" stopColor="rgb(var(--brand-blue))" /><stop offset="1" stopColor="rgb(var(--chart-line))" /></linearGradient>
      </defs>
      {TICKS.map((t, i) => <line key={i} className="ts-tk" data-a={t.a} x1={t.x0.toFixed(1)} y1={t.y0.toFixed(1)} x2={t.x1.toFixed(1)} y2={t.y1.toFixed(1)} opacity=".22" />)}
      <path className="ts-track" d={arcD(1)} />
      <path className="ts-prog" ref={prog} d={arcD(0)} />
      <g ref={knob}><circle r="13" fill="rgb(var(--surface-2))" /><circle className="ts-knob" r="6.5" fill="none" strokeWidth="2.5" /></g>
    </svg>
  );
}
