// Apple Push Notification service (APNs) for the Kainlee iOS app, using a token-based .p8 key.
// Settings (Hostinger environment variables):
//   APNS_KEY_ID   – the Key ID shown next to the key in developer.apple.com › Keys
//   APNS_TEAM_ID  – your Apple Team ID
//   APNS_KEY      – the full text of the .p8 file (BEGIN PRIVATE KEY … END PRIVATE KEY)
//   APNS_BUNDLE_ID (optional) – defaults to com.makjal.kainlee
import http2 from 'http2';
import { SignJWT, importPKCS8 } from 'jose';

const HOSTS = { production: 'https://api.push.apple.com', sandbox: 'https://api.sandbox.push.apple.com' };
const g = globalThis;

export function apnsConfigured() {
  return !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_KEY);
}
export const bundleId = () => process.env.APNS_BUNDLE_ID || 'com.makjal.kainlee';

async function jwt() {
  const now = Math.floor(Date.now() / 1000);
  if (g.__klApnsJwt && now - g.__klApnsJwt.at < 45 * 60) return g.__klApnsJwt.token;
  // Accept the .p8 text however it was pasted (one line, spaces or "\\n" instead of line breaks)
  const raw = String(process.env.APNS_KEY).replace(/\\n/g, '\n');
  const body = raw.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/[^A-Za-z0-9+/=]/g, '');
  const pem = `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
  const key = await importPKCS8(pem, 'ES256');
  const token = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: process.env.APNS_KEY_ID })
    .setIssuer(process.env.APNS_TEAM_ID).setIssuedAt(now).sign(key);
  g.__klApnsJwt = { token, at: now };
  return token;
}

function session(env) {
  g.__klApns ||= {};
  const s = g.__klApns[env];
  if (s && !s.closed && !s.destroyed) return s;
  const c = http2.connect(HOSTS[env]);
  c.on('error', () => {});
  c.on('goaway', () => c.close());
  c.setTimeout(5 * 60000, () => c.close());
  g.__klApns[env] = c;
  return c;
}

function send(env, token, auth, body) {
  return new Promise((resolve) => {
    let req;
    try {
      req = session(env).request({
        ':method': 'POST', ':path': `/3/device/${token}`,
        authorization: `bearer ${auth}`, 'apns-topic': bundleId(), 'apns-push-type': 'alert', 'apns-priority': '10',
        'content-type': 'application/json',
      });
    } catch (e) { resolve({ status: 0, reason: e.message }); return; }
    let status = 0; let data = '';
    req.setTimeout(10000, () => { req.close(); resolve({ status: 0, reason: 'timeout' }); });
    req.on('response', (h) => { status = h[':status']; });
    req.on('data', (d) => { data += d; });
    req.on('end', () => { let reason = ''; try { reason = JSON.parse(data || '{}').reason || ''; } catch {} resolve({ status, reason }); });
    req.on('error', (e) => resolve({ status: 0, reason: e.message }));
    req.end(body);
  });
}

/**
 * Send one alert to a device. App Store / TestFlight builds use production; apps run from
 * Xcode use the sandbox, so a token rejected by one is tried on the other once.
 * Returns { ok, env, gone } — gone = token no longer valid (delete it).
 */
export async function apnsSend(tokenRow, { title, body, url, badge }) {
  if (!apnsConfigured()) return { ok: false };
  const auth = await jwt();
  const payload = JSON.stringify({ aps: { alert: { title: String(title || '').slice(0, 120), body: String(body || '').slice(0, 300) }, sound: 'default', ...(badge != null ? { badge } : {}) }, url: url || '/admin' });
  const first = tokenRow.apns_env === 'sandbox' ? 'sandbox' : 'production';
  let r = await send(first, tokenRow.token, auth, payload);
  if (r.status === 400 && r.reason === 'BadDeviceToken' && !tokenRow.apns_env) {
    const other = first === 'production' ? 'sandbox' : 'production';
    const r2 = await send(other, tokenRow.token, auth, payload);
    if (r2.status === 200) return { ok: true, env: other };
    r = r2;
  }
  if (r.status === 200) return { ok: true, env: first };
  return { ok: false, gone: r.status === 410 || r.reason === 'Unregistered' || r.reason === 'BadDeviceToken', reason: r.reason };
}
