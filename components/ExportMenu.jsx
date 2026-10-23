'use client';
import { useState } from 'react';
import Icon from './Icon';
import Modal from './Modal';
import { downloadFile } from './client';

// Export buttons: report + PDF/Excel, carrying the current filters.
// Opens as a panel that fits any screen (the old drop-down ran off the left edge on phones).
export default function ExportMenu({ eventId, filters = {}, reports, label = 'Export' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const go = async (report, format, name) => {
    const p = new URLSearchParams({ event: eventId, report, format, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) });
    setErr(''); setBusy(`${report}:${format}`);
    try {
      await downloadFile(`/api/admin/export?${p}`, `${name} (${format === 'pdf' ? 'PDF' : 'Excel'})`);
      setOpen(false);
    } catch (e) {
      setErr(e.message || 'Could not download the file.');
    } finally { setBusy(''); }
  };
  return (
    <>
      <button type="button" className="btn" onClick={() => { setErr(''); setOpen(true); }} aria-haspopup="dialog"><Icon n="dl" />{label}</button>
      {open && (
        <Modal title={label} onClose={() => !busy && setOpen(false)} width={480}>
          <div className="stack" style={{ gap: 0 }}>
            {reports.map(([key, name]) => (
              <div key={key} className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 10, padding: '10px 2px', borderBottom: '1px dashed var(--rule2)' }}>
                <span style={{ fontWeight: 600, minWidth: 0 }}>{name}</span>
                <span className="row" style={{ gap: 6, flexWrap: 'nowrap', flex: 'none' }}>
                  {['pdf', 'xlsx'].map((fmt) => (
                    <button key={fmt} type="button" className="btn sm" disabled={!!busy} onClick={() => go(key, fmt, name)} style={{ minWidth: 72 }}>
                      {busy === `${key}:${fmt}` ? 'Preparing…' : fmt === 'pdf' ? 'PDF' : 'Excel'}
                    </button>
                  ))}
                </span>
              </div>
            ))}
          </div>
          {err && <div className="err">{err}</div>}
          <p className="mu" style={{ margin: 0, fontSize: 13 }}>On iPhone the file opens in the share sheet: choose <b>Save to Files</b>, WhatsApp or Mail.</p>
        </Modal>
      )}
    </>
  );
}
