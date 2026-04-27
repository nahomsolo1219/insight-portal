'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { profiles } from '@/db/schema';
import { requireUser } from '@/lib/auth/current-user';
import { avatarPath } from '@/lib/storage/paths';
import { getSignedUrl, uploadFile } from '@/lib/storage/upload';
import { getExtension, validateFile } from '@/lib/storage/validation';

interface UploadAvatarSuccess {
  success: true;
  url: string;
}
type UploadAvatarResult = UploadAvatarSuccess | { success: false; error: string };

const AVATAR_MAX_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Upload (or replace) the currently-signed-in user's profile avatar. Lives
 * at `avatars/profile/{userId}.{ext}` — admin-only path under the existing
 * RLS, so clients never accidentally read another user's avatar.
 *
 * Storage column reuse: we persist the path on `profiles.avatarUrl` even
 * though the column name reads "URL". The schema comment + CLAUDE.md call
 * this out — renaming would mean rewriting every reader, and the
 * sign-at-read pattern relies on the path anyway.
 *
 * No UI calls this yet (admin profile page is a follow-up). The action is
 * here so the hook-up later is one Edit call away.
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
  const path = avatarPath('profile', user.id, ext);

  const result = await uploadFile({
    path,
    file,
    contentType: file.type || 'image/jpeg',
    upsert: true,
  });
  if ('error' in result) return { success: false, error: result.error };

  await db
    .update(profiles)
    .set({ avatarUrl: result.path, updatedAt: new Date() })
    .where(eq(profiles.id, user.id));

  const signedUrl = await getSignedUrl(result.path);

  // Revalidate the layouts that show the user chip. Portal uses the
  // layout-mode form so the per-property PortalNav (which sits below
  // /portal/layout.tsx) picks up the new avatar too.
  revalidatePath('/admin');
  revalidatePath('/portal', 'layout');
  return { success: true, url: signedUrl ?? '' };
}
