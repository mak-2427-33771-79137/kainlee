'use client';
// Bridge to the Kainlee iOS app (Capacitor). Everything here is a no-op in a normal browser.
export const isNative = () => typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

const plugins = {};
async function P(name) {
  if (!plugins[name]) {
    const { registerPlugin } = await import('@capacitor/core');
    plugins[name] = registerPlugin(name);
  }
  return plugins[name];
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/**
 * Native camera QR scanner.
 * Returns { code } on success, { cancelled: true } if the user closed it, or { error } if the
 * native scanner could not run (the caller then falls back to the web camera).
 * Every option must be sent: the iOS side rejects the call if any is missing.
 */
export async function nativeScan() {
  try {
    const s = await P('CapacitorBarcodeScanner');
    const r = await s.scanBarcode({
      hint: 0, // QR code
      scanInstructions: 'Point at the guest’s entry QR',
      scanButton: false,
      scanText: ' ',
      cameraDirection: 1, // back camera
      scanOrientation: 3, // adaptive
    });
    return r?.ScanResult ? { code: r.ScanResult } : { cancelled: true };
  } catch (e) {
    const msg = String(e?.message || e?.code || e || '');
    if (/cancel/i.test(msg)) return { cancelled: true };
    return { error: msg || 'Scanner unavailable' };
  }
}

export async function haptic(ok = true) {
  try { const h = await P('Haptics'); await h.notification({ type: ok ? 'SUCCESS' : 'ERROR' }); } catch {}
}

/** Share a file (e.g. the card image) with the iOS share sheet: WhatsApp, Messages, Save Image, Files… */
export async function nativeShareBlob(blob, fileName, text) {
  const fs = await P('Filesystem');
  const w = await fs.writeFile({ path: fileName.replace(/[^\w.-]+/g, '-'), data: await blobToBase64(blob), directory: 'CACHE' });
  const sh = await P('Share');
  await sh.share({ files: [w.uri], text: text || undefined, dialogTitle: 'Share' });
}

/** Download a report/export and offer Save to Files / share. */
export async function nativeSaveUrl(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not download the file.');
  const cd = res.headers.get('content-disposition') || '';
  const name = decodeURIComponent((cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i) || [])[1] || url.split('/').pop().split('?')[0] || 'Kainlee-file');
  await nativeShareBlob(await res.blob(), name);
}

/** Ask for notification permission and send the device token to the server. */
export async function registerNativePush(sendToken) {
  const pn = await P('PushNotifications');
  let perm = await pn.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await pn.requestPermissions();
  if (perm.receive !== 'granted') return 'denied';
  await pn.removeAllListeners();
  await pn.addListener('registration', (t) => { sendToken(t.value).catch(() => {}); });
  await pn.addListener('pushNotificationActionPerformed', (a) => {
    const url = a?.notification?.data?.url;
    if (url && url.startsWith('/')) location.href = url;
  });
  await pn.register();
  return 'granted';
}

export async function nativePushState() {
  try { const pn = await P('PushNotifications'); return (await pn.checkPermissions()).receive; } catch { return 'unsupported'; }
}
