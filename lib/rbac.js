// Role-based access control built from MODULES.
// A role = a name + a set of modules (+ "requires 2-step login"). Users get one role.
// Built-in roles below are the defaults; roles are stored in the database and can be
// created and edited in Users & roles. The registry lives on globalThis so every server
// bundle sees the same roles; lib/roles.js loads them from the database.

export const MODULES = [
  { id: 'dashboard', label: 'Dashboard', desc: 'Event summary and headcounts', perms: ['dashboard.view'] },
  { id: 'guests_view', label: 'Guest list (view)', desc: 'See every guest, RSVPs and mobile numbers', perms: ['guests.view', 'guests.contacts'] },
  { id: 'guests_edit', label: 'Edit any guest', desc: 'Change any guest’s RSVP, family, notes; reset PINs', perms: ['guests.edit', 'pin.reset'] },
  { id: 'guests_assign', label: 'Assign guests', desc: 'Choose who looks after which guests', perms: ['guests.assign'] },
  { id: 'own_guests', label: 'Look after guests', desc: 'Can be given guests; edit, message, export and check in their own guests', perms: ['guests.edit_own', 'guests.transfer_own', 'pin.reset_own', 'invites.send_own', 'export.own', 'checkin.mark_own'], handler: true },
  { id: 'invites', label: 'Send invitations', desc: 'Send invitations and reminders to any guest', perms: ['invites.send'] },
  { id: 'directory', label: 'Invitee directory', desc: 'Add, import and edit invitees; invite them to events', perms: ['invitees.manage'] },
  { id: 'events', label: 'Create events & cards', desc: 'Create events and series; edit functions, message templates and card designs', perms: ['events.manage', 'cards.edit'] },
  { id: 'events_edit', label: 'Edit events', desc: 'Edit an existing event: name, date & time, venue, RSVP deadline, switches, functions, messages and card', perms: ['events.edit'] },
  { id: 'rooms_view', label: 'Guest rooms (view)', desc: 'See room requests and allotments', perms: ['rooms.view'] },
  { id: 'rooms_manage', label: 'Guest rooms (manage)', desc: 'Add rooms and allot them', perms: ['rooms.view', 'rooms.manage'] },
  { id: 'checkin', label: 'Gate check-in', desc: 'Scan entry QRs and mark anyone present or absent', perms: ['checkin.mark'] },
  { id: 'walkins', label: 'Approve walk-ins', desc: 'Review walk-ins added at the gate', perms: ['walkins.review'] },
  { id: 'catering', label: 'Catering (view)', desc: 'Meal counts per function', perms: ['catering.view'] },
  { id: 'catering_export', label: 'Catering sheet download', desc: 'Download the catering sheet', perms: ['export.catering'] },
  { id: 'tasks_manage', label: 'Manage tasks', desc: 'Create, edit, assign and delete tasks on the task board; manage labels; copy tasks from an earlier event. (Everyone can see the board and work on tasks they are on.)', perms: ['tasks.manage'] },
  { id: 'reports', label: 'Reports & exports', desc: 'Download any report (PDF / Excel)', perms: ['export.all'] },
  { id: 'delete_records', label: 'Delete records', desc: 'Delete invitees from the directory, delete events, remove guests and rooms', perms: ['records.delete', 'events.delete'] },
  { id: 'users', label: 'Users & roles', desc: 'Add users, create roles, assign roles', perms: ['users.manage'] },
  { id: 'settings', label: 'Settings & activity log', desc: 'Crest, wording, backups, activity log', perms: ['settings.manage', 'audit.view'] },
  { id: 'clear_data', label: 'Clear data', desc: 'Empty chosen database tables (Settings › Clear data)', perms: ['data.clear'] },
];
export const MODULE_IDS = MODULES.map((m) => m.id);

const ALL = MODULE_IDS;
export const BUILTIN_ROLES = {
  super_admin: { label: 'Super Admin', twofa: true, modules: ALL },
  coordinator: { label: 'Event Coordinator', twofa: true, modules: ALL.filter((m) => !['delete_records', 'users', 'settings', 'clear_data'].includes(m)) },
  liaison: { label: 'Liaison Officer (looks after guests)', twofa: false, modules: ['dashboard', 'guests_view', 'own_guests', 'rooms_view'] },
  volunteer: { label: 'Check-in Volunteer', twofa: false, modules: ['checkin'] },
  viewer: { label: 'Viewer (read-only)', twofa: false, modules: ['dashboard', 'guests_view', 'catering', 'rooms_view'] },
  catering: { label: 'Catering / Admin Staff', twofa: false, modules: ['catering', 'catering_export'] },
};

const g = globalThis;
g.__klRoles ||= {};
export const ROLES = g.__klRoles; // key -> { label, twofa, handler, builtin, modules: [], perms: Set }

function build(def, builtin) {
  const modules = (def.modules || []).filter((m) => MODULE_IDS.includes(m));
  const perms = new Set();
  let handler = false;
  for (const m of MODULES) if (modules.includes(m.id)) { m.perms.forEach((p) => perms.add(p)); if (m.handler) handler = true; }
  return { label: def.label, twofa: !!def.twofa, handler, builtin: !!builtin, modules, perms };
}

/** Replace the registry. rows: [{ key, label, twofa, builtin, modules: [] }] */
export function setRoles(rows) {
  for (const k of Object.keys(ROLES)) delete ROLES[k];
  for (const r of rows) ROLES[r.key] = build(r, r.builtin);
  // super_admin always has everything, so nobody can lock themselves out
  if (ROLES.super_admin) ROLES.super_admin = build({ ...ROLES.super_admin, modules: ALL }, true);
}
if (!Object.keys(ROLES).length) setRoles(Object.entries(BUILTIN_ROLES).map(([key, r]) => ({ key, ...r, builtin: true })));

export const roleIds = () => Object.keys(ROLES);

export function can(role, perm) {
  return !!ROLES[role]?.perms.has(perm);
}

/** Edit an existing event (Event setup, functions, messages, card) */
export const canEditEvent = (role) => can(role, 'events.edit') || can(role, 'events.manage');

// Can this user act on this particular invitation? (own = assigned to them)
export function canOn(user, perm, inv) {
  if (can(user.role, perm)) return true;
  const own = { 'guests.edit': 'guests.edit_own', 'pin.reset': 'pin.reset_own', 'invites.send': 'invites.send_own', 'checkin.mark': 'checkin.mark_own' }[perm];
  return !!own && can(user.role, own) && inv && inv.handler_id === user.id;
}

// First page a role lands on
export function homeFor(role) {
  if (can(role, 'guests.edit_own') && !can(role, 'guests.edit')) return 'guests?handler=me';
  if (can(role, 'dashboard.view')) return '';
  if (can(role, 'checkin.mark')) return 'checkin';
  if (can(role, 'catering.view')) return 'catering';
  return '';
}
