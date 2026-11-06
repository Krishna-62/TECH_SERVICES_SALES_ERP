import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { lakh, lakhShort, niceStep, reducedMotion } from './format';

export interface BarPoint { label: string; value: number }

/** Hatched pill bars; the active bar turns solid ink and carries a tooltip. Hover to inspect. */
export function RevenueBars({ data, emptyText = 'No revenue in this period yet', metric = 'Revenue' }: { data: BarPoint[]; emptyText?: string; metric?: string }) {
  const vals = data.map((d) => Math.max(0, Number(d.value) || 0));
  const max = Math.max(0, ...vals);
  const top = max > 0 ? niceStep(max / 4) * 4 : 400000;
  const lastIdx = useMemo(() => { for (let i = vals.length - 1; i >= 0; i--) if (vals[i] > 0) return i; return vals.length - 1; }, [data]);
  const [active, setActive] = useState(lastIdx);
  const [grown, setGrown] = useState(reducedMotion());
  const area = useRef<HTMLDivElement>(null), tip = useRef<HTMLDivElement>(null);
  const total = vals.reduce((a, b) => a + b, 0), avg = vals.length ? total / vals.length : 0;
  const every = Math.ceil(data.length / 12);

  useEffect(() => { setActive(lastIdx); }, [lastIdx]);
  useEffect(() => { if (grown) return; const id = requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true))); return () => cancelAnimationFrame(id); }, []);

  useLayoutEffect(() => {
    const a = area.current, t = tip.current; if (!a || !t || active < 0) return;
    const col = a.querySelectorAll<HTMLElement>('.ts-col')[active]; if (!col) return;
    const W = a.clientWidth, H = a.clientHeight, tw = t.offsetWidth || 178;
    let x = col.offsetLeft + col.offsetWidth / 2; x = Math.max(tw / 2, Math.min(W - tw / 2, x));
    t.style.left = x + 'px'; t.style.bottom = Math.min(H - t.offsetHeight, (vals[active] / top) * H + 12) + 'px';
  }, [active, data, top]);

  if (!data.length) return <div className="ts-dempty"><p>{emptyText}</p></div>;
  const prev = active > 0 ? vals[active - 1] : 0;
  return (
    <div className="ts-plot">
      <div className="ts-parea" ref={area} onPointerLeave={() => setActive(lastIdx)}>
        {[4, 3, 2, 1, 0].map((k) => (
          <div key={k} className="ts-gl" style={{ bottom: `${k * 25}%` }}><span>{k ? lakhShort(top * k / 4) : '₹0'}</span></div>
        ))}
        {total > 0 && <div className="ts-avg" style={{ bottom: `${(avg / top) * 100}%` }}><span>avg {lakh(avg)}</span></div>}
        <div className="ts-bars">
          {data.map((d, i) => (
            <div key={i} className={`ts-col ${i === active ? 'ts-on' : ''}`} onPointerEnter={() => setActive(i)} onClick={() => setActive(i)}>
              <div className="ts-bar" style={{ height: grown ? `${(vals[i] / top) * 100}%` : '0%', transitionDelay: `${(grown ? 0 : 300) + i * 45}ms` }} />
              {(i % every === 0 || i === data.length - 1) && <span className="ts-m">{shortLabel(d.label)}</span>}
            </div>
          ))}
        </div>
        {active >= 0 && data[active] && (
          <div className="ts-btip" ref={tip}>
            <h6>{data[active].label}</h6>
            <div>{metric} <b>{vals[active] ? lakh(vals[active]) : '₹0'}</b></div>
            {active > 0 && prev > 0 && <div className="ts-g">vs previous <b>{vals[active] / prev >= 1 ? '+' : ''}{((vals[active] / prev - 1) * 100).toFixed(1)}%</b></div>}
          </div>
        )}
        {total === 0 && <div className="ts-lcempty" style={{ inset: 0 }}>{emptyText}</div>}
      </div>
    </div>
  );
}

function shortLabel(l: string) {
  // "Oct 2026" -> "Oct"; "12 Oct" stays; long labels are trimmed.
  const m = l.match(/^([A-Za-z]{3})[a-z]*\s+\d{4}$/);
  if (m) return m[1];
  return l.length > 7 ? l.slice(0, 6) : l;
}
