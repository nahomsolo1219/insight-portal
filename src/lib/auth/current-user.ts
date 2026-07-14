// Server-only helpers for reading the logged-in user's profile and enforcing
// role requirements in Server Actions / Server Components.
//
// Never import these from a `'use client'` file — they talk directly to the
// database and read cookies.

import 'server-only';

import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { db, withDbTimeout } from '@/db';
import { profiles } from '@/db/schema';
import { createClient } from '@/lib/supabase/server';

export type UserRole = 'admin' | 'client' | 'field_staff';

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  clientId: string | null;
  staffId: string | null;
  /** Storage path under the public `avatars` bucket. **Not a URL** —
   *  the column name is historical (CLAUDE.md calls this out).
   *  Compose with `getAvatarPublicUrl(path, version)` at render time. */
  avatarUrl: string | null;
  phone: string | null;
  /** profiles.updatedAt — used as a stable cache-bust version when
   *  composing the avatar URL. Changing the avatar bumps this, so
   *  the URL changes and CDN edges rotate to fresh bytes. */
  updatedAt: Date;
}

/**
 * Returns the currently-authenticated user's profile, or null if nobody is
 * signed in. Throws if the auth session exists but the profile row is missing
 * (which would indicate the signup trigger failed).
 *
 * Wrapped in React `cache()` so it runs at most once per server request even
 * though both the layout and the page (via `requireAdmin`/`requireUser`) call
 * it — the memo dedupes the `auth.getUser()` round-trip and the profiles read
 * within a single render pass. Server Actions are a separate request, so they
 * still get a fresh lookup.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // This is the first (and often only) pooled query on essentially every
  // route — the admin/portal layouts and requireAdmin/requireUser all funnel
  // through it — so it is where a stale-after-freeze socket bites first.
  // Guard it with a wall-clock timeout so a dead connection fails fast and
  // the retry lands on a fresh one instead of hanging to Vercel's 300s limit.
  return withDbTimeout(
    async () => {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return null;

      const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);

      if (!profile) {
        throw new Error(
          `No profile row for authenticated user ${user.id}. The signup trigger may have failed.`,
        );
      }

      return {
        id: profile.id,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role,
        clientId: profile.clientId,
        staffId: profile.staffId,
        avatarUrl: profile.avatarUrl,
        phone: profile.phone,
        updatedAt: profile.updatedAt,
      };
    },
    { label: 'getCurrentUser' },
  );
});

/**
 * Like getCurrentUser but throws if nobody is signed in. Use at the top of
 * Server Actions that require any authenticated user.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  return user;
}

/**
 * Throws if the caller is not an admin. Use at the top of every admin-only
 * Server Action — do not rely on middleware alone for mutation authorization.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== 'admin') throw new Error('Admin access required');
  return user;
}
