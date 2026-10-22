import { db } from './db';
import { getEvent } from './data';
import { eventTemplates, renderMessage, waLink } from './templates';
import { regimentName } from './settings';
import { siteUrl } from './util';

// Build the WhatsApp message (invite or reminder) for one invitation.
export async function buildMessage(req, invId, kind) {
  const k = await db();
  const inv = await k('invitations as i').join('invitees as p', 'p.id', 'i.invitee_id').where('i.id', invId)
    .select('i.*', 'p.rank', 'p.name', 'p.mobile', 'p.lang').first();
  const ev = await getEvent(inv.event_id);
  const base = siteUrl(req);
  const tpls = eventTemplates(ev);
  const tpl = tpls[`${kind}_${inv.lang}`] || tpls[`${kind}_en`];
  // The card page shows the card (with a link preview image in WhatsApp) and offers the PDF.
  const pdfLink = `${base}/i/${inv.token}/card`;
  const text = renderMessage(tpl, {
    rank: inv.rank, name: inv.name, regiment: await regimentName(), event: ev, functions: ev.functions,
    link: `${base}/i/${inv.token}`, pin: inv.pin, pdfLink,
  });
  const fileName = `Invitation-${[inv.rank, inv.name].filter(Boolean).join(' ')}`.replace(/[^A-Za-z0-9]+/g, '-').replace(/-+$/, '');
  return { text, wa: waLink(inv.mobile, text), mobile: inv.mobile, pdfLink, cardPng: `${base}/i/${inv.token}/card.png`, fileName, cardMode: ev.card_mode, inv };
}

