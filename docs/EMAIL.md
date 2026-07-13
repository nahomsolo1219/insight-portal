# Email — auth emails, Resend, and the required Supabase dashboard setup

Every email this app sends — including the **auth** emails (invite, password
reset, magic link) — now goes out through **Resend**, from our domain, using
the branded templates in `email_templates`. Supabase Auth is used only to
*generate* the links (`auth.admin.generateLink`), never to send them.

Read this before deploying or before touching the Supabase Auth settings. Doing
the dashboard steps in the wrong order breaks onboarding.

---

## How it works now

| Flow | Trigger (code) | Link source | Template (`email_templates.key`) |
|---|---|---|---|
| Client invite | `inviteUser` (`admin/staff/actions.ts`) | `generateLink({ type: 'invite' })` | `welcome_client` |
| Staff/admin invite | `inviteUser` (same) | `generateLink({ type: 'invite' })` | `staff_invite` |
| Password reset | `requestPasswordReset` (`app/login/actions.ts`) | `generateLink({ type: 'recovery' })` | `password_reset` |
| Magic-link sign-in | `requestMagicLink` (`app/login/actions.ts`) | `generateLink({ type: 'magiclink' })` | `magic_link` |

- `generateLink` **creates/looks up the user and returns the link without
  sending anything.** We then send our own branded email via `sendEmail()`
  (`src/lib/email/send.ts`), which renders the template, injects the link as
  `{{cta_url}}`, sends through Resend, and records the result in **`email_log`**.
- Every auth email is therefore discoverable: query `email_log` by
  `template_key` / `status` to see sends, skips, and failures.
- The app no longer calls any Supabase method that *sends* an auth email
  (`inviteUserByEmail`, `resetPasswordForEmail`, `signInWithOtp` are gone). So
  there is no second, unbranded email path left alive in the code.

---

## Prerequisites (env)

- `RESEND_API_KEY` — set, and the **sending domain verified in Resend**
  (SPF/DKIM). Without a verified domain, Resend rejects or spam-files the mail.
- `NEXT_PUBLIC_SITE_URL` — the deployed origin (e.g. `https://portal.insighthm.com`).
  It builds both the email logo URL and the `redirectTo` on every generated
  link. If it's wrong, links point at the wrong host.
- `SUPABASE_SERVICE_ROLE_KEY` — `generateLink` is a service-role admin call.

---

## Supabase dashboard steps — do these IN ORDER

> **Order matters. Deploy this code FIRST, then change the dashboard.**
> The old code relied on Supabase to send the invite/recovery/magic emails. If
> you disable Supabase's native auth emails (or otherwise change config the old
> flow depends on) *before* this code is live, invites and resets send nothing
> and onboarding breaks entirely. New code first, dashboard second.

### 1. Deploy this code

Ship the branded-email code (this change set). From this point the app
generates links and sends via Resend; it no longer triggers Supabase's own
invite/recovery/magic sends.

### 2. Auth → URL Configuration (REQUIRED)

The email CTA points directly at our own `/auth/callback?token_hash=…&type=…&next=…`,
and the callback verifies with `verifyOtp` (it does NOT use Supabase's hosted
`/verify` link — that completes in the implicit flow and returns the session in
the URL fragment, which a server route can't read; that mismatch is what made
every link fail before). We still pass a `redirectTo` to `generateLink`, so the
allow-list must still be set or `generateLink` can reject the request.

1. **Site URL** → set to `NEXT_PUBLIC_SITE_URL` (e.g. `https://portal.insighthm.com`).
2. **Redirect URLs** → add (exact origin must match the deployed host):
   - `https://portal.insighthm.com/**` (wildcard is the simplest safe option)
   - For local testing also add `http://localhost:3000/**`.

`NEXT_PUBLIC_SITE_URL` must be set in the deployed env (it builds the callback
URL in the email); if it's absent the link points at `http://localhost:3000`
and onboarding breaks.

### 3. Auth → Sign-Ups / Providers → turn OFF public sign-ups

Users are invite-only (every account is curated). Disable **"Allow new users to
sign up"** (Authentication → Sign In / Providers → Email). This stops Supabase
from emitting signup **confirmation** emails and blocks self-registration.

### 4. Confirm no native auth email can still fire

Because the app uses `generateLink` (no send) for invite/recovery/magic, and
sign-ups are disabled, Supabase should now send **no** auth email of its own.
Verify:

- There is no other integration or script calling `inviteUserByEmail`,
  `resetPasswordForEmail`, `signInWithOtp`, or `signUp`.
- If you use **Custom SMTP** in Supabase, it only matters for emails Supabase
  itself sends — which is now none for these flows. Leaving it configured is
  harmless; our mail goes through Resend regardless.

> If your Supabase project version exposes per-template enable toggles for
> **Invite user / Reset password / Magic Link** under Authentication → Emails,
> turn them off too as belt-and-suspenders. It is not strictly required (the
> app no longer triggers those sends), but it guarantees no unbranded email can
> ever slip out if a future code path re-introduces a direct Supabase call.

---

## Verifying end-to-end

1. Invite a test client. Confirm exactly **one** email arrives, branded, from
   our domain, with a **"Set your password"** button.
2. Click it → it should land on `/auth/reset-password`, let you set a password,
   then route you by role (client → `/portal`).
3. Check `email_log`: one `sent` row with `template_key = 'welcome_client'`.
4. Repeat for **Forgot password** (`password_reset`) and **magic link**
   (`magic_link`).

### If the email fails to send

`inviteUser` returns `emailSent: false` (with `emailError`) when the user was
created but Resend failed. The admin UI surfaces "account created but the email
failed — resend" (New client modal, Add staff modal, and the client detail
"Invite to portal" button). The user already exists, so **resend** — do not
recreate. The failure is also in `email_log` (`status = 'failed'`).

---

## Notes / watch-outs

- **Rate limiting.** Supabase used to rate-limit its own recovery/magic sends.
  The public `requestPasswordReset` / `requestMagicLink` server actions now
  send via Resend with no built-in throttle. Consider adding basic rate
  limiting if abuse (reset-email spamming) becomes a concern.
- **Anti-enumeration.** Those two public actions always resolve generically
  (`{ ok: true }`) even for an unknown email, so a caller can't probe which
  addresses have accounts. Every attempt is still logged in `email_log`.
