'use server';

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { documents, projects, properties } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';
import { documentPath } from '@/lib/storage/paths';
import { deleteFile, uploadFile } from '@/lib/storage/upload';
import { validateFile } from '@/lib/storage/validation';

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

export type DocumentType = 'contract' | 'drawing' | 'permit' | 'spec_sheet' | 'warranty' | 'other';

const DOCUMENT_TYPES: readonly DocumentType[] = [
  'contract',
  'drawing',
  'permit',
  'spec_sheet',
  'warranty',
  'other',
] as const;

export interface UploadDocumentsOutcome {
  uploadedCount: number;
  failedCount: number;
  /**
   * Per-file error messages for failed uploads. The client surfaces these
   * inline so the user can retry just the missing files.
   */
  errors: { name: string; error: string }[];
}

/**
 * Upload N files as documents against a single project. One audit entry per
 * batch (not per file) so the activity feed stays readable. If a DB insert
 * fails after a successful storage upload, we roll the file back to keep the
 * bucket clean.
 */
export async function uploadDocuments(
  clientId: string,
  projectId: string,
  documentType: DocumentType,
  formData: FormData,
): Promise<ActionResult<UploadDocumentsOutcome>> {
  const user = await requireAdmin();

  if (!DOCUMENT_TYPES.includes(documentType)) {
    return { success: false, error: 'Invalid document type' };
  }

  // Verify the project exists AND is owned by this client. RLS also enforces
  // this, but the server action belt-and-suspenders check gives a clean error
  // message rather than a generic "upload failed".
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      propertyId: projects.propertyId,
      ownerClientId: properties.clientId,
    })
    .from(projects)
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project || project.ownerClientId !== clientId) {
    return { success: false, error: 'Project not found' };
  }

  const files = formData
    .getAll('files')
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0) return { success: false, error: 'No files to upload' };

  const errors: UploadDocumentsOutcome['errors'] = [];
  const uploadedDocs: { id: string; name: string }[] = [];

  for (const file of files) {
    const validation = validateFile(file, 'any');
    if (!validation.ok) {
      errors.push({ name: file.name, error: validation.error });
      continue;
    }

    const docId = randomUUID();
    const path = documentPath(clientId, projectId, docId, file.name);

    const uploadResult = await uploadFile({
      path,
      file,
      contentType: file.type || 'application/octet-stream',
    });

    if ('error' in uploadResult) {
      errors.push({ name: file.name, error: uploadResult.error });
      continue;
    }

    try {
      const [inserted] = await db
        .insert(documents)
        .values({
          id: docId,
          projectId,
          name: file.name,
          // DB column is `date` (not timestamp) — store local calendar day.
          date: new Date().toISOString().slice(0, 10),
          type: documentType,
          storagePath: path,
        })
        .returning({ id: documents.id, name: documents.name });

      uploadedDocs.push(inserted);
    } catch (error) {
      console.error('[uploadDocuments] db insert failed — rolling back storage:', error);
      await deleteFile(path);
      errors.push({
        name: file.name,
        error: 'Database insert failed; storage rolled back.',
      });
    }
  }

  if (uploadedDocs.length > 0) {
    await logAudit({
      actor: user,
      action: 'uploaded document',
      targetType: 'document',
      targetLabel:
        uploadedDocs.length === 1
          ? uploadedDocs[0].name
          : `${uploadedDocs.length} documents to ${project.name}`,
      clientId,
      metadata: { projectId, documentType, count: uploadedDocs.length },
    });
  }

  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath('/admin');

  return {
    success: true,
    data: {
      uploadedCount: uploadedDocs.length,
      failedCount: errors.length,
      errors,
    },
  };
}

/**
 * Delete a document. DB row goes first so we can recover from a flaky
 * storage delete on next run if needed — the reverse ordering would leave
 * us with a row pointing at a missing object.
 */
export async function deleteDocument(
  documentId: string,
  clientId: string,
): Promise<ActionResult> {
  const user = await requireAdmin();

  try {
    const [doc] = await db
      .select({ id: documents.id, name: documents.name, storagePath: documents.storagePath })
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!doc) return { success: false, error: 'Document not found' };

    await db.delete(documents).where(eq(documents.id, documentId));

    // Best-effort: if the storage delete fails the row is already gone,
    // which is the state we want the UI to reflect. An orphan in the bucket
    // can be cleaned up later; a stale DB row pointing at a deleted file is
    // worse.
    const storageOk = await deleteFile(doc.storagePath);
    if (!storageOk) {
      console.warn(`[deleteDocument] storage delete failed for ${doc.storagePath}`);
    }

    await logAudit({
      actor: user,
      action: 'deleted document',
      targetType: 'document',
      targetId: doc.id,
      targetLabel: doc.name,
      clientId,
    });

    revalidatePath(`/admin/clients/${clientId}`);
    return { success: true };
  } catch (error) {
    console.error('[deleteDocument]', error);
    return { success: false, error: 'Failed to delete document' };
  }
}
