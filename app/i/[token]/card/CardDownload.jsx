'use client';
import { useState } from 'react';
import Icon from '@/components/Icon';
import CardView from '@/components/CardView';
import { toast } from '@/components/client';

export default function CardDownload({ html, name, token }) {
  const [busy, setBusy] = useState(false);
  async function pdf() {
    setBusy(true);
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:960px;height:540px;background:#fff';
    holder.innerHTML = html;
    document.body.appendChild(holder);
    try {
      const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
      await document.fonts.ready;
      const png = await toPng(holder, { width: 960, height: 540, pixelRatio: 2, cacheBust: true });
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [960, 540] });
      doc.addImage(png, 'PNG', 0, 0, 960, 540);
      doc.save(`Invitation-${name.replace(/[^A-Za-z0-9]+/g, '-')}.pdf`);
    } catch (e) {
      toast('Could not create the PDF on this device. Take a screenshot instead.', true);
    } finally { holder.remove(); setBusy(false); }
  }
  return (
    <>
      <div className="scene"><div className="tiltc"><div className="face" style={{ position: 'relative', boxShadow: '0 26px 34px -10px rgba(0,0,0,.45)' }}><CardView html={html} /><div className="gloss" /></div></div></div>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn pri" disabled={busy} onClick={pdf}><Icon n="dl" />{busy ? 'Preparing…' : 'Download PDF'}</button>
        <a className="btn" href={`/i/${token}`}>Open my invitation &amp; RSVP</a>
      </div>
    </>
  );
}
