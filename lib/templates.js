// WhatsApp message templates (per event, per language) and rendering.
import { fmtDate, fmtHrs, fmtDateHrs } from './util';

export const PLACEHOLDERS = [
  ['{Rank}', 'Rank of invitee'],
  ['{Name}', 'Name of invitee'],
  ['{Regiment}', 'Regiment name'],
  ['{EventName}', 'Event name'],
  ['{Functions}', 'List of functions with date & time'],
  ['{Venue}', 'Event venue'],
  ['{Directions}', 'Google Maps link'],
  ['{Link}', "Invitee's personal link"],
  ['{PIN}', "Invitee's PIN"],
  ['{PdfLink}', 'Link to personalised PDF invitation'],
  ['{Deadline}', 'RSVP deadline'],
];

export const DEFAULT_TEMPLATES = {
  invite_en:
`Dear {Rank} {Name},

{Regiment} cordially invites you and your family to *{EventName}*.

{Functions}
📍 {Venue}

Your invitation card: {PdfLink}

Please confirm attendance and add your family members here:
{Link}
Your PIN: *{PIN}*

Kindly respond by {Deadline}.`,
  invite_hi:
`आदरणीय {Rank} {Name},

{Regiment} आपको एवं आपके परिवार को *{EventName}* में सादर आमंत्रित करता है।

{Functions}
📍 {Venue}

आपका निमंत्रण पत्र: {PdfLink}

कृपया अपनी उपस्थिति की पुष्टि करें और परिवार के सदस्यों के नाम यहाँ जोड़ें:
{Link}
आपका PIN: *{PIN}*

कृपया {Deadline} तक उत्तर दें।`,
  invite_ne:
`आदरणीय {Rank} {Name},

{Regiment} ले तपाईं र तपाईंको परिवारलाई *{EventName}* मा सादर निमन्त्रणा गर्दछ।

{Functions}
📍 {Venue}

तपाईंको निमन्त्रणा पत्र: {PdfLink}

कृपया उपस्थिति पुष्टि गर्नुहोस् र परिवारका सदस्यहरूको नाम यहाँ थप्नुहोस्:
{Link}
तपाईंको PIN: *{PIN}*

कृपया {Deadline} सम्म जवाफ दिनुहोस्।`,
  reminder_en:
`Dear {Rank} {Name},

A warm reminder: *{EventName}* is today.

{Functions}
📍 {Venue}
Directions: {Directions}

Please keep your entry QR ready at the gate. Open it here:
{Link}
PIN: *{PIN}*

We look forward to welcoming you and your family.`,
  reminder_hi:
`आदरणीय {Rank} {Name},

स्मरण: *{EventName}* आज है।

{Functions}
📍 {Venue}
रास्ता: {Directions}

कृपया प्रवेश द्वार पर अपना QR कोड तैयार रखें। यहाँ खोलें:
{Link}
PIN: *{PIN}*

आपका और आपके परिवार का स्वागत करने के लिए हम उत्सुक हैं।`,
  reminder_ne:
`आदरणीय {Rank} {Name},

सम्झना: *{EventName}* आज हो।

{Functions}
📍 {Venue}
बाटो: {Directions}

कृपया प्रवेशद्वारमा आफ्नो QR कोड तयार राख्नुहोस्। यहाँ खोल्नुहोस्:
{Link}
PIN: *{PIN}*

तपाईं र तपाईंको परिवारलाई स्वागत गर्न हामी उत्सुक छौं।`,
};

export function eventTemplates(ev) {
  let t = {};
  try { t = ev?.templates ? JSON.parse(ev.templates) : {}; } catch {}
  return { ...DEFAULT_TEMPLATES, ...Object.fromEntries(Object.entries(t).filter(([, v]) => v && v.trim())) };
}

export function functionLines(fns) {
  return fns
    .map((f) => `🗓 ${f.name}: ${fmtDate(f.starts_at)}, ${fmtHrs(f.starts_at)}${f.dress ? ` (Dress: ${f.dress})` : ''}`)
    .join('\n');
}

export function renderMessage(tpl, ctx) {
  const map = {
    '{Rank}': ctx.rank || '',
    '{Name}': ctx.name || '',
    '{Regiment}': ctx.regiment || '',
    '{EventName}': ctx.event?.name || '',
    '{Functions}': functionLines(ctx.functions || []),
    '{Venue}': ctx.event?.venue || ctx.functions?.[0]?.venue || '',
    '{Directions}': ctx.event?.map_url || ctx.functions?.[0]?.map_url || '',
    '{Link}': ctx.link || '',
    '{PIN}': ctx.pin || '',
    '{PdfLink}': ctx.pdfLink || '',
    '{Deadline}': ctx.event?.rsvp_deadline ? fmtDateHrs(ctx.event.rsvp_deadline) : 'the earliest',
  };
  let out = tpl;
  for (const [k, v] of Object.entries(map)) out = out.split(k).join(v);
  return out.replace(/  +/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function waLink(mobile, text) {
  return `https://wa.me/${mobile || ''}?text=${encodeURIComponent(text)}`;
}
