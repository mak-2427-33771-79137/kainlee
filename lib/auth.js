import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from './db';
import { loadRoles } from './roles';
import { getSecret } from './settings';
import { can } from './rbac';

export const ADMIN_COOKIE = 'kl_admin';
export const PRE_COOKIE = 'kl_pre';
const secure = process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1';

async function key() {
  return new TextEncoder().encode(await getSecret());
}

export async function sign(payload, ttlSeconds) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(await key());
}

export async function verify(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await key(), { algorithms: ['HS256'] });
    return payload;
  } catch {
    return null;
  }
}

export function cookieOpts(maxAge) {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge };
}

export async function startSession(user) {
  const jar = await cookies();
  const t = await sign({ uid: user.id, sv: user.session_version, st: 'full' }, 12 * 3600);
  jar.set(ADMIN_COOKIE, t, cookieOpts(12 * 3600));
  jar.delete(PRE_COOKIE);
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  jar.delete(PRE_COOKIE);
}

// Returns the logged-in admin user or null.
export async function getAdmin() {
  const jar = await cookies();
  const p = await verify(jar.get(ADMIN_COOKIE)?.value);
  if (!p || p.st !== 'full') return null;
  const k = await db();
  const [u] = await Promise.all([k('users').where({ id: p.uid }).first(), loadRoles()]);
  if (!u || !u.active || u.session_version !== p.sv) return null;
  return { id: u.id, name: u.name, username: u.username, role: u.role, totp_enabled: !!u.totp_enabled };
}

export class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

export async function requirePerm(perm) {
  const u = await getAdmin();
  if (!u) throw new HttpError(401, 'Please log in again.');
  if (perm && !can(u.role, perm)) throw new HttpError(403, 'You do not have permission for this.');
  return u;
}
