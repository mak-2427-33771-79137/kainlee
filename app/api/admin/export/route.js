import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { db } from '@/lib/db';
import { getEvent } from '@/lib/data';
import { loadEventData, filterInvitations, STATUS_LABEL } from '@/lib/stats';
import { buildReport, reportToPdf, reportToXlsx, REPORTS } from '@/lib/reports';
import { regimentName } from '@/lib/settings';
import { audit } from '@/lib/api';
import { fmtStamp, fmtShort, categoryLabel } from '@/lib/util';

export const dynamic = 'force-dynamic';

const deny = (msg, status = 403) => NextResponse.json({ error: msg }, { status });

function filterLabel(f, users, me) {
  const parts = [];
  if (f.status) parts.push(STATUS_LABEL[f.status] || f.status);
  if (f.category) parts.push(categoryLabel(f.category));
  if (f.offrs === '1') parts.push('Officers');
  if (f.guestroom) parts.push(`Guest room: ${f.guestroom}`);
  if (f.handler) parts.push(`Looked after by: ${f.handler === 'me' ? me.name : f.handler === 'none' ? 'Unassigned' : users.find((u) => u.id === Number(f.handler))?.name || f.handler}`);
  if (f.q) parts.push(`Search "${f.q}"`);
  return parts.join(' · ');
}

async function activityXlsx(user, sp) {
  const k = await db();
  const q = k('audit_log').orderBy('id', 'desc').limit(20000);
  if (sp.get('user')) q.where('user_id', Number(sp.get('user')));
  if (sp.get('event')) q.where('event_id', Number(sp.get('event')));
  const rows = await q;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Activity log');
  ws.addRow([`${await regimentName()} - Activity log`]).font = { bold: true, size: 14 };
  ws.addRow([`Generated on ${fmtStamp()} by ${user.name}`]).font = { italic: true };
  ws.addRow([]);
  ws.addRow(['When (IST)', 'Who', 'Action', 'Details', 'Event', 'IP']).font = { bold: true };
  for (const r of rows) ws.addRow([fmtShort(r.at) + ' ' + new Date(r.at).getUTCFullYear(), r.actor, r.action, r.details, r.event_id, r.ip]);
  [18, 30, 22, 80, 8, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function GET(req) {
  const user = await getAdmin();
  if (!user) return deny('Please log in again.', 401);
  const sp = new URL(req.url).searchParams;
  const report = sp.get('report');
  const format = sp.get('format') === 'xlsx' ? 'xlsx' : 'pdf';
  const regiment = await regimentName();

  if (report === 'activity') {
    if (!can(user.role, 'audit.view')) return deny('Only the Super Admin can export the activity log.');
    const buf = await activityXlsx(user, sp);
    await audit({ user, action: 'export', details: 'Activity log (Excel)', req });
    return new Response(buf, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="activity-log-${Date.now()}.xlsx"`, 'cache-control': 'no-store' } });
  }

  if (!REPORTS[report]) return deny('Unknown report.', 400);
  const event = await getEvent(Number(sp.get('event')) || 0);
  if (!event) return deny('Event not found.', 404);

  const f = Object.fromEntries(['status', 'category', 'offrs', 'guestroom', 'handler', 'fn', 'att', 'walkin', 'q'].map((x) => [x, sp.get(x) || '']).filter(([, v]) => v));
  const all = can(user.role, 'export.all');
  if (report === 'catering') {
    if (!can(user.role, 'export.catering')) return deny('You do not have permission to export this.');
  } else if (!all) {
    if (!can(user.role, 'export.own')) return deny('You do not have permission to export.');
    f.handler = 'me'; // liaison officers export only the guests they look after
  }
  const k = await db();
  const users = await k('users').select('id', 'name');
  const invs = filterInvitations(await loadEventData(event.id), f, user);
  const rooms = await k('rooms').where({ event_id: event.id }).orderBy([{ column: 'sort' }, { column: 'name' }]);
  const rep = buildReport(report, { event, invs, rooms, users, filterLabel: filterLabel(f, users, user), withContacts: can(user.role, 'guests.contacts') });
  const opts = { regiment, eventName: event.name, user: user.name };
  const buf = format === 'xlsx' ? await reportToXlsx(rep, opts) : await reportToPdf(rep, opts);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '');
  const fname = `${rep.title}-${event.name}-${stamp}`.replace(/[^A-Za-z0-9-]+/g, '-');
  await audit({ user, eventId: event.id, action: 'export', details: `${rep.title} (${format.toUpperCase()})${rep.subtitle ? ` · ${rep.subtitle}` : ''}`, req });
  return new Response(buf, {
    headers: {
      'content-type': format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
      'content-disposition': `${format === 'pdf' && sp.get('inline') ? 'inline' : 'attachment'}; filename="${fname}.${format}"`,
      'cache-control': 'no-store',
    },
  });
}
