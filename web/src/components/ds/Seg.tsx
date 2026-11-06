import { useLayoutEffect, useRef } from 'react';

/** Pill segmented control with a sliding thumb. */
export function Seg<T extends string>({ options, value, onChange, small, label }: {
  options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; small?: boolean; label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    const place = () => {
      const on = ref.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]'), th = thumb.current;
      if (!on || !th) return;
      if (first.current) th.style.transition = 'none';
      th.style.left = on.offsetLeft + 'px'; th.style.width = on.offsetWidth + 'px';
      if (first.current) { void th.offsetWidth; th.style.transition = ''; first.current = false; }
    };
    place();
    const ro = new ResizeObserver(place); if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [value, options.length]);
  return (
    <div className={`ts-seg ${small ? 'ts-sm' : ''}`} ref={ref} role="group" aria-label={label}>
      <span className="ts-thumb" ref={thumb} />
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} className={o.value === value ? 'ts-on' : ''} onClick={() => onChange(o.value)}>
          {o.label}{o.count != null && <em>{o.count}</em>}
        </button>
      ))}
    </div>
  );
}
