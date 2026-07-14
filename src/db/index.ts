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
//   max: 5            — headroom is the point. `withDbTimeout`'s retry can only
//                       escape a poisoned socket if the pool can hand it a
//                       DIFFERENT connection: when an attempt times out,
//                       postgres.js still holds that connection busy (the
//                       abandoned query never settled), so with max > 1 the
//                       retry checks out another idle connection or opens a
//                       fresh TCP one. Under max:1 there is no spare — the
//                       retry queues on the same busy-dead socket and also
//                       times out (the 10.9s = 5s + 5s + throw signature). 5
//                       covers Fluid's per-instance request concurrency plus
//                       that retry headroom. It does NOT reintroduce hoarding:
//                       Supavisor multiplexes centrally, so 5 sockets/instance
//                       is trivial for the pooler (the DB is healthy at ~450
//                       req/hr) — the original "exhaustion" read was itself a
//                       misdiagnosis of these stale ClientRead connections.
//   idle_timeout: 20  — reaps connections when the instance is actually
//                       running; CANNOT fire mid-freeze, so it is not what
//                       protects us here.
//   max_lifetime: 300 — recycle every 5 min so a connection can't persist
//                       indefinitely and accumulate freeze exposure. Bounds
//                       staleness *between* freezes (the timer can't fire
//                       *during* one); short enough to refresh sockets often,
//                       long enough to avoid churn at this traffic level.
//   connect_timeout: 10 — fail fast if the pooler can't hand out a socket.
//
// The load-bearing guard is `withDbTimeout` below (an app-side timeout +
// retry), because only a client-side wall-clock timer can catch a hung write
// to a dead socket — the server never sees that query, so no server-side
// statement_timeout can help.
const client = postgres(connectionString, {
  prepare: false,
  max: 5,
  idle_timeout: 20,
  max_lifetime: 60 * 5,
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
 * `run` is a THUNK, not a promise, so each retry issues a genuinely new query.
 * A timed-out attempt leaves its connection marked busy inside postgres.js (the
 * abandoned query never settled), so the pool will NOT hand that same socket to
 * the retry — with pool headroom (max > 1) the retry lands on a different idle
 * connection or a fresh TCP one. `retries: 2` means up to three attempts, so
 * even if a first retry hits a second stale-idle socket (a busy instance that
 * froze with several open connections), the next attempt converges onto a fresh
 * connection. Abandoned dead sockets are reclaimed by postgres.js once TCP
 * keepalive / connect_timeout marks them dead (~a minute), which the max:5
 * headroom absorbs in the meantime.
 */
export async function withDbTimeout<T>(
  run: () => Promise<T>,
  { ms = 5000, retries = 2, label = 'query' }: { ms?: number; retries?: number; label?: string } = {},
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
