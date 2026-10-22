import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Diagnostic page: /api/health — shows whether the app can reach its database.
// Never shows passwords or secrets; only which settings are present and the error type.
const HINTS = {
  ER_ACCESS_DENIED_ERROR: 'Wrong DB_USER or DB_PASSWORD (include the u123…_ prefix), or DB_HOST is "localhost" — use 127.0.0.1.',
  ER_BAD_DB_ERROR: 'DB_NAME does not match the database created in hPanel (include the u123…_ prefix).',
  ECONNREFUSED: 'Nothing is listening on DB_HOST:DB_PORT. Use DB_HOST=127.0.0.1 and DB_PORT=3306.',
  ENOTFOUND: 'DB_HOST is not a valid host name. Use 127.0.0.1.',
  ETIMEDOUT: 'The database did not answer. Use DB_HOST=127.0.0.1 (not the remote srv…hstgr.io name).',
  ER_DBACCESS_DENIED_ERROR: 'This DB user is not linked to this database. Re-create the user for this database in hPanel.',
  ER_TABLEACCESS_DENIED_ERROR: 'The DB user lacks permission to create tables. Give it all privileges on this database.',
};

export async function GET() {
  const vars = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'SESSION_SECRET', 'DATABASE_URL', 'SITE_URL'];
  const env = Object.fromEntries(vars.map((v) => [v, process.env[v] ? (v === 'DB_HOST' || v === 'DB_PORT' || v === 'SITE_URL' ? process.env[v] : 'set') : 'missing']));
  const out = { app: 'kainlee', node: process.version, env, database: 'unknown' };
  try {
    const k = await db();
    const r = await k.raw('select version() as v');
    const tables = await k('kl_migrations').count({ n: '*' }).first();
    out.database = 'ok';
    out.server = r[0][0].v;
    out.migrations = Number(tables.n);
  } catch (e) {
    out.database = 'error';
    out.error = e.code || e.name || 'error';
    out.hint = HINTS[e.code] || (String(e.message || '').includes('Please provide') ? 'Database settings are missing. Add DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD and redeploy.' : 'See the message below and check the six environment variables.');
    out.message = String(e.message || '').replace(/password[^,)]*/gi, 'password ***').slice(0, 300);
  }
  return Response.json(out, { status: out.database === 'ok' ? 200 : 500, headers: { 'cache-control': 'no-store' } });
}
