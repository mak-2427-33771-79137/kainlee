import { regimentName, logoVersion } from '@/lib/settings';
import { linkFor } from '@/lib/guestLink';

export const dynamic = 'force-dynamic';

// Per-guest manifest so "Add to Home Screen" opens straight to this guest's invitation.
export async function GET(req, { params }) {
  const { token } = await params;
  const r = await linkFor(token);
  if (!r) return new Response('Not found', { status: 404 });
  const v = await logoVersion();
  const name = await regimentName();
  return Response.json({
    name: `${name} Invitation`,
    short_name: name,
    id: r.path,
    start_url: r.path,
    scope: '/i/',
    display: 'standalone',
    background_color: '#00572D',
    theme_color: '#00572D',
    icons: [
      { src: `/api/logo/192?v=${v}`, sizes: '192x192', type: 'image/png' },
      { src: `/api/logo/512?v=${v}`, sizes: '512x512', type: 'image/png' },
      { src: `/api/logo/maskable?v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'no-cache' } });
}
