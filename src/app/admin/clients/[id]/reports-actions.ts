'use server';

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { properties, reports } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';
import { reportPath } from '@/lib/storage/paths';
import { deleteFile, uploadFile } from '@/lib/storage/upload';
import { validateFile } from '@/lib/storage/validation';

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

export type ReportType = 'inspection' | 'assessment' | 'update' | 'year_end';

const REPORT_TYPES: readonly ReportType[] = [
  'inspection',
  'assessment',
  'update',
  'year_end',
] as const;

export interface UploadReportInput {
  name: string;
  type: ReportType;
  vendorId?: string | null;
  projectId?: string | null;
  /** YYYY-MM-DD. Defaults to today. */
  date?: string;
}

/**
 * Upload a single PDF as a report for a property. Reports are one-file-at-a-time
 * (unlike Documents' multi-file flow) — they represent a discrete deliverable
 * like an inspection report or a year-end summary.
 *
 * The property→client ownership check is belt-and-suspenders; RLS also
 * enforces it, but the server action check produces a cleaner error
 * message than a generic storage failure.
 */
export async function uploadReport(
  clientId: string,
  propertyId: string,
  input: UploadReportInput,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireAdmin();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'Please select a PDF file.' };
  }

  const validation = validateFile(file, 'pdf');
  if (!validation.ok) return { success: false, error: validation.error };

  if (!input.name?.trim()) return { success: false, error: 'Report name is required.' };

  if (!REPORT_TYPES.includes(input.type)) {
    return { success: false, error: 'Invalid report type.' };
  }

  // Verify the property exists AND is owned by this client.
  const [property] = await db
    .select({ id: properties.id, clientId: properties.clientId })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);

  if (!property || property.clientId !== clientId) {
    return { success: false, error: 'Property not found.' };
  }

  const reportId = randomUUID();
  const path = reportPath(clientId, reportId);

  const uploadResult = await uploadFile({
    path,
    file,
    contentType: 'application/pdf',
  });
  if ('error' in uploadResult) return { success: false, error: uploadResult.error };

  try {
    await db.insert(reports).values({
      id: reportId,
      propertyId,
      projectId: input.projectId || null,
      name: input.name.trim(),
      date: input.date || new Date().toISOString().slice(0, 10),
      vendorId: input.vendorId || null,
      type: input.type,
      storagePath: path,
      isNew: true,
    });

    await logAudit({
      actor: user,
      action: 'uploaded report',
      targetType: 'report',
      targetId: reportId,
      targetLabel: input.name.trim(),
      clientId,
      metadata: { propertyId, type: input.type },
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('[uploadReport] db insert failed — rolling back storage:', error);
    await deleteFile(path);
    return { success: false, error: 'Failed to save report.' };
  }
}

/**
 * Delete a report. DB row first, then storage (same ordering as Documents —
 * if storage delete flakes we're left with an orphan in the bucket, which is
 * recoverable; the reverse ordering would leave a row pointing at nothing).
 */
export async function deleteReport(
  reportId: string,
  clientId: string,
): Promise<ActionResult> {
  const user = await requireAdmin();

  try {
    const [report] = await db
      .select({ id: reports.id, name: reports.name, storagePath: reports.storagePath })
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1);

    if (!report) return { success: false, error: 'Report not found.' };

    await db.delete(reports).where(eq(reports.id, reportId));

    const storageOk = await deleteFile(report.storagePath);
    if (!storageOk) {
      console.warn(`[deleteReport] storage delete failed for ${report.storagePath}`);
    }

    await logAudit({
      actor: user,
      action: 'deleted report',
      targetType: 'report',
      targetId: report.id,
      targetLabel: report.name,
      clientId,
    });

    revalidatePath(`/admin/clients/${clientId}`);
    return { success: true };
  } catch (error) {
    console.error('[deleteReport]', error);
    return { success: false, error: 'Failed to delete report.' };
  }
}

/**
 * Flip `isNew` → false. Called when the admin downloads a report so the
 * "New" dot disappears on the next render. Swallows errors: if this fails
 * the UI just keeps showing the dot, which is harmless.
 */
export async function markReportRead(
  reportId: string,
  clientId: string,
): Promise<ActionResult> {
  await requireAdmin();

  try {
    await db.update(reports).set({ isNew: false }).where(eq(reports.id, reportId));
    revalidatePath(`/admin/clients/${clientId}`);
    return { success: true };
  } catch (error) {
    console.error('[markReportRead]', error);
    return { success: false, error: 'Failed to update report.' };
  }
}
