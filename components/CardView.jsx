'use client';
import { useEffect, useRef } from 'react';

// Renders a 960x540 HTML card inside a Shadow DOM (styles stay contained), scaled to fit.
export default function CardView({ html, className = '', onReady }) {
  const box = useRef(null);
  const host = useRef(null);
  useEffect(() => {
    const h = host.current;
    if (!h) return;
    const root = h.shadowRoot || h.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>:host{all:initial;display:block;width:960px;height:540px} *{box-sizing:border-box}</style>${html || ''}`;
    onReady?.(root);
  }, [html, onReady]);
  useEffect(() => {
    const b = box.current;
    if (!b) return;
    const fit = () => { if (host.current) host.current.style.transform = `scale(${b.clientWidth / 960})`; };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(b);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className={`cardbox ${className}`}>
      <div ref={host} className="host" />
    </div>
  );
}
