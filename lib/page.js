import { redirect, notFound } from 'next/navigation';
import { getAdmin } from './auth';
import { can, ROLES } from './rbac';
import { getEvent } from './data';

// For server pages: the logged-in user, or a redirect to login.
export async function pageUser() {
  const u = await getAdmin();
  if (!u) redirect('/login');
  return u;
}

export async function pageEvent(params) {
  const { id } = await params;
  const ev = await getEvent(Number(id) || 0);
  if (!ev) notFound();
  return ev;
}

export function allowed(user, ...perms) {
  return perms.some((p) => can(user.role, p));
}

export function navPerms(role) {
  const c = (p) => can(role, p);
  return {
    dashboard: c('dashboard.view'),
    guests: c('guests.view'),
    handler: !!ROLES[role]?.handler,
    rooms: c('rooms.view'),
    checkin: c('checkin.mark') || c('checkin.mark_own'),
    send: c('invites.send') || c('invites.send_own'),
    catering: c('catering.view'),
    eventSetup: c('events.manage'),
    events: c('events.manage') || c('dashboard.view'),
    directory: c('invitees.manage'),
    users: c('users.manage'),
    settings: c('settings.manage'),
  };
}

// Absolute site address for the current request (for link-preview images).
export async function requestBase() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const { headers } = await import('next/headers');
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = h.get('x-forwarded-proto') || (host?.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

// Link-preview (WhatsApp / social) metadata showing the guest's invitation card.
export function cardPreviewMeta(base, token, title, description) {
  const image = { url: `${base}/i/${token}/preview.png`, width: 1200, height: 630, alt: 'Invitation card' };
  return {
    openGraph: { type: 'website', title, description, url: `${base}/i/${token}`, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  };
}
