import { attachDatabasePool } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// node-postgres (pg) pool against the Supabase TRANSACTION pooler (port 6543).
//
// Why pg and not postgres.js: this app runs on Vercel Fluid, which SUSPENDS
// warm instances between requests. A long-lived TCP socket dies silently
// during a suspend — Postgres parks on `wait_event = ClientRead`, waiting for
// a client that is frozen — and on thaw the next request reuses the corpse and
// hangs to Vercel's 300s function limit → 504 (first-request-after-idle 504,
// immediate reload succeeds: the dead socket being evicted). Timer-based
// mitigations (idle_timeout, max_lifetime) can't help: a frozen event loop
// fires no timers. `attachDatabasePool` below is Vercel's supported hook — it
// runs in the suspend lifecycle, the one moment code still executes before the
// freeze, and closes idle pool clients so no socket survives to go stale. It
// requires the `pg` pool interface, which is why we migrated off postgres.js.
//
// node-postgres uses UNNAMED prepared statements, which the transaction pooler
// accepts, so it needs no `prepare:false` equivalent.
const pool = new Pool({
  connectionString,
  // A small pool WITH headroom. Not 1 — max:1 was proven harmful: it leaves no
  // spare, so evicting a bad socket and opening a fresh one has nowhere to go
  // and requests queue on the corpse. 5 covers Fluid's per-instance request
  // concurrency plus that headroom; trivial for Supavisor, which multiplexes
  // centrally (the DB is healthy at ~450 req/hr — "exhaustion" was a misread of
  // these idle ClientRead sockets, not a real connection-count problem).
  max: 5,
  // Reap idle clients after 10s when the instance is actually running. Hygiene
  // only — it cannot fire during a freeze; attachDatabasePool covers that.
  idleTimeoutMillis: 10_000,
  // Cap how long acquiring/establishing a connection may take; pg destroys the
  // socket when this trips, so a stalled connect fails fast instead of hanging.
  connectionTimeoutMillis: 10_000,
  // Server-side statement timeout: Postgres itself ABORTS a slow-but-alive
  // query after 8s (error 57014) and frees the connection cleanly. A true
  // cancel, not an abandon.
  statement_timeout: 8_000,
  // Client-side read timeout for an UNRESPONSIVE socket (the dead-after-freeze
  // case the server never sees). When it fires, pg rejects the query and
  // pg-pool calls release(err), which REMOVES and destroys the client — the
  // corpse is evicted, not returned to the pool, so the next request gets a
  // fresh connection. Set above statement_timeout so a slow-but-alive query is
  // cancelled server-side first; this only trips when the server never answers.
  query_timeout: 10_000,
  // OS-level TCP keepalive so a dead peer surfaces rather than black-holing.
  keepAlive: true,
});

// Vercel Fluid suspend hook — closes idle pool clients before the instance
// freezes, so no socket survives to be stale on thaw. This is the actual
// root-cause fix. No-op off Vercel (local dev, scripts, build).
attachDatabasePool(pool);

export const db = drizzle(pool, { schema });

// Re-export schema so call sites can do `import { db, profiles } from '@/db'`.
export * from './schema';
