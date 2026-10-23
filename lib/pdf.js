import { PDFDocument, rgb, PDFName, PDFString } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import { assetBytes, getLogo } from './settings';
import { fmtDate, fmtHrs, fmtStamp } from './util';

export const GREEN = rgb(0, 87 / 255, 45 / 255);
export const RED = rgb(1, 40 / 255, 40 / 255);
const BLACK = rgb(0.08, 0.08, 0.08);
const GREY = rgb(0.4, 0.4, 0.4);
const LIGHT = rgb(0.94, 0.97, 0.95);
const WHITE = rgb(1, 1, 1);

async function setup() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = {
    goth: await doc.embedFont(assetBytes('grenze-gotisch-latin-700-normal.woff'), { subset: true }),
    gothM: await doc.embedFont(assetBytes('grenze-gotisch-latin-600-normal.woff'), { subset: true }),
    body: await doc.embedFont(assetBytes('mukta-latin-400-normal.woff'), { subset: true }),
    semi: await doc.embedFont(assetBytes('mukta-latin-600-normal.woff'), { subset: true }),
    bold: await doc.embedFont(assetBytes('mukta-latin-700-normal.woff'), { subset: true }),
  };
  const logo = await doc.embedPng(await getLogo(512));
  return { doc, fonts, logo };
}

// Keep only characters the Latin fonts can draw.
export function safe(s) {
  return String(s ?? '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E -ÿ]/g, '?');
}

function addLink(doc, page, rect, url) {
  const annot = doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Link', Rect: rect, Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
  }));
  const existing = page.node.lookup(PDFName.of('Annots'));
  if (existing) existing.push(annot);
  else page.node.set(PDFName.of('Annots'), doc.context.obj([annot]));
}

function drawPin(page, x, y, s) {
  // map-pin icon: red circle + point + white dot
  page.drawCircle({ x, y: y + s * 0.62, size: s * 0.42, color: RED });
  page.drawSvgPath(`M ${-s * 0.36} 0 L ${s * 0.36} 0 L 0 ${s * 0.62} Z`, { x, y: y + s * 0.5, color: RED });
  page.drawCircle({ x, y: y + s * 0.64, size: s * 0.16, color: WHITE });
  page.drawEllipse({ x, y: y - s * 0.02, xScale: s * 0.32, yScale: s * 0.08, borderColor: RED, borderWidth: 1.2 });
}

/**
 * Personalised invitation card in the regiment's design.
 * opts: { event, functions, invitee:{rank,name}, regiment, checkinCode }
 */
