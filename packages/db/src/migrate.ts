import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb } from './client';

const here = dirname(fileURLToPath(import.meta.url));
const { db, sql } = getDb();
await migrate(db, { migrationsFolder: join(here, '..', 'migrations') });
console.log('migrations applied');
await sql.end();
