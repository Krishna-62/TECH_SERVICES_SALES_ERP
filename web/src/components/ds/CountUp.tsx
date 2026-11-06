import { useEffect, useRef, useState } from 'react';
import { reducedMotion } from './format';

/** Animates a number from its previous value to the new one (ease-out quart, 1.3s). */
export function useCountUp(value: number, duration = 1300) {
  const [shown, setShown] = useState(reducedMotion() ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reducedMotion()) { setShown(value); from.current = value; return; }
    const start = performance.now(), a = from.current, b = value;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration), e = 1 - Math.pow(1 - k, 4);
      setShown(a + (b - a) * e);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = b;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return shown;
}

export function CountUp({ value, format, duration }: { value: number; format: (v: number) => string; duration?: number }) {
  const v = useCountUp(value, duration);
  return <>{format(v)}</>;
}
