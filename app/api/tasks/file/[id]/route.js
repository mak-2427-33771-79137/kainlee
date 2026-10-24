// View or download a task attachment (logged-in users only). ?dl=1 downloads it.
import { db } from '@/lib/db';
import { getAdmin } from '@/lib/auth';
import { readFile } from '@/lib/taskFiles';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  const u = await getAdmin();
  if (!u) return new Response('Please log in.', { status: 401 });
  const { id } = await params;
  const k = await db();
  const f = await k('task_files').where({ id: Number(id) || 0 }).first();
  if (!f) return new Response('File not found.', { status: 404 });
  let buf;
  try { buf = await readFile(f.stored); } catch { return new Response('This file is missing from the server.', { status: 410 }); }
  const dl = new URL(req.url).searchParams.get('dl') === '1';
  const ascii = f.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return new Response(buf, {
    headers: {
      'content-type': f.mime,
      'content-length': String(buf.length),
      'content-disposition': `${dl ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
      ...(f.mime.startsWith('image/') ? { 'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" } : {}),
    },
  });
}
