'use server';

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { invoices, projects, properties } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';
import { invoicePath } from '@/lib/storage/paths';
import { deleteFile, uploadFile } from '@/lib/storage/upload';
import { validateFile } from '@/lib/storage/validation';

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

export type InvoiceStatus = 'paid' | 'unpaid' | 'partial';

const INVOICE_STATUSES: readonly InvoiceStatus[] = ['paid', 'unpaid', 'partial'] as const;

export interface CreateInvoiceInput {
  invoiceNumber: string;
  description: string;
  /** Amount in cents — the UI is responsible for the dollars→cents conversion. */
  amountCents: number;
  /** YYYY-MM-DD */
  invoiceDate: string;
  /** YYYY-MM-DD */
  dueDate: string;
  status: InvoiceStatus;
  propertyId?: string | null;
  projectId?: string | null;
}

/**
 * Upload a PDF and create the structured invoice record. Unlike documents/
 * reports, invoices are client-scoped — the propertyId/projectId are both
 * optional (e.g. annual membership fees don't belong to any project).
 *
 * Defense-in-depth: when a property or project is supplied, verify it
 * actually belongs to this client. RLS also enforces this; the explicit
 * check surfaces a cleaner error.
 */
export async function createInvoice(
  clientId: string,
  input: CreateInvoiceInput,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireAdmin();

  if (!input.invoiceNumber?.trim()) {
    return { success: false, error: 'Invoice number is required.' };
  }
  if (!input.description?.trim()) {
    return { success: false, error: 'Description is required.' };
  }
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    return { success: false, error: 'Amount must be greater than zero.' };
  }
  if (!Number.isInteger(input.amountCents)) {
    return { success: false, error: 'Amount must be a whole number of cents.' };
  }
  if (!input.invoiceDate) return { success: false, error: 'Invoice date is required.' };
  if (!input.dueDate) return { success: false, error: 'Due date is required.' };
  if (!INVOICE_STATUSES.includes(input.status)) {
    return { success: false, error: 'Invalid payment status.' };
  }

  // Verify optional property ownership.
  if (input.propertyId) {
    const [prop] = await db
      .select({ clientId: properties.clientId })
      .from(properties)
      .where(eq(properties.id, input.propertyId))
      .limit(1);
    if (!prop || prop.clientId !== clientId) {
      return { success: false, error: 'Property not found.' };
    }
  }

  // Verify optional project ownership (must live on a property owned by this client).
  if (input.projectId) {
    const [proj] = await db
      .select({
        ownerClientId: properties.clientId,
        projectPropertyId: projects.propertyId,
      })
      .from(projects)
      .innerJoin(properties, eq(properties.id, projects.propertyId))
      .where(eq(projects.id, input.projectId))
      .limit(1);
    if (!proj || proj.ownerClientId !== clientId) {
      return { success: false, error: 'Project not found.' };
    }
    // If the caller supplied both, make sure they agree.
    if (input.propertyId && proj.projectPropertyId !== input.propertyId) {
      return { success: false, error: 'Project does not belong to the selected property.' };
    }
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'Please upload the invoice PDF.' };
  }

  const validation = validateFile(file, 'pdf');
  if (!validation.ok) return { success: false, error: validation.error };

  const invoiceId = randomUUID();
  const path = invoicePath(clientId, invoiceId);

  const uploadResult = await uploadFile({
    path,
    file,
    contentType: 'application/pdf',
  });
  if ('error' in uploadResult) return { success: false, error: uploadResult.error };

  try {
    await db.insert(invoices).values({
      id: invoiceId,
      clientId,
      propertyId: input.propertyId || null,
      projectId: input.projectId || null,
      invoiceNumber: input.invoiceNumber.trim(),
      description: input.description.trim(),
      amountCents: input.amountCents,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      status: input.status,
      storagePath: path,
    });

    await logAudit({
      actor: user,
      action: 'uploaded invoice',
      targetType: 'invoice',
      targetId: invoiceId,
      targetLabel: `${input.invoiceNumber.trim()} — ${formatCentsForLog(input.amountCents)}`,
      clientId,
      metadata: { status: input.status },
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin'); // dashboard outstanding stat
    return { success: true };
  } catch (error) {
    console.error('[createInvoice] db insert failed — rolling back storage:', error);
    await deleteFile(path);
    return { success: false, error: 'Failed to save invoice.' };
  }
}

/**
 * Flip an invoice's status from the inline dropdown in the table. Separate
 * action so we don't have to round-trip the whole record for one field.
 * Takes `clientId` as a parameter for audit/revalidation purposes — RLS
 * still enforces that the admin can only touch their own data.
 */
export async function updateInvoiceStatus(
  invoiceId: string,
  clientId: string,
  newStatus: InvoiceStatus,
): Promise<ActionResult> {
  const user = await requireAdmin();

  if (!INVOICE_STATUSES.includes(newStatus)) {
    return { success: false, error: 'Invalid status.' };
  }

  try {
    const [invoice] = await db
      .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, status: invoices.status })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.clientId, clientId)))
      .limit(1);

    if (!invoice) return { success: false, error: 'Invoice not found.' };

    // No-op if the status didn't actually change — avoids a useless audit row.
    if (invoice.status === newStatus) {
      return { success: true };
    }

    await db.update(invoices).set({ status: newStatus }).where(eq(invoices.id, invoiceId));

    await logAudit({
      actor: user,
      action: 'updated invoice status',
      targetType: 'invoice',
      targetId: invoice.id,
      targetLabel: `${invoice.invoiceNumber} → ${newStatus}`,
      clientId,
      metadata: { from: invoice.status, to: newStatus },
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('[updateInvoiceStatus]', error);
    return { success: false, error: 'Failed to update status.' };
  }
}

/**
 * Delete an invoice + its PDF. Same DB-first ordering as documents/reports:
 * an orphan blob in the bucket is recoverable; a dangling row pointing at
 * a deleted file is worse.
 */
export async function deleteInvoice(
  invoiceId: string,
  clientId: string,
): Promise<ActionResult> {
  const user = await requireAdmin();

  try {
    const [invoice] = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        storagePath: invoices.storagePath,
      })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.clientId, clientId)))
      .limit(1);

    if (!invoice) return { success: false, error: 'Invoice not found.' };

    await db.delete(invoices).where(eq(invoices.id, invoiceId));

    const storageOk = await deleteFile(invoice.storagePath);
    if (!storageOk) {
      console.warn(`[deleteInvoice] storage delete failed for ${invoice.storagePath}`);
    }

    await logAudit({
      actor: user,
      action: 'deleted invoice',
      targetType: 'invoice',
      targetId: invoice.id,
      targetLabel: invoice.invoiceNumber,
      clientId,
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('[deleteInvoice]', error);
    return { success: false, error: 'Failed to delete invoice.' };
  }
}

function formatCentsForLog(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
