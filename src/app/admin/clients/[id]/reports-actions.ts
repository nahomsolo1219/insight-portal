'use server';

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { appointments, properties, reports } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';
import { reportPath } from '@/lib/storage/paths';
import { deleteFile, uploadFile } from '@/lib/storage/upload';
import { validateFile } from '@/lib/storage/validation';

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

// Report types. `reports.type` is free text in the schema, so this is a UI
// contract only — the portal's icon/tone lookup recognises `inspection` and
// `assessment`; the rest fall back to a generic file icon.
export type ReportType = 'inspection' | 'assessment' | 'service' | 'maintenance' | 'other';

const REPORT_TYPES: readonly ReportType[] = [
  'inspection',
  'assessment',
  'service',
  'maintenance',
  'other',
] as const;

export interface ReportMetadataInput {
  /** Title as typed by the admin. The vendor name leads at render time, so
   *  this is just the descriptive part (e.g. "Annual inspection"). */
  name: string;
  /** YYYY-MM-DD. */
  date: string;
  type: ReportType;
  /** The subcontractor who produced the report. Optional — falls back to the
   *  title alone when absent. */
  vendorId?: string | null;
  /** Optional link to the visit that produced the report. */
  appointmentId?: string | null;
}

function validateMetadata(input: ReportMetadataInput): string | null {
  if (!input.name?.trim()) return 'Title is required';
  if (input.name.trim().length > 200) return 'Title is too long';
  if (!input.date) return 'Date is required';
  if (!REPORT_TYPES.includes(input.type)) return 'Invalid report type';
  return null;
}

/**
 * Upload a single subcontractor report PDF against a property. Mirrors the
 * documents upload path: verify ownership, land the file in storage via
 * `reportPath()`, then insert the row — rolling storage back if the DB
 * insert fails so the bucket never keeps an orphan.
 */
export async function uploadReport(
  clientId: string,
  propertyId: string,
  metadata: ReportMetadataInput,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAdmin();

  const metaError = validateMetadata(metadata);
  if (metaError) return { success: false, error: metaError };

  // Ownership: the property exists AND belongs to this client. RLS also
  // enforces it; this gives a clean error instead of a generic failure.
  const [property] = await db
    .select({ id: properties.id, clientId: properties.clientId })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  if (!property || property.clientId !== clientId) {
    return { success: false, error: 'Property not found' };
  }

  // Optional appointment must belong to the same property.
  if (metadata.appointmentId) {
    const [appt] = await db
      .select({ propertyId: appointments.propertyId })
      .from(appointments)
      .where(eq(appointments.id, metadata.appointmentId))
      .limit(1);
    if (!appt || appt.propertyId !== propertyId) {
      return { success: false, error: 'Linked appointment is not on this property' };
    }
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'Please attach a PDF' };
  }
  const validation = validateFile(file, 'pdf');
  if (!validation.ok) return { success: false, error: validation.error };

  const reportId = randomUUID();
  const path = reportPath(clientId, reportId);

  const uploadResult = await uploadFile({
    path,
    file,
    contentType: file.type || 'application/pdf',
  });
  if ('error' in uploadResult) {
    return { success: false, error: uploadResult.error };
  }

  try {
    await db.insert(reports).values({
      id: reportId,
      propertyId,
      name: metadata.name.trim(),
      date: metadata.date,
      type: metadata.type,
      vendorId: metadata.vendorId || null,
      appointmentId: metadata.appointmentId || null,
      storagePath: path,
    });
  } catch (error) {
    console.error('[uploadReport] db insert failed — rolling back storage:', error);
    await deleteFile(path);
    return { success: false, error: 'Database insert failed; storage rolled back.' };
  }

  await logAudit({
    actor: user,
    action: 'uploaded report',
    targetType: 'report',
    targetId: reportId,
    targetLabel: metadata.name.trim(),
    clientId,
    metadata: { propertyId, type: metadata.type, vendorId: metadata.vendorId ?? null },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath('/admin');
  return { success: true, data: { id: reportId } };
}

/**
 * Edit a report's metadata (title, date, type, vendor, appointment). The PDF
 * itself is not replaced here — delete and re-upload for that.
 */
export async function updateReport(
  reportId: string,
  clientId: string,
  metadata: ReportMetadataInput,
): Promise<ActionResult> {
  const user = await requireAdmin();

  const metaError = validateMetadata(metadata);
  if (metaError) return { success: false, error: metaError };

  // Load the report + its property owner so we can confirm this client owns
  // it before mutating.
  const [row] = await db
    .select({ id: reports.id, propertyId: reports.propertyId, ownerClientId: properties.clientId })
    .from(reports)
    .innerJoin(properties, eq(properties.id, reports.propertyId))
    .where(eq(reports.id, reportId))
    .limit(1);
  if (!row || row.ownerClientId !== clientId) {
    return { success: false, error: 'Report not found' };
  }

  if (metadata.appointmentId) {
    const [appt] = await db
      .select({ propertyId: appointments.propertyId })
      .from(appointments)
      .where(eq(appointments.id, metadata.appointmentId))
      .limit(1);
    if (!appt || appt.propertyId !== row.propertyId) {
      return { success: false, error: 'Linked appointment is not on this property' };
    }
  }

  try {
    await db
      .update(reports)
      .set({
        name: metadata.name.trim(),
        date: metadata.date,
        type: metadata.type,
        vendorId: metadata.vendorId || null,
        appointmentId: metadata.appointmentId || null,
        updatedAt: new Date(),
      })
      .where(eq(reports.id, reportId));
  } catch (error) {
    console.error('[updateReport]', error);
    return { success: false, error: 'Failed to update report' };
  }

  await logAudit({
    actor: user,
    action: 'updated report',
    targetType: 'report',
    targetId: reportId,
    targetLabel: metadata.name.trim(),
    clientId,
    metadata: { type: metadata.type, vendorId: metadata.vendorId ?? null },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  return { success: true };
}

/**
 * Delete a report. DB row first (same reasoning as deleteDocument — a stale
 * row pointing at a missing file is worse than an orphaned object).
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

    if (!report) return { success: false, error: 'Report not found' };

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
    return { success: false, error: 'Failed to delete report' };
  }
}
