// Brand mark for the unauthenticated surfaces — the login page and the
// password-set / reset page. Renders the dark wordmark logo directly on the
// page's light/cream background: no container, no separate typed wordmark.
//
// Asset: served locally from /public/auth-logo.svg (the "Logo-Dark" mark,
// #062626 on transparent). Downloaded rather than hot-linked to the Webflow
// CDN so the auth pages — a user's first impression — don't depend on a
// third-party request at load time (reliability, same-origin caching, no
// external call). SVG is safe here (browser, not email).
//
// Presentational only (no hooks / no server deps), so it renders from server
// or client components, and both auth pages share it so they can't drift.

export function BrandLockup() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/auth-logo.svg"
      alt="Insight Home Maintenance"
      className="mx-auto mb-6 block h-10 w-auto"
    />
  );
}
