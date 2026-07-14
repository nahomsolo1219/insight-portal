import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// Supabase connection pooling (PgBouncer/Supavisor in transaction mode) does
// not support prepared statements, so prepare:false is required.
//
// Pool sizing for a *freezing* serverless runtime (Vercel Fluid). The failure
// mode this config defends against is NOT connection-count exhaustion — it's
// stale sockets. When Fluid suspends a warm instance, the JS event loop stops,
// so idle_timeout / max_lifetime timers never fire and the pooled TCP socket
// is left open. Supavisor or the network NAT then closes its side during the
// freeze; on thaw, postgres.js reuses a socket that is dead but looks alive
// and the query hangs (there is no per-query timeout in postgres.js) until
// Vercel's 300s function limit → 504. This is what `wait_event = ClientRead`
// for minutes actually is: an idle connection stranded by a suspended client.
//
//   max: 3            — a SMALL pool, but > 1 on purpose. The bug got worse
//                       under max:1 because a single stale socket blocked
//                       every request on the instance; with a spare, a dead
//                       connection has a live bystander to route around.
//   idle_timeout: 20  — harmless, and reaps connections when the instance is
//                       actually running; it CANNOT fire mid-freeze, so it is
//                       not what protects us here.
//   max_lifetime: 600 — recycle connections every ~10 min for hygiene (same
//                       timer caveat — not the load-bearing guard).
//   connect_timeout: 10 — fail fast if the pooler can't hand out a socket.
//
// The load-bearing guard is `withDbTimeout` below (an app-side timeout +
// retry), because only a client-side wall-clock timer can catch a hung write
// to a dead socket — the server never sees that query, so no server-side
// statement_timeout can help.
const client = postgres(connectionString, {
  prepare: false,
  max: 3,
  idle_timeout: 20,
  max_lifetime: 60 * 10,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });

/** Thrown by `withDbTimeout` when a DB operation blows its wall-clock budget —
 *  in practice, a stale pooled socket left dead by a Fluid freeze. */
export class DbTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DbTimeoutError';
  }
}

/**
 * Race a DB operation against a wall-clock timeout so a stale pooled socket
 * fails in seconds instead of hanging to Vercel's 300s limit (→ 504). postgres.js
 * has no per-query timeout, and a half-open TCP socket gives no error, so this
 * client-side timer is the only thing that can turn the hang into a failure.
 *
 * `run` is a THUNK, not a promise, so the retry issues a genuinely new query:
 * with `max > 1` that retry checks out a *different* pooled connection, so a
 * single dead socket self-heals within one request. The abandoned first
 * attempt is left for postgres.js to reap once connect_timeout/keepalive marks
 * its socket dead.
 */
export async function withDbTimeout<T>(
  run: () => Promise<T>,
  { ms = 5000, retries = 1, label = 'query' }: { ms?: number; retries?: number; label?: string } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        run(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new DbTimeoutError(`DB "${label}" exceeded ${ms}ms (attempt ${attempt + 1})`)),
            ms,
          );
        }),
      ]);
    } catch (err) {
      if (err instanceof DbTimeoutError && attempt < retries) continue;
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

// Re-export schema so call sites can do `import { db, profiles } from '@/db'`.
export * from './schema';
