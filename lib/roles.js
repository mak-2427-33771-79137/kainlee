// Loads roles (made of modules) from the database into the shared registry in lib/rbac.js.
import { db } from './db';
import { setRoles } from './rbac';

const g = globalThis;

export async function loadRoles(force = false) {
  if (!force && g.__klRolesAt && Date.now() - g.__klRolesAt < 30000) return;
  const k = await db();
  const rows = await k('roles').select();
  if (!rows.length) return;
  setRoles(rows.map((r) => {
    let modules = [];
    try { modules = JSON.parse(r.modules || '[]'); } catch {}
    return { key: r.key, label: r.label, twofa: !!r.twofa, builtin: !!r.builtin, modules };
  }));
  g.__klRolesAt = Date.now();
}

export function rolesChanged() { g.__klRolesAt = 0; }
