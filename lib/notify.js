// In-app notifications + Web Push (works on Android/desktop browsers, and on
// iPhone/iPad when the site is installed to the Home Screen, iOS 16.4+).
import webpush from 'web-push';
import { db } from './db';
import { getSetting } from './settings';

async function vapid() {
  let pub = await getSetting('vapid_public');
  let priv = await getSetting('vapid_private');
  if (!pub || !priv) {
    const keys = webpush.generateVAPIDKeys();
    const k = await db();
    await k('settings').insert({ key: 'vapid_public', value: keys.publicKey }).onConflict('key').ignore();
    await k('settings').insert({ key: 'vapid_private', value: keys.privateKey }).onConflict('key').ignore();
    globalThis.__klSettings?.delete('vapid_public');
    globalThis.__klSettings?.delete('vapid_private');
    pub = await getSetting('vapid_public');
    priv = await getSetting('vapid_private');
  }
  return { pub, priv };
}

export async function vapidPublicKey() {
  return (await vapid()).pub;
}

export async function saveSubscription(user, sub, device) {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) throw new Error('Invalid subscription');
  const k = await db();
  await k('push_subscriptions').where({ endpoint: sub.endpoint }).del();
  await k('push_subscriptions').insert({
    user_id: user.id, endpoint: String(sub.endpoint).slice(0, 700), p256dh: sub.keys.p256dh, auth: sub.keys.auth,
    device: String(device || '').slice(0, 160), created_at: new Date(),
  });
}

async function pushTo(userIds, payload) {
  if (!userIds.length) return;
  const k = await db();
  const subs = await k('push_subscriptions').whereIn('user_id', userIds);
  if (!subs.length) return;
  const { pub, priv } = await vapid();
  const subject = process.env.SITE_URL || 'mailto:admin@makjal.com';
  webpush.setVapidDetails(subject.startsWith('http') || subject.startsWith('mailto:') ? subject : 'mailto:admin@makjal.com', pub, priv);
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600 });
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await k('push_subscriptions').where({ id: s.id }).del();
    }
  }));
}

/**
 * Tell the right people that a guest changed something.
 * Recipients: the guest's handler + every active user with "notify me of all changes".
 */
export async function notifyGuestChange({ eventId, invitation, title, body, url }) {
  try {
    const k = await db();
    const ids = new Set(
      (await k('users').where({ active: true, notify_all: true }).select('id')).map((r) => r.id),
    );
    if (invitation?.handler_id) ids.add(invitation.handler_id);
    const userIds = [...ids];
    if (!userIds.length) return;
    const now = new Date();
    await k('notifications').insert(userIds.map((uid) => ({
      user_id: uid, event_id: eventId, invitation_id: invitation?.id || null,
      title: String(title).slice(0, 160), body: body ? String(body).slice(0, 500) : null, url: url || null, created_at: now,
    })));
    // fire and forget; never block the guest's save
    pushTo(userIds, { title, body, url, tag: `inv-${invitation?.id || 'x'}` }).catch(() => {});
  } catch (e) {
    console.error('notify failed', e);
  }
}

// Direct notification to specific users (e.g. "guests assigned to you").
export async function notifyUsers(userIds, { eventId, invitationId, title, body, url }) {
  try {
    if (!userIds.length) return;
    const k = await db();
    await k('notifications').insert(userIds.map((uid) => ({
      user_id: uid, event_id: eventId || null, invitation_id: invitationId || null,
      title: String(title).slice(0, 160), body: body ? String(body).slice(0, 500) : null, url: url || null, created_at: new Date(),
    })));
    pushTo(userIds, { title, body, url }).catch(() => {});
  } catch (e) {
    console.error('notify failed', e);
  }
}

export async function unreadCount(userId) {
  const k = await db();
  const r = await k('notifications').where({ user_id: userId }).whereNull('read_at').count({ n: '*' }).first();
  return Number(r?.n || 0);
}
