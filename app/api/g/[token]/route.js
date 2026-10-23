import crypto from 'crypto';
import { handler, body, bad, audit } from '@/lib/api';
import { db } from '@/lib/db';
import { getEvent, loadInvitation, saveRsvp, displayName } from '@/lib/data';
import { guestAuthed, startGuestSession, endGuestSession, deadlinePassed, guestView } from '@/lib/guest';
import { notifyGuestChange } from '@/lib/notify';
import { roomsNeeded } from '@/lib/stats';
import { fmtShort } from '@/lib/util';

export const dynamic = 'force-dynamic';

function summary(inv, fns) {
  const parts = [];
  parts.push(inv.rsvp_status === 'attending' ? 'Attending' : inv.rsvp_status === 'declined' ? 'Regret' : 'Pending');
  for (const f of fns) {
    const n = inv.members.filter((m) => m.functions[f.id]?.attending).length;
    if (n) parts.push(`${f.name}: ${n}`);
  }
  if (roomsNeeded({ ...inv, rsvp_status: inv.rsvp_status })) {
    parts.push(`Guest room x${inv.rooms_required} (ETA ${fmtShort(inv.guestroom_eta)}, ETD ${fmtShort(inv.guestroom_etd)})`);
  }
  return parts.join(' · ');
}

export const POST = handler(async (req, { params }) => {
  const { token } = await params;
  if (!/^[A-Za-z0-9]{10,40}$/.test(token)) bad('Invalid link', 404);
  const b = await body(req);
  const k = await db();
  const inv = await k('invitations').where({ token }).first();
  if (!inv) bad('This invitation link is not valid.', 404);

  if (b.action === 'open') {
    // first time the guest's own phone shows the link (link previews don't run scripts, so they don't count)
    if (!inv.link_opened_at) await k('invitations').where({ id: inv.id }).update({ link_opened_at: new Date() });
    return { ok: true };
  }

  if (b.action === 'pin') {
    if (inv.pin_locked_until && new Date(inv.pin_locked_until) > new Date()) bad('locked', 429);
    const given = String(b.pin || '').trim();
    const ok = given.length === inv.pin.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(inv.pin));
    if (!ok) {
      const f = inv.pin_failures + 1;
      await k('invitations').where({ id: inv.id }).update({ pin_failures: f >= 5 ? 0 : f, pin_locked_until: f >= 5 ? new Date(Date.now() + 15 * 60000) : null });
      bad(f >= 5 ? 'locked' : 'wrong', f >= 5 ? 429 : 401);
    }
    const now = new Date();
    await k('invitations').where({ id: inv.id }).update({
      pin_failures: 0, pin_locked_until: null, guest_last_seen_at: now,
      ...(inv.pin_ok_at ? {} : { pin_ok_at: now }), ...(inv.link_opened_at ? {} : { link_opened_at: now }),
    });
    await startGuestSession(token, inv.id);
    return { ok: true };
  }

  const authed = await guestAuthed(token);
  if (authed !== inv.id) bad('Please enter your PIN again.', 401);

  if (b.action === 'view') return guestView(token);

  if (b.action === 'qr') {
    if (!inv.qr_viewed_at) await k('invitations').where({ id: inv.id }).update({ qr_viewed_at: new Date() });
    return { ok: true };
  }

  if (b.action === 'lock') {
    await endGuestSession(token);
    return { ok: true };
  }

  if (b.action === 'save') {
    const event = await getEvent(inv.event_id);
    if (deadlinePassed(event) || event.status === 'closed') bad('RSVP is closed. Please contact the organisers for any change.', 403);
    const before = await loadInvitation({ id: inv.id });
    await saveRsvp(inv.id, event, b);
    const after = await loadInvitation({ id: inv.id });
    const who = displayName(after.invitee);
    const was = summary(before, event.functions);
    const now = summary(after, event.functions);
    await audit({ actor: `Guest: ${who}`, eventId: event.id, invitationId: inv.id, action: 'guest.rsvp', details: `${was}  →  ${now}`, req });
    if (was !== now || before.members.length !== after.members.length) {
      const roomChange = before.guestroom_required !== after.guestroom_required || before.rooms_required !== after.rooms_required
        || String(before.guestroom_eta) !== String(after.guestroom_eta) || String(before.guestroom_etd) !== String(after.guestroom_etd);
      await notifyGuestChange({
        eventId: event.id, invitation: after,
        title: `${who} ${roomChange ? 'updated guest room / RSVP' : 'updated RSVP'}`,
        body: now,
        url: `/admin/e/${event.id}/guests/${inv.id}`,
      });
    }
    return guestView(token);
  }

  bad('Unknown action');
});
