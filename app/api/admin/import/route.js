import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { db } from '@/lib/db';
import { getEvent, ensureInvitation } from '@/lib/data';
import { parseInviteesXlsx, templateXlsx } from '@/lib/importer';
import { audit } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getAdmin();
  if (!user || !can(user.role, 'invitees.manage')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  return new Response(await templateXlsx(), {
    headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="Kainlee-invitee-template.xlsx"' },
  });
}

export async function POST(req) {
  if (req.headers.get('x-kl') !== '1') return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const user = await getAdmin();
  if (!user || !can(user.role, 'invitees.manage')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const form = await req.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Choose an Excel file.' }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: 'File is too large (max 8 MB).' }, { status: 400 });
  let parsed;
  try { parsed = await parseInviteesXlsx(Buffer.from(await file.arrayBuffer())); } catch { return NextResponse.json({ error: 'Could not read this file. Please use the Excel template (.xlsx).' }, { status: 400 }); }
  const eventId = Number(form.get('event_id')) || null;
  const event = eventId ? await getEvent(eventId) : null;
  const k = await db();
  let created = 0, skipped = 0, invited = 0;
  const errors = [...parsed.errors];
  await k.transaction(async (trx) => {
    for (const r of parsed.rows) {
      let p = r.mobile ? await trx('invitees').where({ mobile: r.mobile }).first() : null;
      if (p) skipped++;
      else {
        const { row, extra_cap, ...data } = r;
        const [id] = await trx('invitees').insert({ ...data, created_at: new Date() });
        p = await trx('invitees').where({ id }).first();
        created++;
      }
      if (event) {
        const res = await ensureInvitation(trx, event, p, r.extra_cap ?? undefined);
        if (res.created) invited++;
      }
    }
  });
  await audit({ user, eventId, action: 'invitees.import', details: `${created} new, ${skipped} already existed, ${invited} invited to event, ${errors.length} errors`, req });
  return NextResponse.json({ created, skipped, invited, errors: errors.slice(0, 50) });
}
