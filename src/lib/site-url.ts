import 'server-only';

/**
 * The canonical origin (scheme + host, no trailing slash) for building
 * absolute URLs in server-sent emails and auth links.
 *
 * Why this exists: every email/invite URL used to be
 * `process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'`, scattered
 * across five files. `NEXT_PUBLIC_*` vars are INLINED AT BUILD TIME, so if the
 * value wasn't present in the build that's actually deployed (added to Vercel
 * after the build, or a reused build cache), server code reads `undefined` and
 * every one of those fallbacks silently emits `http://localhost:3000` into
 * production emails — which is exactly the invite-link-points-to-localhost bug.
 *
 * The fallback chain is ordered so a production email can never contain
 * localhost when running on Vercel:
 *   1. NEXT_PUBLIC_SITE_URL           — explicit override, wins when set.
 *   2. VERCEL_PROJECT_PRODUCTION_URL  — the project's production domain
 *      (e.g. app.insighthm.com), a RUNTIME var Vercel always injects, so it
 *      works even if #1 wasn't inlined at build.
 *   3. VERCEL_URL                     — this specific deployment's URL (covers
 *      preview deployments; still never localhost).
 *   4. http://localhost:3000          — local dev only; VERCEL_* are unset there.
 *
 * Server-only: it reads the non-public VERCEL_* runtime vars. Client code that
 * needs the site URL should keep using the build-inlined NEXT_PUBLIC_SITE_URL.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) return `https://${prod.replace(/\/+$/, '')}`;

  const deployment = process.env.VERCEL_URL?.trim();
  if (deployment) return `https://${deployment.replace(/\/+$/, '')}`;

  return 'http://localhost:3000';
}
