import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { cookies } from 'next/headers';
import { handler, body, bad, audit } from '@/lib/api';
import { db } from '@/lib/db';
import { sign, verify, startSession, endSession, cookieOpts, PRE_COOKIE, getAdmin } from '@/lib/auth';
import { ROLES } from '@/lib/rbac';
import { newTotpSecret, verifyTotp, totpUri } from '@/lib/totp';
import { regimentName } from '@/lib/settings';
import { cleanName } from '@/lib/util';

export const dynamic = 'force-dynamic';

async function preToken(user, stage) {
  const jar = await cookies();
  jar.set(PRE_COOKIE, await sign({ uid: user.id, sv: user.session_version, stage }, 600), cookieOpts(600));
}

async function enrolPayload(user) {
  const k = await db();
  let secret = user.totp_secret;
  if (!secret || user.totp_enabled) {
    secret = newTotpSecret();
    await k('users').where({ id: user.id }).update({ totp_secret: secret });
  }
  const uri = totpUri(secret, user.username, `${await regimentName()} Invitations`);
  return { stage: 'enrol', secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}

function checkPassword(pw) {
  if (String(pw || '').length < 8) bad('Password must be at least 8 characters.');
}

export const POST = handler(async (req) => {
  const b = await body(req);
  const k = await db();

  if (b.action === 'setup') {
    const n = await k('users').count({ n: '*' }).first();
    if (Number(n.n) > 0) bad('Setup is already complete. Please log in.', 403);
    const name = cleanName(b.name);
    const username = String(b.username || '').trim().toLowerCase();
    if (!name || !/^[a-z0-9._-]{3,40}$/.test(username)) bad('Enter your name and a username (3–40 letters, numbers, . _ -).');
    checkPassword(b.password);
    const [id] = await k('users').insert({
      name, username, password_hash: await bcrypt.hash(b.password, 11), role: 'super_admin', notify_all: true, created_at: new Date(),
    });
    const user = await k('users').where({ id }).first();
    await audit({ user, action: 'setup', details: 'Created the first Super Admin', req });
    await preToken(user, 'enrol');
    return enrolPayload(user);
  }

  if (b.action === 'login') {
    const username = String(b.username || '').trim().toLowerCase();
    const user = await k('users').where({ username }).first();
    if (user?.locked_until && new Date(user.locked_until) > new Date()) bad('Too many attempts. Try again in 15 minutes.', 429);
    const ok = user && user.active && (await bcrypt.compare(String(b.password || ''), user.password_hash));
    if (!ok) {
      if (user) {
        const f = user.failed_logins + 1;
        await k('users').where({ id: user.id }).update({ failed_logins: f >= 5 ? 0 : f, locked_until: f >= 5 ? new Date(Date.now() + 15 * 60000) : null });
        await audit({ user, action: 'login.failed', req });
      }
      bad('Wrong username or password.', 401);
    }
    await k('users').where({ id: user.id }).update({ failed_logins: 0, locked_until: null });
    if (ROLES[user.role]?.twofa) {
      if (!user.totp_enabled) { await preToken(user, 'enrol'); return enrolPayload(user); }
      await preToken(user, 'totp');
      return { stage: 'totp' };
    }
    await k('users').where({ id: user.id }).update({ last_login_at: new Date() });
    await startSession(user);
    await audit({ user, action: 'login', req });
    return { stage: 'done' };
  }

  if (b.action === 'totp' || b.action === 'enrol') {
    const jar = await cookies();
    const p = await verify(jar.get(PRE_COOKIE)?.value);
    if (!p) bad('Your login step expired. Please log in again.', 401);
    const user = await k('users').where({ id: p.uid }).first();
    if (!user || !user.active || user.session_version !== p.sv) bad('Please log in again.', 401);
    if (p.stage !== b.action) bad('Please log in again.', 401);
    if (!verifyTotp(user.totp_secret, b.code)) {
      const f = user.failed_logins + 1;
      await k('users').where({ id: user.id }).update({ failed_logins: f >= 5 ? 0 : f, locked_until: f >= 5 ? new Date(Date.now() + 15 * 60000) : null });
      if (f >= 5) { jar.delete(PRE_COOKIE); bad('Too many wrong codes. Try again in 15 minutes.', 429); }
      bad('That code is not right. Check the time on your phone and try the newest code.', 401);
    }
    await k('users').where({ id: user.id }).update({ totp_enabled: true, failed_logins: 0, last_login_at: new Date() });
    await startSession(user);
    await audit({ user, action: b.action === 'enrol' ? '2fa.enabled' : 'login', req });
    return { stage: 'done' };
  }

  if (b.action === 'logout') {
    const user = await getAdmin();
    await endSession();
    if (user) await audit({ user, action: 'logout', req });
    return { ok: true };
  }

  bad('Unknown action');
});
