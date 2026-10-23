// Send visitors on an old or "www" address to https://forefirst.org, keeping the rest of the
// link (so /i/<event>/<mobile> from old WhatsApp messages still opens the same invitation).
// Only page visits (GET/HEAD) are forwarded; anything else is left alone so nothing half-done breaks.
import { NextResponse } from 'next/server';

const CANONICAL = (process.env.CANONICAL_HOST || 'forefirst.org').toLowerCase();
const FORWARD = new Set(['www.forefirst.org', 'momopasal.in', 'www.momopasal.in', 'lali-guras.in', 'www.lali-guras.in']);

export function proxy(req) {
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(':')[0].toLowerCase();
  if (host === CANONICAL || !FORWARD.has(host)) return NextResponse.next();
  if (req.method !== 'GET' && req.method !== 'HEAD') return NextResponse.next();
  const url = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${CANONICAL}`);
  return NextResponse.redirect(url, 308);
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };
