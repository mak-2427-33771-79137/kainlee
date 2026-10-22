import { getLogo, getSetting, logoVersion, assetBytes } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  const { kind } = await params;
  let buf;
  if (kind === 'maskable') {
    const b64 = await getSetting('logo_maskable');
    buf = b64 ? Buffer.from(b64, 'base64') : assetBytes('default-maskable.png');
  } else {
    buf = await getLogo(kind === '192' ? 192 : 512);
  }
  const etag = `"logo-${kind}-${await logoVersion()}"`;
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag } });
  return new Response(buf, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400', etag } });
}
