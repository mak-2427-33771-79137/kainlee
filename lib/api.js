import { NextResponse } from 'next/server';
import { HttpError } from './auth';
import { db } from './db';

export function bad(msg, status = 400) { throw new HttpError(status, msg); }

export function clientIp(req) {
  const h = req?.headers;
  if (!h) return null;
  return (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || null;
}

// Wrap a route handler: CSRF header check on writes, JSON errors.
export function handler(fn) {
  return async (req, ctx) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (req.headers.get('x-kl') !== '1') bad('Bad request', 400);
      }
      const res = await fn(req, ctx);
      if (res instanceof Response) return res;
      return NextResponse.json(res ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
  };
}

export async function body(req) {
  try { return await req.json(); } catch { return {}; }
}

export async function audit({ user, actor, eventId, invitationId, action, details, req, trx }) {
  try {
    const k = trx || (await db());
    await k('audit_log').insert({
      user_id: user?.id || null,
      actor: (actor || (user ? `${user.name} (${user.username})` : 'System')).slice(0, 160),
      event_id: eventId || null,
      invitation_id: invitationId || null,
      action,
      details: details ? String(details).slice(0, 1000) : null,
      ip: clientIp(req)?.slice(0, 64) || null,
      at: new Date(),
    });
  } catch (e) {
    console.error('audit failed', e);
  }
}
