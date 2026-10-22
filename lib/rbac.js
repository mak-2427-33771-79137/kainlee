// Role-based access control. Shared by server and client (no server imports here).
export const ROLES = {
  super_admin: { label: 'Super Admin', twofa: true, handler: true },
  coordinator: { label: 'Event Coordinator', twofa: true, handler: true },
  liaison: { label: 'Liaison Officer (looks after guests)', twofa: false, handler: true },
  volunteer: { label: 'Check-in Volunteer', twofa: false, handler: false },
  viewer: { label: 'Viewer (read-only)', twofa: false, handler: false },
  catering: { label: 'Catering / Admin Staff', twofa: false, handler: false },
};
export const ROLE_IDS = Object.keys(ROLES);

const ALL_ADMIN = ['super_admin', 'coordinator'];
const P = {
  'dashboard.view': [...ALL_ADMIN, 'viewer', 'liaison'],
  'guests.view': [...ALL_ADMIN, 'viewer', 'liaison'],     // see the entire list
  'guests.contacts': [...ALL_ADMIN, 'viewer', 'liaison'], // see mobile numbers
  'guests.edit': ALL_ADMIN,                               // edit any guest
  'guests.edit_own': ['liaison'],                         // edit guests assigned to me
  'guests.assign': ALL_ADMIN,                             // assign / reassign any guest to any handler
  'guests.transfer_own': ['liaison'],                     // hand my guests to another handler
  'pin.reset': ALL_ADMIN,
  'pin.reset_own': ['liaison'],
  'invitees.manage': ALL_ADMIN,
  'events.manage': ALL_ADMIN,
  'events.delete': ['super_admin'],
  'cards.edit': ALL_ADMIN,
  'invites.send': ALL_ADMIN,
  'invites.send_own': ['liaison'],
  'export.all': ALL_ADMIN,
  'export.own': ['liaison'],
  'export.catering': [...ALL_ADMIN, 'catering'],
  'catering.view': [...ALL_ADMIN, 'viewer', 'catering'],
  'rooms.view': [...ALL_ADMIN, 'viewer', 'liaison'],
  'rooms.manage': ALL_ADMIN,
  'checkin.mark': [...ALL_ADMIN, 'volunteer'],
  'checkin.mark_own': ['liaison'],
  'walkins.review': ALL_ADMIN,
  'users.manage': ['super_admin'],
  'settings.manage': ['super_admin'],
  'audit.view': ['super_admin'],
};

export function can(role, perm) {
  return !!P[perm]?.includes(role);
}

// Can this user act on this particular invitation? (own = assigned to them)
export function canOn(user, perm, inv) {
  if (can(user.role, perm)) return true;
  const own = { 'guests.edit': 'guests.edit_own', 'pin.reset': 'pin.reset_own', 'invites.send': 'invites.send_own', 'checkin.mark': 'checkin.mark_own' }[perm];
  return !!own && can(user.role, own) && inv && inv.handler_id === user.id;
}

export function homeFor(role) {
  if (role === 'volunteer') return 'checkin';
  if (role === 'catering') return 'catering';
  if (role === 'liaison') return 'guests?handler=me';
  return '';
}
