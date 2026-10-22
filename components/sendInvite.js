'use client';
import { admin, toast } from './client';

const coarse = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

// ---- card image + message, prepared ahead so the share sheet opens instantly ----
const cache = new Map();

async function renderHtmlCard(html) {
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:960px;height:540px;background:#fff';
  holder.innerHTML = html;
  document.body.appendChild(holder);
  try {
    const { toBlob } = await import('html-to-image');
    await document.fonts.ready;
    return await toBlob(holder, { width: 960, height: 540, pixelRatio: 2, cacheBust: true });
  } finally { holder.remove(); }
}

/** Fetch the personalised message and the card image for an invitation (cached for 2 minutes). */
export function prepareCard(id, kind = 'invite') {
  const key = `${id}:${kind}`;
  if (!cache.has(key)) {
    const p = (async () => {
      const m = await admin('inv.message', { id, kind, withCard: true });
      let blob = null;
      if (m.cardHtml) { try { blob = await renderHtmlCard(m.cardHtml); } catch { blob = null; } }
      if (!blob) {
        const res = await fetch(m.cardPng);
        if (!res.ok) throw new Error('Could not create the card image. Please try again.');
        blob = await res.blob();
      }
      const file = new File([blob], `${m.fileName || 'Invitation'}.png`, { type: 'image/png' });
      return { m, blob, file };
    })();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
    setTimeout(() => cache.delete(key), 120000);
  }
  return cache.get(key);
}
export function forgetCard(id) { for (const k of [...cache.keys()]) if (k.startsWith(`${id}:`)) cache.delete(k); }

// iPhone needs the share sheet to open straight from a tap. If preparing took too long,
// show one button the user taps to open it.
function tapToShare(data, label) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'tapshare';
    wrap.innerHTML = `<div class="card3 band"><b></b><span class="mu">Card image is ready.</span><button type="button" class="btn pri"></button><button type="button" class="btn ghost">Cancel</button></div>`;
    wrap.querySelector('b').textContent = label;
    const [go, cancel] = wrap.querySelectorAll('button');
    go.textContent = 'Share on WhatsApp';
    const done = (v) => { wrap.remove(); resolve(v); };
    go.onclick = () => navigator.share(data).then(() => done(true), (e) => { if (e.name !== 'AbortError') toast(e.message, true); done(false); });
    cancel.onclick = () => done(false);
    document.body.appendChild(wrap);
  });
}

async function copyImage(blobPromise) {
  try {
    if (!window.ClipboardItem || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
    return true;
  } catch { return false; }
}

/**
 * Share the card IMAGE together with the message (phones: share sheet → WhatsApp → pick the guest).
 * Computers: opens the guest's WhatsApp chat with the message and copies the card image to paste in.
 */
export async function shareCard(id, kind = 'invite') {
  const canFiles = typeof navigator !== 'undefined' && !!navigator.canShare && coarse();
  if (!canFiles) return sendWhatsApp(id, kind, { withImage: true });
  let prep;
  try { prep = await prepareCard(id, kind); } catch (e) { toast(e.message, true); return false; }
  const data = { files: [prep.file], text: prep.m.text };
  if (!navigator.canShare(data)) return sendWhatsApp(id, kind, { withImage: true });
  try {
    await navigator.share(data);
  } catch (e) {
    if (e.name === 'AbortError') return false;
    if (e.name !== 'NotAllowedError') { toast(e.message, true); return false; }
    if (!(await tapToShare(data, prep.m.name || 'Invitation'))) return false;
  }
  try { await admin('inv.markSent', { id, kind }); } catch {}
  toast('Card shared');
  return true;
}

/**
 * Open WhatsApp straight to the guest's number with the personalised message.
 * The message link shows the card as a preview image. On computers the card image is
 * also copied, so it can be pasted into the chat (Ctrl+V).
 */
export async function sendWhatsApp(id, kind = 'invite', { withImage = !coarse() } = {}) {
  const pre = coarse() ? null : window.open('', '_blank');
  const prep = withImage && !coarse() ? prepareCard(id, kind) : null;
  const copied = prep ? copyImage(prep.then((p) => p.blob)) : Promise.resolve(false);
  try {
    const m = prep ? (await prep).m : await admin('inv.message', { id, kind });
    if (!m.mobile) { pre?.close(); toast('This guest has no mobile number.', true); return false; }
    if (pre) pre.location = m.wa; else location.href = m.wa;
    if (await copied) toast('Card image copied. Press Ctrl+V in the WhatsApp chat to attach it.');
    await admin('inv.markSent', { id, kind });
    return true;
  } catch (e) {
    pre?.close();
    toast(e.message, true);
    return false;
  }
}
