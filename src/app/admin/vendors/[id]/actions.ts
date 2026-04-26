'use server';

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { vendorDocuments, vendors } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';
import { vendorDocumentPath } from '@/lib/storage/paths';
import { deleteFile, uploadFile } from '@/lib/storage/upload';
import { getExtension, validateFile } from '@/lib/storage/validation';

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

export type VendorDocumentTypeInput =
  | 'insurance'
  | 'w9'
  | 'license'
  | 'contract'
  | 'certificate'
  | 'other';

const ALLOWED_TYPES: readonly VendorDocumentTypeInput[] = [
  'insurance',
  'w9',
  'license',
  'contract',
  'certificate',
  'other',
] as const;

function isValidType(value: unknown): value is VendorDocumentTypeInput {
  return typeof value === 'string' && (ALLOWED_TYPES as readonly string[]).includes(value);
}

export interface UploadVendorDocumentInput {
  name: string;
  type: VendorDocumentTypeInput;
  /** YYYY-MM-DD. Only meaningful for insurance / license types. */
  expirationDate?: string | null;
  notes?: string | null;
}

/**
 * Upload a single document to a vendor. PDFs and image scans (HEIC,
 * JPEG, PNG, WebP) are both allowed because insurance certificates
 * arrive both ways. The path is built server-side from a fresh UUID so a
 * forged client can't direct the upload at another folder. Vendor
 * existence is verified before insert.
 */
export async function uploadVendorDocument(
  vendorId: string,
  input: UploadVendorDocumentInput,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAdmin();

  const name = input.name?.trim() ?? '';
  if (!name) return { success: false, error: 'Document name is required.' };
  if (!isValidType(input.type)) return { success: false, error: 'Invalid document type.' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'Please attach a file.' };
  }

  const validation = validateFile(file, 'any');
  if (!validation.ok) return { success: false, error: validation.error };

  // Belt-and-braces vendor existence check — RLS allows the insert under
  // the FK constraint anyway, but a nicer error is preferable to a 500.
  const [vendor] = await db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(eq(vendors.id, vendorId))
    .limit(1);
  if (!vendor) return { success: false, error: 'Vendor not found.' };

  const docId = randomUUID();
  const ext = getExtension(file.name) || 'pdf';
  const path = vendorDocumentPath(vendorId, docId, ext);

  const uploadResult = await uploadFile({
    path,
    file,
    contentType: file.type || 'application/octet-stream',
  });
  if ('error' in uploadResult) {
    return { success: false, error: uploadResult.error };
  }

  try {
    const [row] = await db
      .insert(vendorDocuments)
      .values({
        id: docId,
        vendorId,
        name,
        type: input.type,
        storagePath: uploadResult.path,
        expirationDate: input.expirationDate || null,
        notes: input.notes?.trim() || null,
      })
      .returning({ id: vendorDocuments.id, name: vendorDocuments.name });

    await logAudit({
      actor: user,
      action: 'uploaded vendor document',
      targetType: 'vendor_document',
      targetId: row.id,
      targetLabel: `${vendor.name} · ${row.name}`,
      metadata: { vendorId, docType: input.type },
    });

    revalidatePath(`/admin/vendors/${vendorId}`);
    revalidatePath('/admin/vendors');
    return { success: true, data: { id: row.id } };
  } catch (error) {
    // Roll back the storage upload if the DB insert failed — otherwise
    // we leak an orphan file with no row pointing at it.
    console.error('[uploadVendorDocument]', error);
    void deleteFile(uploadResult.path);
    return { success: false, error: 'Failed to record document.' };
  }
}

export interface UpdateVendorDocumentInput {
  name: string;
  type: VendorDocumentTypeInput;
  expirationDate?: string | null;
  notes?: string | null;
}

/** Edit metadata on an existing document — file content stays the same. */
export async function updateVendorDocument(
  documentId: string,
  vendorId: string,
  input: UpdateVendorDocumentInput,
): Promise<ActionResult> {
  const user = await requireAdmin();

  const name = input.name?.trim() ?? '';
  if (!name) return { success: false, error: 'Document name is required.' };
  if (!isValidType(input.type)) return { success: false, error: 'Invalid document type.' };

  try {
    const [updated] = await db
      .update(vendorDocuments)
      .set({
        name,
        type: input.type,
        expirationDate: input.expirationDate || null,
        notes: input.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(vendorDocuments.id, documentId), eq(vendorDocuments.vendorId, vendorId)),
      )
      .returning({ id: vendorDocuments.id, name: vendorDocuments.name });

    if (!updated) return { success: false, error: 'Document not found.' };

    await logAudit({
      actor: user,
      action: 'updated vendor document',
      targetType: 'vendor_document',
      targetId: updated.id,
      targetLabel: updated.name,
      metadata: { vendorId, docType: input.type },
    });

    revalidatePath(`/admin/vendors/${vendorId}`);
    return { success: true };
  } catch (error) {
    console.error('[updateVendorDocument]', error);
    return { success: false, error: 'Failed to update document.' };
  }
}

/**
 * Delete a document — DB row first, then storage file. If storage
 * cleanup fails the row's already gone so the user sees success and the
 * orphan is the worst case (cheap to clean up later).
 */
export async function deleteVendorDocument(
  documentId: string,
  vendorId: string,
): Promise<ActionResult> {
  const user = await requireAdmin();

  try {
    const [doc] = await db
      .select({
        id: vendorDocuments.id,
        name: vendorDocuments.name,
        storagePath: vendorDocuments.storagePath,
      })
      .from(vendorDocuments)
      .where(
        and(eq(vendorDocuments.id, documentId), eq(vendorDocuments.vendorId, vendorId)),
      )
      .limit(1);

    if (!doc) return { success: false, error: 'Document not found.' };

    await db.delete(vendorDocuments).where(eq(vendorDocuments.id, documentId));

    // Background storage delete — already removed from DB, so user-visible
    // failure is just an orphan file.
    void deleteFile(doc.storagePath);

    await logAudit({
      actor: user,
      action: 'deleted vendor document',
      targetType: 'vendor_document',
      targetId: doc.id,
      targetLabel: doc.name,
      metadata: { vendorId },
    });

    revalidatePath(`/admin/vendors/${vendorId}`);
    return { success: true };
  } catch (error) {
    console.error('[deleteVendorDocument]', error);
    return { success: false, error: 'Failed to delete document.' };
  }
}
