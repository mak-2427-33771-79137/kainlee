'use client';
import { admin, toast } from './client';

const coarse = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

// Open WhatsApp with the personalised message, then record the send time.
export async function sendWhatsApp(id, kind = 'invite') {
  const pre = coarse() ? null : window.open('', '_blank');
  try {
    const m = await admin('inv.message', { id, kind });
    if (!m.mobile) { pre?.close(); toast('This guest has no mobile number.', true); return false; }
    if (pre) pre.location = m.wa; else location.href = m.wa;
    await admin('inv.markSent', { id, kind });
    return true;
  } catch (e) {
    pre?.close();
    toast(e.message, true);
    return false;
  }
}

// Phones: share the actual PDF file (pick the contact in WhatsApp yourself).
export async function sharePdf(id) {
  try {
    const m = await admin('inv.message', { id, kind: 'invite' });
    let files;
    if (m.pdfLink.endsWith('.pdf')) {
      const blob = await (await fetch(m.pdfLink)).blob();
      const f = new File([blob], 'Invitation.pdf', { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [f] })) files = [f];
    }
    if (!navigator.share) { toast('Sharing files works on phones. Use “WhatsApp” instead.', true); return; }
    await navigator.share(files ? { files, text: m.text } : { text: m.text });
    await admin('inv.markSent', { id, kind: 'invite' });
    toast('Shared');
  } catch (e) {
    if (e.name !== 'AbortError') toast(e.message, true);
  }
}