export async function invitationPdf(opts) {
  const { doc, fonts, logo } = await setup();
  const W = 960, H = 540;
  const page = doc.addPage([W, H]);
  const { event, functions, invitee, regiment, checkinCode } = opts;

  // Border bands, measured from the original card (green / red / green / white)
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: GREEN });
  page.drawRectangle({ x: 9.6, y: 9.6, width: W - 19.2, height: H - 19.2, color: RED });
  page.drawRectangle({ x: 19.2, y: 19.2, width: W - 38.4, height: H - 38.4, color: GREEN });
  page.drawRectangle({ x: 30.4, y: 30.4, width: W - 60.8, height: H - 60.8, color: WHITE });

  // Crest
  const cs = 98;
  page.drawImage(logo, { x: (W - cs) / 2, y: H - 44 - cs, width: cs, height: cs });

  // Entry QR (top-right)
  if (checkinCode) {
    const png = await QRCode.toBuffer(`KLN-${checkinCode}`, { margin: 1, width: 300, color: { dark: '#00572D', light: '#FFFFFF' } });
    const qr = await doc.embedPng(png);
    const qs = 72;
    page.drawImage(qr, { x: W - 50 - qs, y: H - 48 - qs, width: qs, height: qs });
    const cap = 'Entry pass';
    page.drawText(cap, { x: W - 50 - qs / 2 - fonts.semi.widthOfTextAtSize(cap, 8.5) / 2, y: H - 48 - qs - 11, size: 8.5, font: fonts.semi, color: GREEN });
  }

  // Main text lines
  const who = safe([invitee.rank, invitee.name].filter(Boolean).join(' '));
  const fns = functions || [];
  const lines = [];
  lines.push({ t: safe(event.card_host || 'The Commanding Officer and all Officers') });
  lines.push({ t: safe(event.card_unit || regiment) });
  lines.push({ t: 'request the pleasure of the company of' });
  lines.push({ t: who, color: GREEN, scale: 1.06 });
  if (fns.length === 1) {
    const f = fns[0];
    lines.push({ t: `to ${safe(f.name)}` });
    lines.push({ t: `at ${fmtHrs(f.starts_at)} on ${fmtDate(f.starts_at)}` });
    lines.push({ t: `at ${safe(f.venue || event.venue || '')}.` });
  } else {
    lines.push({ t: `to ${safe(event.name)}` });
    for (const f of fns) lines.push({ t: `${safe(f.name)} at ${fmtHrs(f.starts_at)} on ${fmtDate(f.starts_at)}`, scale: 0.82 });
    if (event.venue) lines.push({ t: `at ${safe(event.venue)}.` });
  }

  const top = H - 44 - cs - 10;
  const bottom = 92;
  const maxW = W - 2 * 70;
  let size = 34;
  const lh = 1.12;
  const fits = (s) => {
    const total = lines.reduce((a, l) => a + s * (l.scale || 1) * lh, 0);
    const wide = lines.every((l) => fonts.goth.widthOfTextAtSize(l.t, s * (l.scale || 1)) <= maxW);
    return total <= top - bottom && wide;
  };
  while (size > 12 && !fits(size)) size -= 0.5;
  const total = lines.reduce((a, l) => a + size * (l.scale || 1) * lh, 0);
  let y = top - ((top - bottom) - total) / 2;
  for (const l of lines) {
    const s = size * (l.scale || 1);
    y -= s * lh;
    const w = fonts.goth.widthOfTextAtSize(l.t, s);
    page.drawText(l.t, { x: (W - w) / 2, y: y + s * 0.22, size: s, font: fonts.goth, color: l.color || BLACK });
  }

  // Bottom row: dress (right), note (centre). Directions go in the WhatsApp message.
  const rowY = 64;
  const dresses = [...new Set(fns.map((f) => f.dress).filter(Boolean))];
  if (dresses.length === 1) {
    const t = `Dress : ${safe(dresses[0])}`;
    const ts = 18;
    page.drawText(t, { x: W - 70 - fonts.bold.widthOfTextAtSize(t, ts), y: rowY, size: ts, font: fonts.bold, color: BLACK });
  }
  if (event.card_note) {
    const t = safe(event.card_note);
    let ts = 17;
    while (ts > 9 && fonts.goth.widthOfTextAtSize(t, ts) > W - 140) ts -= 0.5;
    page.drawText(t, { x: (W - fonts.goth.widthOfTextAtSize(t, ts)) / 2, y: 40, size: ts, font: fonts.goth, color: BLACK });
  }
  doc.setTitle(`Invitation - ${who}`);
  doc.setAuthor(regiment);
  return Buffer.from(await doc.save());
}

// ---------- Reports ----------

function wrap(text, font, size, width) {
  const words = safe(text).split(/(\s+)/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const cand = cur + w;
    if (font.widthOfTextAtSize(cand.trimEnd(), size) <= width || !cur.trim()) {
      cur = cand;
      // hard-break very long single words
      while (font.widthOfTextAtSize(cur.trimEnd(), size) > width && cur.length > 1) {
        let i = cur.length - 1;
        while (i > 1 && font.widthOfTextAtSize(cur.slice(0, i), size) > width) i--;
        lines.push(cur.slice(0, i));
        cur = cur.slice(i);
      }
    } else {
      lines.push(cur.trimEnd());
      cur = w.trimStart();
    }
  }
  if (cur.trim() || !lines.length) lines.push(cur.trimEnd());
  return lines;
}

/**
 * Build a stamped report.
 * spec: { title, subtitle, regiment, eventName, user, sections: [ {heading?, columns:[{label,width,align}], rows:[[...]] , rowStyle?(i)} | {heading, kv:[[k,v],...]} ] }
 */
