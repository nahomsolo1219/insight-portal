// Server-only helpers for reading the logged-in user's profile and enforcing
// role requirements in Server Actions / Server Components.
//
// Never import these from a `'use client'` file — they talk directly to the
// database and read cookies.

import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/db';
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
  avatarUrl: string | null;
}

/**
 * Returns the currently-authenticated user's profile, or null if nobody is
 * signed in. Throws if the auth session exists but the profile row is missing
 * (which would indicate the signup trigger failed).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
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
  };
}

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
