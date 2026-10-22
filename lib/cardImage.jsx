// Personalised invitation card as a PNG image (same layout as the PDF card).
// Used for sharing the card on WhatsApp and for link previews.
import { ImageResponse } from 'next/og';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import { assetBytes, getLogo } from './settings';
import { fmtDate, fmtHrs } from './util';
import { safe } from './pdf';

const GREEN = '#00572D';
const RED = '#FF2828';
const W = 960;
const H = 540;

const g = globalThis;
function fonts() {
  if (!g.__klCardFonts) {
    const goth = assetBytes('grenze-gotisch-latin-700-normal.woff');
    g.__klCardFonts = {
      gothFk: fontkit.create(goth),
      list: [
        { name: 'Grenze', data: goth, weight: 700, style: 'normal' },
        { name: 'Mukta', data: assetBytes('mukta-latin-600-normal.woff'), weight: 600, style: 'normal' },
        { name: 'Mukta', data: assetBytes('mukta-latin-700-normal.woff'), weight: 700, style: 'normal' },
      ],
    };
  }
  return g.__klCardFonts;
}
const textWidth = (fk, text, size) => (fk.layout(text).advanceWidth / fk.unitsPerEm) * size;

function cardLines(event, fns, invitee, regiment) {
  const lines = [
    { t: safe(event.card_host || 'The Commanding Officer and all Officers') },
    { t: safe(event.card_unit || regiment) },
    { t: 'request the pleasure of the company of' },
    { t: safe([invitee.rank, invitee.name].filter(Boolean).join(' ')), color: GREEN, scale: 1.06 },
  ];
  if (fns.length === 1) {
    const f = fns[0];
    lines.push({ t: `to ${safe(f.name)}` });
    lines.push({ t: `on ${fmtDate(f.starts_at)} at ${fmtHrs(f.starts_at)}` });
    lines.push({ t: `at ${safe(f.venue || event.venue || '')}.` });
  } else {
    lines.push({ t: `to ${safe(event.name)}` });
    for (const f of fns) lines.push({ t: `${safe(f.name)} - ${fmtDate(f.starts_at)} at ${fmtHrs(f.starts_at)}`, scale: 0.82 });
    if (event.venue) lines.push({ t: `at ${safe(event.venue)}.` });
  }
  return lines;
}

/**
 * opts: { event, functions, invitee:{rank,name}, regiment, checkinCode?, preview? }
 * preview: 1200 x 630 link-preview image (no entry QR). Otherwise a sharp 1920 x 1080 card.
 */
export async function cardImage(opts) {
  const { event, functions = [], invitee, regiment, checkinCode, preview } = opts;
  const F = fonts();
  const S = preview ? 630 / H : 2; // scale
  const px = (n) => Math.round(n * S * 10) / 10;

  const crest = `data:image/png;base64,${Buffer.from(await getLogo(512)).toString('base64')}`;
  const qr = !preview && checkinCode
    ? await QRCode.toDataURL(`KLN-${checkinCode}`, { margin: 1, width: 300, color: { dark: GREEN, light: '#FFFFFF' } })
    : null;

  // Fit the text block the same way the PDF does
  const lines = cardLines(event, functions, invitee, regiment);
  const top = 44 + 98 + 10; // below the crest
  const bottom = H - 92; // above the footer row
  const maxW = W - 140;
  const lh = 1.12;
  let size = 34;
  const fits = (s) => lines.reduce((a, l) => a + s * (l.scale || 1) * lh, 0) <= bottom - top
    && lines.every((l) => textWidth(F.gothFk, l.t, s * (l.scale || 1)) <= maxW);
  while (size > 12 && !fits(size)) size -= 0.5;

  const dresses = [...new Set(functions.map((f) => f.dress).filter(Boolean))];
  const mapUrl = (functions.length === 1 && functions[0].map_url) || event.map_url;
  let noteSize = 17;
  const note = event.card_note ? safe(event.card_note) : '';
  while (note && noteSize > 9 && textWidth(F.gothFk, note, noteSize) > W - 140) noteSize -= 0.5;

  const abs = (l, t, w, h, extra = {}) => ({ position: 'absolute', left: px(l), top: px(t), width: px(w), height: px(h), display: 'flex', ...extra });

  const card = (
    <div style={{ width: px(W), height: px(H), display: 'flex', position: 'relative', background: GREEN }}>
      <div style={abs(9.6, 9.6, W - 19.2, H - 19.2, { background: RED })} />
      <div style={abs(19.2, 19.2, W - 38.4, H - 38.4, { background: GREEN })} />
      <div style={abs(30.4, 30.4, W - 60.8, H - 60.8, { background: '#ffffff' })} />
      <img src={crest} alt="" width={px(98)} height={px(98)} style={{ position: 'absolute', left: px((W - 98) / 2), top: px(44) }} />
      {qr && <img src={qr} alt="" width={px(72)} height={px(72)} style={{ position: 'absolute', left: px(W - 50 - 72), top: px(48) }} />}
      {qr && <div style={abs(W - 50 - 72 - 10, 48 + 72 + 1, 92, 14, { justifyContent: 'center', fontFamily: 'Mukta', fontWeight: 600, fontSize: px(9), color: GREEN })}>Entry pass</div>}
      <div style={abs(70, top, W - 140, bottom - top, { flexDirection: 'column', alignItems: 'center', justifyContent: 'center' })}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'flex', fontFamily: 'Grenze', fontWeight: 700, fontSize: px(size * (l.scale || 1)), lineHeight: lh, color: l.color || '#141414', whiteSpace: 'nowrap' }}>{l.t}</div>
        ))}
      </div>
      {mapUrl && (
        <div style={abs(62, H - 64 - 22, 400, 28, { alignItems: 'center', gap: px(10), fontFamily: 'Mukta', fontWeight: 700, fontSize: px(17), color: '#141414' })}>
          <svg width={px(26)} height={px(30)} viewBox="0 0 26 30"><path d="M13 1C7.5 1 3.5 5 3.5 10.3c0 6.4 9.5 15.2 9.5 15.2s9.5-8.8 9.5-15.2C22.5 5 18.5 1 13 1z" fill={RED} /><circle cx="13" cy="10.3" r="3.6" fill="#fff" /><ellipse cx="13" cy="27.3" rx="8" ry="2" fill="none" stroke={RED} strokeWidth="1.3" /></svg>
          <span style={{ textDecoration: 'underline' }}>Please Click Here for Directions</span>
        </div>
      )}
      {dresses.length === 1 && (
        <div style={abs(W - 470, H - 64 - 22, 400, 28, { justifyContent: 'flex-end', alignItems: 'center', fontFamily: 'Mukta', fontWeight: 700, fontSize: px(18), color: '#141414' })}>{`Dress : ${safe(dresses[0])}`}</div>
      )}
      {note && (
        <div style={abs(70, H - 40 - noteSize, W - 140, noteSize * 1.3, { justifyContent: 'center', fontFamily: 'Grenze', fontWeight: 700, fontSize: px(noteSize), color: '#141414' })}>{note}</div>
      )}
    </div>
  );

  const width = preview ? 1200 : px(W);
  const height = preview ? 630 : px(H);
  const root = preview
    ? <div style={{ width, height, display: 'flex', justifyContent: 'center', alignItems: 'center', background: GREEN }}>{card}</div>
    : card;
  return new ImageResponse(root, { width, height, fonts: F.list });
}
