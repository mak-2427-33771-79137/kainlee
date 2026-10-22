// Database access (MySQL / MariaDB via knex). Schema is created automatically
// on first use, so no SSH or manual SQL is needed on Hostinger.
import knexLib from 'knex';
import { migrations } from './schema';

const g = globalThis;

function makeKnex() {
  const conn = process.env.DATABASE_URL
    ? process.env.DATABASE_URL
    : {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      };
  const connection = typeof conn === 'string'
    ? { uri: conn, timezone: 'Z', charset: 'utf8mb4', dateStrings: false }
    : { ...conn, timezone: 'Z', charset: 'utf8mb4', dateStrings: false };
  if (typeof conn === 'string') {
    const u = new URL(conn);
    Object.assign(connection, {
      host: u.hostname, port: Number(u.port || 3306),
      user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ''),
    });
    delete connection.uri;
  }
  return knexLib({
    client: 'mysql2',
    connection,
    pool: { min: 0, max: Number(process.env.DB_POOL || 8) },
  });
}

class MigrationSource {
  getMigrations() { return Promise.resolve(Object.keys(migrations)); }
  getMigrationName(m) { return m; }
  getMigration(m) { return migrations[m]; }
}

export async function db() {
  if (!g.__klKnex) g.__klKnex = makeKnex();
  if (!g.__klReady) {
    g.__klReady = g.__klKnex.migrate
      .latest({ migrationSource: new MigrationSource(), tableName: 'kl_migrations' })
      .catch((e) => { g.__klReady = null; throw e; });
  }
  await g.__klReady;
  return g.__klKnex;
}

export async function tx(fn) {
  const k = await db();
  return k.transaction(fn);
}
