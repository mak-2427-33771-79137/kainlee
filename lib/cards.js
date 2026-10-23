// Editable HTML invitation cards (per event, or shared by a series of events).
// Cards are authored for a 960 x 540 canvas. Admin HTML is sanitised (no scripts,
// no event handlers); guest values are HTML-escaped before insertion.
import sanitizeHtml from 'sanitize-html';
import { fmtDate, fmtHrs } from './util';

export const CARD_W = 960;
export const CARD_H = 540;

export const CARD_PLACEHOLDERS = [
  ['{FullName}', 'Rank and name of invitee'],
  ['{Rank}', 'Rank only'],
  ['{Name}', 'Name only'],
  ['{Host}', 'Host line, e.g. The Commanding Officer and all Officers'],
  ['{Unit}', 'Regiment / unit line'],
  ['{EventName}', 'Event name'],
  ['{FunctionsLines}', 'Programme lines with date and time (HTML)'],
  ['{Venue}', 'Venue'],
  ['{Dress}', 'Dress (when all functions share one)'],
  ['{Directions}', 'Google Maps link (use in href)'],
  ['{Note}', 'Footer note, e.g. Ladies & Children are cordially invited'],
  ['{Crest}', 'Crest image (use in img src)'],
  ['{QR}', 'Entry QR image (use in img src)'],
];

export const DEFAULT_CARD_HTML = `<style>
.kc{width:960px;height:540px;box-sizing:border-box;background:#00572D;padding:9.6px;font-family:'Grenze Gotisch',Georgia,serif;color:#111}
.kc .r{background:#FF2828;padding:9.6px;height:100%;box-sizing:border-box}
.kc .g{background:#00572D;padding:11.2px;height:100%;box-sizing:border-box}
.kc .w{position:relative;background:#fff;height:100%;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;text-align:center;padding:12px 70px 10px}
.kc .crest{width:98px;height:98px}
.kc .qr{position:absolute;right:20px;top:18px;width:72px;height:72px}
.kc .qrc{position:absolute;right:20px;top:92px;width:72px;font:600 9px Mukta,sans-serif;color:#00572D}
.kc .lines{flex:1;display:flex;flex-direction:column;justify-content:center;font-weight:700;font-size:30px;line-height:1.12}
.kc .nm{color:#00572D;font-size:33px}
.kc .foot{width:100%;display:flex;justify-content:space-between;align-items:center;font:700 17px Mukta,sans-serif}
.kc .foot a{color:#111;text-decoration:underline}
.kc .note{font-weight:700;font-size:17px;margin-top:2px}
</style>
<div class="kc"><div class="r"><div class="g"><div class="w">
  <img class="crest" src="{Crest}" alt="Crest">
  <img class="qr" src="{QR}" alt="Entry QR"><div class="qrc">Entry pass</div>
  <div class="lines">
    <div>{Host}</div>
    <div>{Unit}</div>
    <div>request the pleasure of the company of</div>
    <div class="nm">{FullName}</div>
    <div>{FunctionsLines}</div>
    <div>at {Venue}.</div>
  </div>
  <div class="foot"><span></span><span class="dress">Dress : {Dress}</span></div>
  <div class="note">{Note}</div>
</div></div></div></div>`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function sanitizeCard(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'style', 'span', 'div', 'section', 'header', 'footer', 'h1', 'h2', 'h3', 'center', 'font', 'small', 'big', 'sup', 'sub']),
    allowVulnerableTags: true, // <style> is needed for card design; scripts are still removed
    allowedAttributes: { '*': ['style', 'class', 'id', 'align', 'width', 'height', 'title'], a: ['href', 'target', 'rel'], img: ['src', 'alt', 'width', 'height', 'style', 'class'] },
    allowedSchemes: ['https', 'http', 'data', 'tel', 'mailto'],
    allowedSchemesByTag: { img: ['https', 'http', 'data'] },
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    nonTextTags: ['script', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed'],
    // placeholders like {Crest} must survive inside src/href
    transformTags: {},
  });
}

function functionsLines(event, fns) {
  if (fns.length === 1) {
    const f = fns[0];
    return `to ${esc(f.name)}<br>at ${esc(fmtHrs(f.starts_at))} on ${esc(fmtDate(f.starts_at))}`;
  }
  return [`to ${esc(event.name)}`, ...fns.map((f) => `${esc(f.name)} at ${esc(fmtHrs(f.starts_at))} on ${esc(fmtDate(f.starts_at))}`)].join('<br>');
}

/** ctx: { event, functions, invitee:{rank,name}, regiment, crestUrl, qrUrl } */
export function renderCard(template, ctx) {
  const { event, functions: fns = [], invitee = {} } = ctx;
  const dresses = [...new Set(fns.map((f) => f.dress).filter(Boolean))];
  const text = {
    '{FullName}': esc([invitee.rank, invitee.name].filter(Boolean).join(' ')),
    '{Rank}': esc(invitee.rank || ''),
    '{Name}': esc(invitee.name || ''),
    '{Host}': esc(event.card_host || 'The Commanding Officer and all Officers'),
    '{Unit}': esc(event.card_unit || ctx.regiment || ''),
    '{EventName}': esc(event.name || ''),
    '{Venue}': esc((fns.length === 1 && fns[0].venue) || event.venue || ''),
    '{Dress}': esc(dresses.length === 1 ? dresses[0] : dresses.join(' / ')),
    '{Note}': esc(event.card_note || ''),
    '{FunctionsLines}': functionsLines(event, fns),
    // URLs: must not contain quotes; esc() covers that
    '{Directions}': esc((fns.length === 1 && fns[0].map_url) || event.map_url || '#'),
    '{Crest}': esc(ctx.crestUrl || ''),
    '{QR}': esc(ctx.qrUrl || ''),
  };
  let out = sanitizeCard(template || DEFAULT_CARD_HTML);
  // The directions link is sent in the WhatsApp message instead of printed on the card,
  // so remove it from older/custom designs too.
  out = out.replace(/<a\b[^>]*href="\{Directions\}"[^>]*>[\s\S]*?<\/a>/gi, '');
  // no dress code: hide the empty "Dress :" label
  if (!dresses.length) out = out.replace(/<span class="dress">[\s\S]*?<\/span>/g, '').replace(/Dress\s*:\s*\{Dress\}/g, '');
  for (const [k, v] of Object.entries(text)) out = out.split(k).join(v);
  return out;
}

// Which template applies to this event (event's own, its series', or the built-in default)
export function cardTemplateFor(event, series) {
  if (event.card_mode === 'event' && event.card_html) return { source: 'event', html: event.card_html };
  if (event.card_mode === 'series' && series?.card_html) return { source: 'series', html: series.card_html };
  return { source: 'builtin', html: null };
}
