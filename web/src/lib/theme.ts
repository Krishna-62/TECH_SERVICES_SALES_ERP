import { useEffect, useState } from 'react';

const KEY = 'tech-theme';
const EVENT = 'tech-themechange';

export const isDark = () => document.documentElement.classList.contains('dark');

function apply(dark: boolean, persist: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  if (persist) {
    try { localStorage.setItem(KEY, dark ? 'dark' : 'light'); } catch { /* storage blocked */ }
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Switch light/dark. With an origin element, the new theme is revealed as a circle growing from it. */
export function toggleTheme(origin?: HTMLElement | null) {
  const next = !isDark();
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduced || !origin) { apply(next, true); return; }
  const r = origin.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const vt = doc.startViewTransition(() => apply(next, true));
  vt.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${R}px at ${x}px ${y}px)`] },
      { duration: 750, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' },
    );
  }).catch(() => {});
}

/** Follow the OS setting until the person picks a theme themselves. */
export function watchSystemTheme() {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }
    if (!saved) apply(mq.matches, false);
  };
  mq.addEventListener?.('change', onChange);
  return () => mq.removeEventListener?.('change', onChange);
}

export function useIsDark() {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const h = () => setDark(isDark());
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
  return dark;
}
