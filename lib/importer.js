import ExcelJS from 'exceljs';
import { CATEGORIES, normalizeMobile, cleanName, isLatinName } from './util';

const HEAD = ['Category', 'Rank', 'Name', 'Mobile', 'City', 'Language (EN/HI/NE)', 'Extra guests allowed', 'Notes'];

export async function templateXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Invitees');
  ws.addRow(HEAD).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00572D' } };
  });
  ws.addRow(['Officer', 'Col', 'R K Thapa (example - delete)', '9811000021', 'Delhi', 'EN', 2, '']);
  ws.addRow(['Veteran', 'Hav (Retd)', 'Bishnu Gurung (example - delete)', '9436000008', 'Pokhara', 'NE', 2, '']);
  [12, 14, 34, 16, 16, 18, 18, 30].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  for (let r = 2; r <= 2000; r++) {
    ws.getCell(`A${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${CATEGORIES.map((c) => c.label).join(',')}"`] };
    ws.getCell(`F${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"EN,HI,NE"'] };
  }
  const help = wb.addWorksheet('How to fill');
  [
    'One row per invitee (the head of the family). Family members are added later by the guest on their own page.',
    `Category must be one of: ${CATEGORIES.map((c) => c.label).join(', ')} (Officer and Veteran also accepted).`,
    'Names in English letters only. Mobile: 10-digit Indian number, or full number with country code.',
    'Language decides which language the WhatsApp message is sent in: EN, HI (Hindi) or NE (Nepali).',
    'Extra guests allowed: guests besides spouse and children (e.g. parents). Leave blank to use the event default.',
    'Duplicates are detected by mobile number and are skipped.',
  ].forEach((t) => help.addRow([t]));
  help.getColumn(1).width = 120;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function catFrom(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith('off') || s === 'serving officer') return 'officer';
  if (s.startsWith('vet') || s.includes('retd')) return 'veteran';
  if (s.startsWith('jco') || s.includes(' or') || s === 'or' || s.includes('other rank')) return 'jco_or';
  if (s.includes('veer') || s.includes('vir')) return 'veer_nari';
  if (s.startsWith('civ') || s.includes('guest')) return 'civilian';
  const exact = CATEGORIES.find((c) => c.id === s || c.label.toLowerCase() === s);
  return exact ? exact.id : null;
}

function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.text) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v.richText) return v.richText.map((r) => r.text).join('');
  }
  return String(v);
}

/** Returns { rows:[{category,rank,name,mobile,city,lang,extra_cap,notes}], errors:[{row,msg}] } */
export async function parseInviteesXlsx(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], errors: [{ row: 0, msg: 'The file has no sheets.' }] };
  const rows = []; const errors = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const v = (i) => cellText(row.getCell(i).value).trim();
    const name = cleanName(v(3));
    if (!name && !v(1) && !v(4)) return;
    if (/example - delete/i.test(name)) return;
    const category = catFrom(v(1));
    const mobile = normalizeMobile(v(4));
    if (!category) { errors.push({ row: n, msg: `Unknown category "${v(1)}"` }); return; }
    if (!name) { errors.push({ row: n, msg: 'Name is missing' }); return; }
    if (!isLatinName(name)) { errors.push({ row: n, msg: `"${name}": use English letters` }); return; }
    if (v(4) && !mobile) { errors.push({ row: n, msg: `"${v(4)}" is not a valid mobile number` }); return; }
    const lang = ({ hi: 'hi', ne: 'ne', np: 'ne' })[v(6).toLowerCase()] || 'en';
    const cap = v(7) === '' ? null : Math.max(0, Math.min(10, parseInt(v(7), 10) || 0));
    rows.push({ category, rank: cleanName(v(2)).slice(0, 60) || null, name, mobile, city: cleanName(v(5)).slice(0, 100) || null, lang, extra_cap: cap, notes: v(8).slice(0, 300) || null, row: n });
  });
  return { rows, errors };
}
