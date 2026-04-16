'use server';

import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { profiles } from '@/db/schema';
import { requireAdmin } from '@/lib/auth/current-user';

// Service-role client. Bypasses RLS — only use from admin-gated Server Actions,
// and never expose the service role key to the browser.
function adminClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export type InviteRole = 'admin' | 'client' | 'field_staff';

export interface InviteUserParams {
  email: string;
  fullName: string;
  role: InviteRole;
  /** Required when role === 'client'. Links the profile to the client record. */
  clientId?: string;
  /** Optional for admin / field_staff. Links the profile to a staff record. */
  staffId?: string;
}

export interface InviteUserResult {
  success: boolean;
  error?: string;
  userId?: string;
}

/**
 * Invite a new user to the portal. Only callable by admins.
 *
 * Flow:
 *  1. Supabase Auth sends the invite email and creates the auth.users row.
 *  2. Our on_auth_user_created trigger creates the matching public.profiles row
 *     using the full_name + role we pass in user_metadata.
 *  3. We follow up with an UPDATE to link the profile to a client or staff row
 *     when applicable (the trigger doesn't know about those FKs).
 */
export async function inviteUser(params: InviteUserParams): Promise<InviteUserResult> {
  await requireAdmin();

  if (params.role === 'client' && !params.clientId) {
    return { success: false, error: 'clientId is required when inviting a client user.' };
  }

  const admin = adminClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback`;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(params.email, {
    data: {
      full_name: params.fullName,
      role: params.role,
    },
    redirectTo,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (data.user && (params.clientId || params.staffId)) {
    await db
      .update(profiles)
      .set({
        clientId: params.clientId ?? null,
        staffId: params.staffId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, data.user.id));
  }

  revalidatePath('/admin/staff');
  revalidatePath('/admin/clients');

  return { success: true, userId: data.user?.id };
}
