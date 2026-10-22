'use client';
import { useEffect } from 'react';

export default function Modal({ title, onClose, children, width = 460 }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,30,15,.45)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card3 band" onClick={(e) => e.stopPropagation()} style={{ width: `min(100%, ${width}px)`, maxHeight: '88vh', overflow: 'auto', padding: '22px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12, animation: 'toast .25s ease both' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="go" style={{ fontSize: 24 }}>{title}</h2>
          <button type="button" className="btn ghost sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
