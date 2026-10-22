'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Re-fetch server data every N seconds while the tab is visible.
export function AutoRefresh({ every = 30 }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) router.refresh(); }, every * 1000);
    return () => clearInterval(t);
  }, [every, router]);
  return null;
}

// Number that counts up on first render.
export function Count({ to, ms = 1200 }) {
  const [v, setV] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (!first.current) { setV(to); return; }
    first.current = false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(to); return; }
    const t0 = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <span className="num">{v.toLocaleString('en-IN')}</span>;
}
