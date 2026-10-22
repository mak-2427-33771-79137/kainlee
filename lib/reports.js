// Builds report data once, then renders it as PDF (pdf-lib) or Excel (exceljs).
import ExcelJS from 'exceljs';
import { reportPdf } from './pdf';
import { CATEGORIES, categoryLabel, RELATION_LABEL, AGE_LABEL, fmtDate, fmtHrs, fmtShort, fmtStamp, prettyMobile } from './util';
import { computeStats, roomsNeeded } from './stats';

export const REPORTS = {
  summary: 'Summary report',
  guests: 'Guest list',
  attendance: 'Attendance report',
  catering: 'Catering sheet',
  rooms: 'Guest room report',
};

const yes = (b) => (b ? 'Yes' : '-');
const when = (d) => (d ? `${fmtDate(d)} ${fmtHrs(d)}` : '-');

/** Returns { title, subtitle, sections:[{heading, columns, rows, rowStyle, kv}] } */
export function buildReport(kind, { event, invs, rooms = [], users = [], filterLabel, withContacts = true }) {
  const fns = event.functions;
  const userName = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const sub = filterLabel ? `Filter: ${filterLabel}` : `All ${invs.length} invitations`;

  if (kind === 'summary') {
    const s = computeStats(invs, fns, rooms.length);
    const I = s.invitation;
    const sections = [{
      heading: 'Invitations',
      kv: [['Total invitees', I.total], ['Invites sent', I.sent], ['Invites not sent', I.unsent], ['Responded', I.responded],
        ['Not yet responded', I.pending], ['Attending (families)', I.attending], ['Regret', I.declined], ['Opened entry QR', I.qr_viewed]],
    }];
    sections.push({
      heading: 'Headcount by function',
      columns: [{ label: 'Function', width: 3 }, { label: 'Date & time', width: 2 }, { label: 'Families', width: 1, align: 'right' }, { label: 'Adults', width: 1, align: 'right' }, { label: 'Child 5-12', width: 1, align: 'right' }, { label: 'Under 5', width: 1, align: 'right' }, { label: 'Total', width: 1, align: 'right' }, { label: 'Veg', width: 1, align: 'right' }, { label: 'Non-veg', width: 1, align: 'right' }, { label: 'Present', width: 1, align: 'right' }],
      rows: fns.map((f) => { const F = s.functions[f.id]; return [f.name, `${fmtDate(f.starts_at)} ${fmtHrs(f.starts_at)}`, F.families, F.heads.adult, F.heads.child, F.heads.infant, F.heads.total, F.heads.veg, F.heads.nonveg, F.present]; }),
    });
    sections.push({
      heading: 'By category',
      columns: [{ label: 'Category', width: 3 }, { label: 'Invited', width: 1, align: 'right' }, { label: 'Attending', width: 1, align: 'right' }, { label: 'Regret', width: 1, align: 'right' }, { label: 'Pending', width: 1, align: 'right' }, { label: 'Heads', width: 1, align: 'right' }],
      rows: CATEGORIES.map((c) => { const C = s.categories[c.id]; return [c.label, C.invited, C.attending, C.declined, C.pending, C.heads]; }),
    });
    const G = s.guestroom;
    sections.push({
      heading: 'Guest rooms',
      kv: [['Rooms in list', G.total_rooms], ['Rooms required', G.rooms_needed], ['Rooms allotted', G.rooms_allotted], ['Rooms vacant', G.vacant], ['Still required', G.still_needed], ['Officers awaiting allotment', G.pending_families]],
    });
    return { title: REPORTS.summary, subtitle: sub, sections };
  }

  if (kind === 'guests') {
    const columns = [
      { label: '#', width: 0.5 }, { label: 'Invitee', width: 2.6 }, { label: 'Category', width: 1.2 },
      ...(withContacts ? [{ label: 'Mobile', width: 1.6 }] : []),
      { label: 'Looked after by', width: 1.5 }, { label: 'RSVP', width: 1 }, { label: 'Relation / age / meal', width: 2.4 },
      ...fns.map((f) => ({ label: f.name, width: 0.9, align: 'center' })),
      { label: 'Guest room', width: 2.6 },
    ];
    const rows = []; const styles = [];
    invs.forEach((inv, n) => {
      const need = roomsNeeded(inv);
      const gr = need
        ? `${need} room(s) | ETA ${when(inv.guestroom_eta)} | ETD ${when(inv.guestroom_etd)}${inv.rooms.length ? ` | Allotted: ${inv.rooms.map((r) => r.name).join(', ')}` : ' | Allotment pending'}${inv.guestroom_note ? ` | ${inv.guestroom_note}` : ''}`
        : '-';
      rows.push([String(n + 1), [inv.rank, inv.name].filter(Boolean).join(' '), categoryLabel(inv.category),
        ...(withContacts ? [prettyMobile(inv.mobile)] : []),
        inv.handler_name || 'Unassigned', inv.rsvp_status === 'attending' ? 'Attending' : inv.rsvp_status === 'declined' ? 'Regret' : 'Pending',
        `${inv.members.length} person(s)`,
        ...fns.map((f) => String(inv.members.filter((m) => m.functions[f.id]?.attending).length || '-')),
        gr]);
      styles.push({ bold: true, fill: 'group' });
      for (const m of inv.members) {
        rows.push(['', `   ${m.name}${m.is_walkin ? ' (walk-in)' : ''}`, '', ...(withContacts ? [''] : []), '', '',
          `${RELATION_LABEL[m.relation] || m.relation} / ${AGE_LABEL[m.age_group]} / ${m.meal === 'veg' ? 'Veg' : 'Non-veg'}${m.meal_note ? ` (${m.meal_note})` : ''}`,
          ...fns.map((f) => yes(m.functions[f.id]?.attending)), '']);
        styles.push({});
      }
    });
    return { title: REPORTS.guests, subtitle: sub, sections: [{ columns, rows, rowStyle: (i) => styles[i], fontSize: 8 }] };
  }

  if (kind === 'attendance') {
    const sections = fns.map((f) => {
      const rows = [];
      for (const inv of invs) {
        for (const m of inv.members) {
          const mf = m.functions[f.id];
          if (!mf?.attending && !mf?.attendance) continue;
          const st = mf.attendance === 'present' ? (mf.attending && !m.is_walkin ? 'Present' : 'Present (walk-in)') : mf.attendance === 'absent' ? 'Absent' : 'Not marked';
          rows.push([m.name, RELATION_LABEL[m.relation] || m.relation, [inv.rank, inv.name].filter(Boolean).join(' '), categoryLabel(inv.category), st, mf.marked_at ? fmtShort(mf.marked_at) : '-', userName[mf.marked_by] || '-']);
        }
      }
      return {
        heading: `${f.name} - ${fmtDate(f.starts_at)} ${fmtHrs(f.starts_at)}`,
        columns: [{ label: 'Name', width: 2.2 }, { label: 'Relation', width: 1 }, { label: 'Party of', width: 2.2 }, { label: 'Category', width: 1.2 }, { label: 'Status', width: 1.3 }, { label: 'Marked at', width: 1.2 }, { label: 'Marked by', width: 1.4 }],
        rows,
        rowStyle: (i, r) => (r[4] === 'Absent' ? { color: 'red' } : {}),
      };
    });
    return { title: REPORTS.attendance, subtitle: sub, sections };
  }

  if (kind === 'catering') {
    const s = computeStats(invs, fns, rooms.length);
    const sections = fns.map((f) => {
      const F = s.functions[f.id];
      // counts by age x meal
      const grid = { adult: { veg: 0, nonveg: 0 }, child: { veg: 0, nonveg: 0 }, infant: { veg: 0, nonveg: 0 } };
      const notes = {};
      for (const inv of invs) for (const m of inv.members) {
        if (!m.functions[f.id]?.attending || m.is_walkin) continue;
        grid[m.age_group][m.meal]++;
        if (m.meal_note) { const key = m.meal_note.trim().toLowerCase(); notes[key] = (notes[key] || 0) + 1; }
      }
      return [
        { heading: `${f.name} - ${fmtDate(f.starts_at)} ${fmtHrs(f.starts_at)}`,
          columns: [{ label: 'Age group', width: 2 }, { label: 'Veg', width: 1, align: 'right' }, { label: 'Non-veg', width: 1, align: 'right' }, { label: 'Total', width: 1, align: 'right' }],
          rows: [...['adult', 'child', 'infant'].map((a) => [AGE_LABEL[a], grid[a].veg, grid[a].nonveg, grid[a].veg + grid[a].nonveg]),
            ['Total', F.heads.veg, F.heads.nonveg, F.heads.total]],
          rowStyle: (i) => (i === 3 ? { bold: true, fill: 'group' } : {}) },
        { heading: 'Dietary notes', columns: [{ label: 'Note', width: 4 }, { label: 'Count', width: 1, align: 'right' }],
          rows: Object.entries(notes).sort((a, b) => b[1] - a[1]).map(([n, c]) => [n, c]) },
      ];
    }).flat();
    return { title: REPORTS.catering, subtitle: 'Headcounts only. No personal details.', sections };
  }

  if (kind === 'rooms') {
    const byRoom = new Map();
    for (const inv of invs) for (const r of inv.rooms) byRoom.set(r.id, inv);
    const rows = rooms.map((r) => {
      const inv = byRoom.get(r.id);
      return [r.name, r.location || '-', inv ? [inv.rank, inv.name].filter(Boolean).join(' ') : 'VACANT', inv && withContacts ? prettyMobile(inv.mobile) : '-', inv ? when(inv.guestroom_eta) : '-', inv ? when(inv.guestroom_etd) : '-', inv?.guestroom_note || r.notes || '-'];
    });
    const waiting = invs.filter((inv) => roomsNeeded(inv) > inv.rooms.length).map((inv) => [
      [inv.rank, inv.name].filter(Boolean).join(' '), withContacts ? prettyMobile(inv.mobile) : '-', String(roomsNeeded(inv)), String(inv.rooms.length), when(inv.guestroom_eta), when(inv.guestroom_etd), inv.handler_name || '-',
    ]);
    const s = computeStats(invs, fns, rooms.length).guestroom;
    return {
      title: REPORTS.rooms,
      subtitle: `${s.total_rooms} rooms · ${s.rooms_allotted} allotted · ${s.vacant} vacant · ${s.still_needed} more required`,
      sections: [
        { heading: 'Rooms', columns: [{ label: 'Room', width: 1.2 }, { label: 'Location', width: 1.8 }, { label: 'Allotted to', width: 2.2 }, { label: 'Mobile', width: 1.4 }, { label: 'ETA', width: 1.4 }, { label: 'ETD', width: 1.4 }, { label: 'Comment', width: 2.4 }], rows, rowStyle: (i, r) => (r[2] === 'VACANT' ? { color: 'red' } : {}) },
        { heading: 'Officers awaiting allotment', columns: [{ label: 'Officer', width: 2.2 }, { label: 'Mobile', width: 1.4 }, { label: 'Rooms needed', width: 1, align: 'right' }, { label: 'Allotted', width: 1, align: 'right' }, { label: 'ETA', width: 1.4 }, { label: 'ETD', width: 1.4 }, { label: 'Looked after by', width: 1.6 }], rows: waiting },
      ],
    };
  }
  throw new Error('Unknown report');
}

