import { db } from './db';
import { getEvent } from './data';
import { eventTemplates, renderMessage, waLink } from './templates';
import { regimentName } from './settings';
import { siteUrl } from './util';
import { guestPath } from './links';

// Build the WhatsApp message (invite or reminder) for one invitation.
export async function buildMessage(req, invId, kind) {
  const k = await db();
  const inv = await k('invitations as i').join('invitees as p', 'p.id', 'i.invitee_id').where('i.id', invId)
    .select('i.*', 'p.rank', 'p.name', 'p.mobile', 'p.lang').first();
  const ev = await getEvent(inv.event_id);
  const base = siteUrl(req);
  const tpls = eventTemplates(ev);
  const tpl = tpls[`${kind}_${inv.lang}`] || tpls[`${kind}_en`];
  // Readable links: /i/<event code>/<mobile> and …/invitation.pdf (both open with the PIN)
  const link = `${base}${guestPath(ev.code, inv)}`;
  const pdfLink = ev.card_mode === 'builtin' ? `${link}/invitation.pdf` : `${link}/card`;
  const text = renderMessage(tpl, {
    rank: inv.rank, name: inv.name, regiment: await regimentName(), event: ev, functions: ev.functions,
    link, pin: inv.pin, pdfLink,
  });
  const fileName = `Invitation-${[inv.rank, inv.name].filter(Boolean).join(' ')}`.replace(/[^A-Za-z0-9]+/g, '-').replace(/-+$/, '');
  return { text, wa: waLink(inv.mobile, text), mobile: inv.mobile, pdfLink, cardPng: `/i/${inv.token}/card.png`, link, fileName, cardMode: ev.card_mode, inv };
}

