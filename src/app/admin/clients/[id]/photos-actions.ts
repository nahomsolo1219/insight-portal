'use server';

import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { photos, properties } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';
import { photoPath } from '@/lib/storage/paths';
import { deleteFile, uploadFile } from '@/lib/storage/upload';
import { getExtension, validateFile } from '@/lib/storage/validation';

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

export type PhotoTag = 'before' | 'during' | 'after';
export type PhotoStatus = 'pending' | 'categorized' | 'rejected';

const PHOTO_TAGS: readonly PhotoTag[] = ['before', 'during', 'after'] as const;

export interface UploadPhotosInput {
  projectId?: string | null;
  milestoneId?: string | null;
  tag?: PhotoTag | null;
  category?: string | null;
  caption?: string;
}

export interface UploadPhotosOutcome {
  uploadedCount: number;
  failedCount: number;
  errors: { name: string; error: string }[];
}

/**
 * Admin upload of photos. Field-staff uploads use a separate path (mobile
 * capture, different auth). If the admin supplies a tag, the photos land
 * as `categorized` and skip the review queue — otherwise they come in as
 * `pending` so the standard moderation workflow still applies.
 */
export async function uploadPhotos(
  clientId: string,
  propertyId: string,
  input: UploadPhotosInput,
  formData: FormData,
): Promise<ActionResult<UploadPhotosOutcome>> {
  const user = await requireAdmin();

  if (input.tag && !PHOTO_TAGS.includes(input.tag)) {
    return { success: false, error: 'Invalid tag.' };
  }

  // Property ownership check (belt-and-suspenders with RLS).
  const [prop] = await db
    .select({ clientId: properties.clientId })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  if (!prop || prop.clientId !== clientId) {
    return { success: false, error: 'Property not found.' };
  }

  const files = formData
    .getAll('files')
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { success: false, error: 'No photos to upload.' };

  const errors: UploadPhotosOutcome['errors'] = [];
  const uploadedIds: string[] = [];

  for (const file of files) {
    const validation = validateFile(file, 'image');
    if (!validation.ok) {
      errors.push({ name: file.name, error: validation.error });
      continue;
    }

    const photoId = randomUUID();
    const ext = getExtension(file.name) || 'jpg';
    const path = photoPath(clientId, propertyId, photoId, ext);

    const uploadResult = await uploadFile({
      path,
      file,
      contentType: file.type || 'image/jpeg',
    });
    if ('error' in uploadResult) {
      errors.push({ name: file.name, error: uploadResult.error });
      continue;
    }

    try {
      await db.insert(photos).values({
        id: photoId,
        propertyId,
        projectId: input.projectId || null,
        milestoneId: input.milestoneId || null,
        uploadedByUserId: user.id,
        uploadedByName: user.fullName,
        caption: input.caption?.trim() || file.name,
        tag: input.tag ?? null,
        category: input.category?.trim() || null,
        // Auto-categorize when the admin supplied a tag up-front; otherwise
        // the photo needs review before clients can see it.
        status: input.tag ? 'categorized' : 'pending',
        storagePath: path,
      });
      uploadedIds.push(photoId);
    } catch (error) {
      console.error('[uploadPhotos] db insert failed — rolling back storage:', error);
      await deleteFile(path);
      errors.push({ name: file.name, error: 'Database insert failed; storage rolled back.' });
    }
  }

  if (uploadedIds.length > 0) {
    await logAudit({
      actor: user,
      action: 'uploaded photo',
      targetType: 'photo',
      targetLabel:
        uploadedIds.length === 1 ? (files[0]?.name ?? 'photo') : `${uploadedIds.length} photos`,
      clientId,
      metadata: { propertyId, autoCategorized: Boolean(input.tag) },
    });
  }

  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath('/admin'); // dashboard photos-pending badge

  return {
    success: true,
    data: { uploadedCount: uploadedIds.length, failedCount: errors.length, errors },
  };
}

export interface CategorizePhotoInput {
  tag: PhotoTag;
  category?: string | null;
  projectId?: string | null;
  milestoneId?: string | null;
}