export async function reportToPdf(rep, { regiment, eventName, user }) {
  return reportPdf({ ...rep, regiment, eventName, user });
}

export async function reportToXlsx(rep, { regiment, eventName, user }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = regiment;
  wb.created = new Date();
  const sheetName = rep.title.replace(/[\\/*?:[\]]/g, '').slice(0, 31);
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 4 }] });
  const stamp = `Generated on ${fmtStamp()} by ${user}`;
  ws.addRow([`${regiment} - ${eventName}`]).font = { bold: true, size: 14, color: { argb: 'FF00572D' } };
  ws.addRow([rep.title]).font = { bold: true, size: 12 };
  ws.addRow([`${rep.subtitle || ''}   |   ${stamp}`]).font = { italic: true, color: { argb: 'FFB40E0E' } };
  ws.addRow([]);
  let maxCols = 1;
  for (const sec of rep.sections) {
    if (sec.heading) {
      const r = ws.addRow([sec.heading]);
      r.font = { bold: true, size: 12, color: { argb: 'FF00572D' } };
    }
    if (sec.kv) {
      for (const [k, v] of sec.kv) ws.addRow([k, v]);
      ws.addRow([]);
      maxCols = Math.max(maxCols, 2);
      continue;
    }
    const head = ws.addRow(sec.columns.map((c) => c.label));
    head.eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00572D' } };
      c.alignment = { vertical: 'middle', wrapText: true };
    });
    sec.rows.forEach((row, i) => {
      const r = ws.addRow(row.map((v) => (typeof v === 'string' && /^\d+$/.test(v) && v.length < 9 ? Number(v) : v)));
      const st = sec.rowStyle ? sec.rowStyle(i, row) || {} : {};
      if (st.bold) r.font = { bold: true };
      if (st.fill) r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCEEE3' } }; });
      if (st.color === 'red') r.font = { color: { argb: 'FFB40E0E' } };
      r.alignment = { vertical: 'top', wrapText: true };
    });
    ws.addRow([]);
    maxCols = Math.max(maxCols, sec.columns.length);
    if (!sec._sized) {
      sec.columns.forEach((c, i) => {
        const col = ws.getColumn(i + 1);
        col.width = Math.max(col.width || 0, Math.min(60, Math.round((c.width || 1) * 12)));
      });
    }
  }
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  ws.headerFooter.oddFooter = `&L${regiment} - Restricted&C${stamp}&RPage &P of &N`;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
