// /d/<event code>: short "Get directions" link for WhatsApp buttons → the event's map location.
import { NextResponse } from 'next/server';
import { eventByCode } from '@/lib/links';
import { getEvent } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  const { code } = await params;
  const base = process.env.SITE_URL || new URL(req.url).origin;
  const e = await eventByCode(code);
  if (e) {
    const ev = await getEvent(e.id);
    const now = Date.now();
    // the next function's own map link if it has one, else the event's
    const next = ev.functions.filter((f) => f.map_url).find((f) => new Date(f.starts_at).getTime() > now - 6 * 3600000);
    const url = next?.map_url || ev.map_url || ev.functions.find((f) => f.map_url)?.map_url;
    if (url && /^https?:\/\//i.test(url)) return NextResponse.redirect(url, 302);
  }
  return NextResponse.redirect(new URL('/', base), 302);
}
