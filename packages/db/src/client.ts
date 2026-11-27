import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * One connection pool per process. Production uses the VM database over TLS with the certificate in PG_CA_CERT
 * (base64 PEM), verified against the server's IP (sslmode=verify-full in DATABASE_URL).
 */
let cached: ReturnType<typeof make> | undefined;

function make(url: string) {
  const ca = process.env.PG_CA_CERT ? Buffer.from(process.env.PG_CA_CERT, 'base64').toString('utf8') : undefined;
  const sql = postgres(url, {
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: true,
    ssl: ca
      ? { ca, rejectUnauthorized: true }
      : url.includes('sslmode=disable') || /localhost|127\.0\.0\.1/.test(url)
        ? false
        : 'require',
  });
  return { sql, db: drizzle(sql, { schema }) };
}

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  cached ??= make(url.replace(/[?&]sslmode=verify-full/, ''));
  return cached;
}

export type Db = ReturnType<typeof getDb>['db'];
