'use server';

// Per-user avatar upload + read for any signed-in role. Lives at the
// app root because both admin (`/admin`) and portal (`/portal`)
// surfaces invoke it from their own profile-edit modals — co-locating
// it under either tree would be misleading.
//
// Storage: the public `avatars` bucket (folder is the auth.users.id,
// per-user RLS in manual_avatars_storage.sql). Per-user folders mean
// a forged request can't drop an avatar in someone else's slot, even
// though the bucket is public-read.
//
// DB: persisted on `profiles.avatarUrl` despite the column name
// reading "URL" — the schema comment + CLAUDE.md call this out;
// renaming would be a much wider edit. We store the in-bucket *path*
// (`{userId}/avatar.{ext}`), not a full URL — `getAvatarPublicUrl`
// composes the URL at read time so cache-busting via `?v=…` works.

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { profiles } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth/current-user';
import { AVATARS_BUCKET, userAvatarPath } from '@/lib/storage/paths';
import { getAvatarPublicUrl } from '@/lib/storage/upload';
import { getExtension, validateFile } from '@/lib/storage/validation';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

interface UploadAvatarSuccess {
  success: true;
  url: string;
}
type UploadAvatarResult = UploadAvatarSuccess | { success: false; error: string };

const AVATAR_MAX_SIZE = 5 * 1024 * 1024; // 5 MB — matches the bucket cap.

/**
 * Upload (or replace) the currently-signed-in user's avatar. Writes
 * to the public `avatars` bucket via the cookie-bound supabase
 * client so the per-user storage RLS is the second line of defence
 * (`requireUser()` is the first).
 *
 * Caller surfaces:
 *   - `AvatarUpload` in the admin Edit-profile modal (Session 7).
 *   - The portal Edit-profile modal would call this too, once the
 *     portal builds an avatar affordance.
 */
export async function uploadProfileAvatar(
  formData: FormData,
): Promise<UploadAvatarResult> {
  const user = await requireUser();

  const file = formData.get('avatar');
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'No image selected.' };
  }

  const validation = validateFile(file, 'image', AVATAR_MAX_SIZE);
  if (!validation.ok) return { success: false, error: validation.error };

  const ext = getExtension(file.name) || 'jpg';
  const path = userAvatarPath(user.id, ext);

  const supabase = await createServerSupabase();
  const { error: uploadError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: true,
    });

  if (uploadError) {
    console.error('[uploadProfileAvatar]', uploadError);
    return { success: false, error: uploadError.message };
  }

  // Persist the path + bump updated_at so cache busting via
  // `?v={updated_at_ms}` reflects the replace immediately.
  const updatedAt = new Date();
  await db
    .update(profiles)
    .set({ avatarUrl: path, updatedAt })
    .where(eq(profiles.id, user.id));

  // Revalidate every layout that renders the avatar chip so the new
  // image appears without a hard refresh. Admin layout owns the
  // header avatar; portal layout owns the sidebar profile row.
  revalidatePath('/admin', 'layout');
  revalidatePath('/portal', 'layout');

  const url = getAvatarPublicUrl(path, updatedAt.getTime()) ?? '';
  return { success: true, url };
}

// ---------------------------------------------------------------------------
// Admin self-service profile edit
// ---------------------------------------------------------------------------
//
// The portal has its own `updateMyProfile` (in src/app/portal/actions.ts)
// because client-portal users edit the `clients` row their profile is
// linked to — that's where their household name + contact info actually
// live. Admins don't have a `clients` row; their identity lives on the
// `profiles` row directly, so we need a parallel action that targets
// that table instead.
//
// Email is intentionally not editable here — Supabase Auth owns it,
// and changing it would require triggering a magic-link confirmation
// flow (out of scope for Session 7). The form renders the field as
// read-only.

interface UpdateAdminProfileInput {
  fullName?: string;
  phone?: string | null;
}

type UpdateAdminProfileResult =
  | { success: true }
  | { success: false; error: string };

export async function updateMyAdminProfile(
  input: UpdateAdminProfileInput,
): Promise<UpdateAdminProfileResult> {
  const user = await requireUser();
  if (user.role !== 'admin') {
    return { success: false, error: 'Only admins can update their profile here.' };
  }

  if (input.fullName !== undefined && !input.fullName.trim()) {
    return { success: false, error: 'Name cannot be empty.' };
  }

  const updates: Record<string, unknown> = {};
  if (input.fullName !== undefined) updates.fullName = input.fullName.trim();
  if (input.phone !== undefined) updates.phone = input.phone?.trim() || null;

  if (Object.keys(updates).length === 0) return { success: true };
  updates.updatedAt = new Date();

  try {
    await db.update(profiles).set(updates).where(eq(profiles.id, user.id));

    await logAudit({
      actor: user,
      action: 'updated profile',
      targetType: 'profile',
      targetId: user.id,
      targetLabel:
        typeof updates.fullName === 'string' ? updates.fullName : 'self-edit',
      clientId: null,
      metadata: { source: 'admin-self-service' },
    });

    // Header avatar chip + sidebar profile rows live in the admin
    // layout; revalidating it picks up the new name immediately.
    revalidatePath('/admin', 'layout');
    return { success: true };
  } catch (error) {
    console.error('[updateMyAdminProfile]', error);
    return { success: false, error: 'Failed to update profile.' };
  }
}
