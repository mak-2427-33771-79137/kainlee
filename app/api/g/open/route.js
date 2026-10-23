// /api/g/open?to=/i/<code>/<mobile>&k=<secret>: sign the guest in (as if the PIN was typed)
// and continue to the clean invitation link. A wrong or old code just shows the PIN screen.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tokenFor } from '@/lib/links';
import { openKeyOk } from '@/lib/quickopen';
import { startGuestSession } from '@/lib/guest';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const u = new URL(req.url);
  const to = u.searchParams.get('to') || '/';
  const k = u.searchParams.get('k') || '';
  const m = to.match(/^\/i\/([A-Za-z0-9-]{1,40})(?:\/([^/?#]{1,40}))?(\/[a-z.]*)?$/);
  const base = process.env.SITE_URL || u.origin;
  const go = (p) => NextResponse.redirect(new URL(p, base), 303);
  if (!m) return go('/');
  const token = m[2] ? await tokenFor(m[1], m[2]) : m[1];
  if (token && (await openKeyOk(token, k))) {
    const kx = await db();
    const inv = await kx('invitations').where({ token }).select('id', 'link_opened_at', 'pin_ok_at').first();
    if (inv) {
      await startGuestSession(token, inv.id);
      const now = new Date();
      await kx('invitations').where({ id: inv.id }).update({ guest_last_seen_at: now, ...(inv.link_opened_at ? {} : { link_opened_at: now }), ...(inv.pin_ok_at ? {} : { pin_ok_at: now }) });
    }
  }
  return go(to);
}
