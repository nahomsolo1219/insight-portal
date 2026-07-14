import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// Supabase connection pooling (PgBouncer in transaction mode) does not
// support prepared statements, so prepare:false is required.
//
// Pool sizing is tuned for Vercel's serverless runtime. Each function
// instance instantiates this module and gets its own postgres.js pool, so
// a high per-instance `max` (the library default is 10) means every warm
// instance hoards connections that the transaction pooler never sees
// released — under fan-out that exhausts the pooler and queries queue until
// the statement timeout, which is the recurring "sessions stuck active"
// hang. Behind a transaction pooler the right shape is a tiny per-instance
// pool (multiplexing happens at the pooler, not here) with an idle timeout
// so connections are returned promptly.
//   max: 1            — one connection per serverless instance
//   idle_timeout: 20  — release a connection after 20s idle (seconds)
//   connect_timeout: 10 — fail fast if the pooler can't hand one out (seconds)
const client = postgres(connectionString, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });

// Re-export schema so call sites can do `import { db, profiles } from '@/db'`.
export * from './schema';
