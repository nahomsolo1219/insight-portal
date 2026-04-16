import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// Supabase connection pooling (PgBouncer in transaction mode) does not
// support prepared statements, so prepare:false is required.
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });

// Re-export schema so call sites can do `import { db, profiles } from '@/db'`.
export * from './schema';