/**
 * Categorize a single photo — set its tag + optional category/project/
 * milestone, flip status to `categorized`. The scoped join against
 * `properties` is how we enforce "admin can only touch photos on their
 * own clients' properties" without trusting just RLS.
 */
export async function categorizePhoto(
  photoId: string,
  clientId: string,
  input: CategorizePhotoInput,
): Promise<ActionResult> {
  const user = await requireAdmin();

  if (!PHOTO_TAGS.includes(input.tag)) {
    return { success: false, error: 'Invalid tag.' };
  }

  try {
    const [photo] = await db
      .select({ id: photos.id, caption: photos.caption })
      .from(photos)
      .innerJoin(properties, eq(properties.id, photos.propertyId))
      .where(and(eq(photos.id, photoId), eq(properties.clientId, clientId)))
      .limit(1);

    if (!photo) return { success: false, error: 'Photo not found.' };

    await db
      .update(photos)
      .set({
        tag: input.tag,
        category: input.category?.trim() || null,
        projectId: input.projectId || null,
        milestoneId: input.milestoneId || null,
        status: 'categorized',
      })
      .where(eq(photos.id, photoId));

    await logAudit({
      actor: user,
      action: 'categorized photo',
      targetType: 'photo',
      targetId: photo.id,
      targetLabel: photo.caption || 'Untitled photo',
      clientId,
      metadata: { tag: input.tag, category: input.category ?? null },
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('[categorizePhoto]', error);
    return { success: false, error: 'Failed to categorize photo.' };
  }
}

export interface BulkCategorizeInput {
  tag: PhotoTag;
  category?: string | null;
  projectId?: string | null;
}

/**
 * Categorize many photos in one statement. Validates that every id
 * belongs to a property on this client before writing — blocks the
 * classic "forge a stranger's photo id via DevTools" attempt.
 */
export async function bulkCategorizePhotos(
  photoIds: string[],
  clientId: string,
  input: BulkCategorizeInput,
): Promise<ActionResult<{ updatedCount: number }>> {
  const user = await requireAdmin();

  if (photoIds.length === 0) return { success: false, error: 'No photos selected.' };
  if (!PHOTO_TAGS.includes(input.tag)) {
    return { success: false, error: 'Invalid tag.' };
  }

  try {
    const owned = await db
      .select({ id: photos.id })
      .from(photos)
      .innerJoin(properties, eq(properties.id, photos.propertyId))
      .where(and(inArray(photos.id, photoIds), eq(properties.clientId, clientId)));

    const ownedIds = owned.map((r) => r.id);
    if (ownedIds.length === 0) return { success: false, error: 'Photos not found.' };

    await db
      .update(photos)
      .set({
        tag: input.tag,
        category: input.category?.trim() || null,
        projectId: input.projectId || null,
        status: 'categorized',
      })
      .where(inArray(photos.id, ownedIds));

    await logAudit({
      actor: user,
      action: 'categorized photo',
      targetType: 'photo',
      targetLabel: `${ownedIds.length} photos`,
      clientId,
      metadata: { tag: input.tag, category: input.category ?? null, count: ownedIds.length },
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin');
    return { success: true, data: { updatedCount: ownedIds.length } };
  } catch (error) {
    console.error('[bulkCategorizePhotos]', error);
    return { success: false, error: 'Failed to categorize photos.' };
  }
}

/**
 * Reject a photo — stays in the DB + bucket but hidden from the client
 * view. The row keeps its tag/category/project so an admin can un-reject
 * later by re-categorizing.
 */
export async function rejectPhoto(photoId: string, clientId: string): Promise<ActionResult> {
  const user = await requireAdmin();

  try {
    const [photo] = await db
      .select({ id: photos.id, caption: photos.caption })
      .from(photos)
      .innerJoin(properties, eq(properties.id, photos.propertyId))
      .where(and(eq(photos.id, photoId), eq(properties.clientId, clientId)))
      .limit(1);

    if (!photo) return { success: false, error: 'Photo not found.' };

    await db.update(photos).set({ status: 'rejected' }).where(eq(photos.id, photoId));

    await logAudit({
      actor: user,
      action: 'rejected photo',
      targetType: 'photo',
      targetId: photo.id,
      targetLabel: photo.caption || 'Untitled photo',
      clientId,
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('[rejectPhoto]', error);
    return { success: false, error: 'Failed to reject photo.' };
  }
}

/**
 * Reject many photos at once — mirror of bulkCategorize, used by the
 * floating action bar.
 */
export async function bulkRejectPhotos(
  photoIds: string[],
  clientId: string,
): Promise<ActionResult<{ updatedCount: number }>> {
  const user = await requireAdmin();
  if (photoIds.length === 0) return { success: false, error: 'No photos selected.' };

  try {
    const owned = await db
      .select({ id: photos.id })
      .from(photos)
      .innerJoin(properties, eq(properties.id, photos.propertyId))
      .where(and(inArray(photos.id, photoIds), eq(properties.clientId, clientId)));

    const ownedIds = owned.map((r) => r.id);
    if (ownedIds.length === 0) return { success: false, error: 'Photos not found.' };

    await db.update(photos).set({ status: 'rejected' }).where(inArray(photos.id, ownedIds));

    await logAudit({
      actor: user,
      action: 'rejected photo',
      targetType: 'photo',
      targetLabel: `${ownedIds.length} photos`,
      clientId,
      metadata: { count: ownedIds.length },
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin');
    return { success: true, data: { updatedCount: ownedIds.length } };
  } catch (error) {
    console.error('[bulkRejectPhotos]', error);
    return { success: false, error: 'Failed to reject photos.' };
  }
}

/**
 * Hard-delete a photo: DB row first, then the blob. Matches documents /
 * reports / invoices ordering.
 */
export async function deletePhoto(photoId: string, clientId: string): Promise<ActionResult> {
  const user = await requireAdmin();

  try {
    const [photo] = await db
      .select({ id: photos.id, caption: photos.caption, storagePath: photos.storagePath })
      .from(photos)
      .innerJoin(properties, eq(properties.id, photos.propertyId))
      .where(and(eq(photos.id, photoId), eq(properties.clientId, clientId)))
      .limit(1);

    if (!photo) return { success: false, error: 'Photo not found.' };

    await db.delete(photos).where(eq(photos.id, photoId));

    const storageOk = await deleteFile(photo.storagePath);
    if (!storageOk) {
      console.warn(`[deletePhoto] storage delete failed for ${photo.storagePath}`);
    }

    await logAudit({
      actor: user,
      action: 'deleted photo',
      targetType: 'photo',
      targetId: photo.id,
      targetLabel: photo.caption || 'Untitled photo',
      clientId,
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('[deletePhoto]', error);
    return { success: false, error: 'Failed to delete photo.' };
  }
}

/**
 * Hard-delete many photos in one action. Paths are collected up-front so
 * the DB delete runs as a single statement; storage deletes go one at a
 * time afterwards. Bucket orphans on storage failure are acceptable.
 */
export async function bulkDeletePhotos(
  photoIds: string[],
  clientId: string,
): Promise<ActionResult<{ deletedCount: number }>> {
  const user = await requireAdmin();
  if (photoIds.length === 0) return { success: false, error: 'No photos selected.' };

  try {
    const owned = await db
      .select({ id: photos.id, storagePath: photos.storagePath })
      .from(photos)
      .innerJoin(properties, eq(properties.id, photos.propertyId))
      .where(and(inArray(photos.id, photoIds), eq(properties.clientId, clientId)));

    if (owned.length === 0) return { success: false, error: 'Photos not found.' };

    const ownedIds = owned.map((r) => r.id);
    await db.delete(photos).where(inArray(photos.id, ownedIds));

    for (const row of owned) {
      const ok = await deleteFile(row.storagePath);
      if (!ok) console.warn(`[bulkDeletePhotos] storage delete failed for ${row.storagePath}`);
    }

    await logAudit({
      actor: user,
      action: 'deleted photo',
      targetType: 'photo',
      targetLabel: `${ownedIds.length} photos`,
      clientId,
      metadata: { count: ownedIds.length },
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin');
    return { success: true, data: { deletedCount: ownedIds.length } };
  } catch (error) {
    console.error('[bulkDeletePhotos]', error);
    return { success: false, error: 'Failed to delete photos.' };
  }
}

