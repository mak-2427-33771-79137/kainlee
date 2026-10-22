'use client';
import { useState } from 'react';
import Icon from './Icon';
import { download } from './client';

// Export buttons: report + PDF/Excel, carrying the current filters.
export default function ExportMenu({ eventId, filters = {}, reports, label = 'Export' }) {
  const [open, setOpen] = useState(false);
  const go = (report, format) => {
    const p = new URLSearchParams({ event: eventId, report, format, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) });
    download(`/api/admin/export?${p}`);
    setOpen(false);
  };
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="btn" onClick={() => setOpen(!open)} aria-expanded={open}><Icon n="dl" />{label}</button>
      {open && (
        <div className="card3" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 20, padding: 8, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {reports.map(([key, name]) => (
            <div key={key} className="row" style={{ justifyContent: 'space-between', padding: '6px 6px', borderBottom: '1px dashed var(--rule)' }}>
              <span style={{ fontWeight: 600 }}>{name}</span>
              <span className="row" style={{ gap: 6 }}>
                <button type="button" className="btn sm" onClick={() => go(key, 'pdf')}>PDF</button>
                <button type="button" className="btn sm" onClick={() => go(key, 'xlsx')}>Excel</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
