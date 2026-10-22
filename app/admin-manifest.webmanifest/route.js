import { regimentName, logoVersion } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  const v = await logoVersion();
  const name = await regimentName();
  return Response.json({
    name: `${name} Invitations · Admin`,
    short_name: `${name} Admin`,
    start_url: '/admin',
    scope: '/',
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
