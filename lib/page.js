import { redirect, notFound } from 'next/navigation';
import { getAdmin } from './auth';
import { can } from './rbac';
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
    handler: ['super_admin', 'coordinator', 'liaison'].includes(role),
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
