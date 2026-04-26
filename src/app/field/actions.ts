'use server';

import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { photos, projects, properties } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth/current-user';
import { photoPath } from '@/lib/storage/paths';
import { uploadFile } from '@/lib/storage/upload';
import { getExtension, validateFile } from '@/lib/storage/validation';
import type { FieldProjectOption } from './queries';

interface UploadFieldPhotosSuccess {
  success: true;
  uploadedCount: number;
  failedCount: number;
  errors: { name: string; error: string }[];
}
type UploadFieldPhotosResult = UploadFieldPhotosSuccess | { success: false; error: string };

export interface UploadFieldPhotosInput {
  projectId?: string | null;
  caption?: string;
}

/**
 * Field-staff photo upload. Always lands the rows as `pending` so the
 * admin Photo Queue is the single source of truth for what gets shown
 * to a client.
 *
 * - Auth: `requireUser` then a hard-allowlist on role. Field staff and
 *   admins (the latter for testing) — not clients.
 * - Storage path: `photos/{clientId}/{propertyId}/{photoId}.{ext}` —
 *   matches the existing "Field staff upload photos" RLS that lets
 *   field staff INSERT only into the `photos/` prefix.
 * - Per-file isolation: a single bad file doesn't block the rest. We
 *   collect names + errors so the UI can surface "2 uploaded · 1
 *   failed — IMG_0042: too large" rather than a vague summary.
 * - Audits the batch as one entry, not one-per-photo, so the activity
 *   feed doesn't drown in field uploads.
 */
export async function uploadFieldPhotos(
  propertyId: string,
  input: UploadFieldPhotosInput,
  formData: FormData,
): Promise<UploadFieldPhotosResult> {
  const user = await requireUser();
  if (user.role !== 'field_staff' && user.role !== 'admin') {
    return { success: false, error: 'Not authorized.' };
  }

  // Resolve clientId — needed for the storage path + the audit row.
  const [property] = await db
    .select({
      id: properties.id,
      clientId: properties.clientId,
      name: properties.name,
    })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);

  if (!property) return { success: false, error: 'Property not found.' };

  const files = formData
    .getAll('photos')
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return { success: false, error: 'No photos selected.' };
  }

  const trimmedCaption = input.caption?.trim() ?? '';
  const projectId = input.projectId || null;
  // Fall back to email if the profile has no full_name yet (newly invited
  // staff land with full_name from user_metadata, but be safe).
  const uploadedByName = user.fullName || user.email;

  let uploadedCount = 0;
  let failedCount = 0;
  const errors: { name: string; error: string }[] = [];

  for (const file of files) {
    const validation = validateFile(file, 'image');
    if (!validation.ok) {
      failedCount += 1;
      errors.push({ name: file.name, error: validation.error });
      continue;
    }

    const photoId = randomUUID();
    const ext = getExtension(file.name) || 'jpg';
    const path = photoPath(property.clientId, propertyId, photoId, ext);

    const uploadResult = await uploadFile({
      path,
      file,
      contentType: file.type || 'image/jpeg',
    });
    if ('error' in uploadResult) {
      failedCount += 1;
      errors.push({ name: file.name, error: uploadResult.error });
      continue;
    }

    try {
      await db.insert(photos).values({
        id: photoId,
        propertyId,
        projectId,
        uploadedByUserId: user.id,
        uploadedByName,
        // Use the typed caption for every photo in the batch — keeps the
        // mobile flow one-thumb-tap simple. If the technician didn't type
        // anything, the original filename gives the office something to
        // grep on later.
        caption: trimmedCaption || file.name,
        status: 'pending',
        storagePath: uploadResult.path,
      });
      uploadedCount += 1;
    } catch (error) {
      console.error('[uploadFieldPhotos] db insert failed:', error);
      failedCount += 1;
      errors.push({ name: file.name, error: 'Database error.' });
    }
  }

  if (uploadedCount > 0) {
    await logAudit({
      actor: user,
      action: 'uploaded photo',
      targetType: 'photo',
      // No single targetId for a batch — surface the count + property in
      // the label so the audit row reads cleanly without hunting for
      // each photo individually.
      targetLabel: `${uploadedCount} ${uploadedCount === 1 ? 'photo' : 'photos'} → ${property.name}`,
      clientId: property.clientId,
      metadata: { propertyId, projectId, batchSize: uploadedCount },
    });
  }

  // Photo Queue + dashboard sidebar count both refresh so the office sees
  // the new pending photos without a manual reload.
  revalidatePath('/field');
  revalidatePath('/admin/photo-queue');
  revalidatePath('/admin');

  return { success: true, uploadedCount, failedCount, errors };
}

/**
 * Lookup projects for a property, callable from the client component
 * when the technician changes the property dropdown. Wraps the read in a
 * server action because the page needs to refresh the project picker
 * without a full navigation. Auth re-checked here — RLS would also
 * gate but the role check keeps the contract obvious.
 */
export async function getPropertyProjectsAction(
  propertyId: string,
): Promise<FieldProjectOption[]> {
  const user = await requireUser();
  if (user.role !== 'field_staff' && user.role !== 'admin') return [];
  return db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.propertyId, propertyId), eq(projects.status, 'active')))
    .orderBy(asc(projects.name));
}
