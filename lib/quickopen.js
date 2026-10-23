// "Open my invitation" buttons in WhatsApp: the link carries a short secret (?k=) that opens the
// guest's invitation without typing the PIN. It is tied to the invitation's private token, so
// "Reset PIN and new link" in the guest editor also stops old buttons from working.
import crypto from 'crypto';
import { getSecret } from './settings';
import { guestPath } from './links';

export async function openKey(token) {
  return crypto.createHmac('sha256', await getSecret()).update(`open:${token}`).digest('base64url').slice(0, 16);
}
export async function openKeyOk(token, k) {
  if (!token || !k) return false;
  const want = Buffer.from(await openKey(token));
  const got = Buffer.from(String(k));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
/** Value for a dynamic URL button whose base is https://<site>/i/{{1}} */
export async function buttonPath(eventCode, inv) {
  return `${guestPath(eventCode, inv).replace(/^\/i\//, '')}?k=${await openKey(inv.token)}`;
}