export async function reportPdf(spec) {
  const { doc, fonts, logo } = await setup();
  const W = 842, H = 595, M = 32;
  const stamp = `Generated on ${fmtStamp()} by ${safe(spec.user)}`;
  const pages = [];
  let page, y;

  const newPage = () => {
    page = doc.addPage([W, H]);
    pages.push(page);
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: GREEN });
    page.drawRectangle({ x: 0, y: H - 9, width: W, height: 3, color: RED });
    page.drawImage(logo, { x: M, y: H - 70, width: 48, height: 48 });
    page.drawText(safe(`${spec.regiment} - ${spec.eventName}`), { x: M + 58, y: H - 38, size: 17, font: fonts.goth, color: GREEN });
    page.drawText(safe(spec.title), { x: M + 58, y: H - 58, size: 13, font: fonts.bold, color: BLACK });
    if (spec.subtitle) page.drawText(safe(spec.subtitle), { x: M + 58, y: H - 72, size: 9, font: fonts.body, color: GREY });
    const sw = fonts.semi.widthOfTextAtSize(stamp, 8.5);
    page.drawText(stamp, { x: W - M - sw, y: H - 38, size: 8.5, font: fonts.semi, color: RED });
    y = H - 86;
  };

  const ensure = (h, header) => {
    if (y - h < 40) { newPage(); if (header) header(); }
  };

  newPage();
  const tableW = W - 2 * M;

  for (const sec of spec.sections) {
    if (sec.heading) {
      ensure(40);
      y -= 8;
      page.drawText(safe(sec.heading), { x: M, y: y - 12, size: 12, font: fonts.bold, color: GREEN });
      y -= 20;
    }
    if (sec.kv) {
      const colW = [tableW * 0.45, tableW * 0.55];
      for (const [i, [k, v]] of sec.kv.entries()) {
        ensure(18);
        if (i % 2 === 0) page.drawRectangle({ x: M, y: y - 17, width: tableW, height: 17, color: LIGHT });
        page.drawText(safe(k), { x: M + 6, y: y - 12.5, size: 9.5, font: fonts.body, color: BLACK });
        page.drawText(safe(v), { x: M + colW[0], y: y - 12.5, size: 9.5, font: fonts.bold, color: BLACK });
        y -= 17;
      }
      y -= 6;
      continue;
    }
    const cols = sec.columns;
    const totalUnits = cols.reduce((a, c) => a + (c.width || 1), 0);
    const widths = cols.map((c) => ((c.width || 1) / totalUnits) * tableW);
    const fs = sec.fontSize || 8.5;
    const drawHeader = () => {
      const hl = cols.map((c, i) => wrap(c.label, fonts.bold, fs, widths[i] - 8));
      const hh = Math.max(...hl.map((l) => l.length)) * (fs + 2) + 8;
      page.drawRectangle({ x: M, y: y - hh, width: tableW, height: hh, color: GREEN });
      let x = M;
      hl.forEach((ls, i) => {
        ls.forEach((t, j) => page.drawText(t, { x: x + 4, y: y - 6 - fs - j * (fs + 2) + 1, size: fs, font: fonts.bold, color: WHITE }));
        x += widths[i];
      });
      y -= hh;
    };
    ensure(40);
    drawHeader();
    if (!sec.rows.length) {
      page.drawText('No records.', { x: M + 6, y: y - 14, size: 9, font: fonts.body, color: GREY });
      y -= 22;
      continue;
    }
    sec.rows.forEach((row, ri) => {
      const style = sec.rowStyle ? sec.rowStyle(ri, row) : {};
      const font = style.bold ? fonts.semi : fonts.body;
      const cells = row.map((v, i) => wrap(v ?? '', font, fs, widths[i] - 8));
      const rh = Math.max(...cells.map((l) => l.length)) * (fs + 2) + 6;
      ensure(rh, drawHeader);
      if (style.fill) page.drawRectangle({ x: M, y: y - rh, width: tableW, height: rh, color: style.fill === 'group' ? rgb(0.86, 0.93, 0.89) : LIGHT });
      else if (ri % 2 === 1) page.drawRectangle({ x: M, y: y - rh, width: tableW, height: rh, color: rgb(0.975, 0.985, 0.98) });
      let x = M;
      cells.forEach((ls, i) => {
        const al = cols[i].align;
        ls.forEach((t, j) => {
          const tw = font.widthOfTextAtSize(t, fs);
          const tx = al === 'right' ? x + widths[i] - 4 - tw : al === 'center' ? x + (widths[i] - tw) / 2 : x + 4;
          page.drawText(t, { x: tx, y: y - 3 - fs - j * (fs + 2) + 1, size: fs, font, color: style.color === 'red' ? RED : BLACK });
        });
        x += widths[i];
      });
      page.drawLine({ start: { x: M, y: y - rh }, end: { x: M + tableW, y: y - rh }, thickness: 0.4, color: rgb(0.85, 0.88, 0.86) });
      y -= rh;
    });
    y -= 10;
  }

  pages.forEach((p, i) => {
    const t = `Page ${i + 1} of ${pages.length}`;
    p.drawText(t, { x: W - M - fonts.body.widthOfTextAtSize(t, 8), y: 18, size: 8, font: fonts.body, color: GREY });
    p.drawText(safe(`${spec.regiment} - Restricted. Do not forward.`), { x: M, y: 18, size: 8, font: fonts.body, color: GREY });
    p.drawText(stamp, { x: (W - fonts.body.widthOfTextAtSize(stamp, 7.5)) / 2, y: 18, size: 7.5, font: fonts.body, color: GREY });
  });
  doc.setTitle(`${spec.title} - ${spec.eventName}`);
  doc.setAuthor(spec.regiment);
  return Buffer.from(await doc.save());
}
