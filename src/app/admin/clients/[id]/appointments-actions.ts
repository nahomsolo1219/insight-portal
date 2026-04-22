'use server';

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { appointments, properties } from '@/db/schema';
import { logAudit, type AuditAction } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/current-user';

type ActionResult = { success: true } | { success: false; error: string };

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled';

const APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
] as const;

export interface CreateAppointmentInput {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM or HH:MM:SS (24-hour from the <input type="time"> control). */
  startTime: string;
  endTime: string;
  vendorId?: string | null;
  projectId?: string | null;
  milestoneId?: string | null;
  assignedPmId?: string | null;
  davidOnSite?: boolean;
  scopeOfWork?: string;
  status?: AppointmentStatus;
}

/**
 * Create an appointment against a property. Property ownership is enforced
 * here (belt-and-suspenders with RLS); time normalisation ensures whatever
 * the <input type="time"> browser gave us lands in the DB's `time` column
 * as "HH:MM:SS".
 */
export async function createAppointment(
  clientId: string,
  propertyId: string,
  input: CreateAppointmentInput,
): Promise<ActionResult> {
  const user = await requireAdmin();

  if (!input.title?.trim()) return { success: false, error: 'Title is required.' };
  if (!input.date) return { success: false, error: 'Date is required.' };
  if (!input.startTime) return { success: false, error: 'Start time is required.' };
  if (!input.endTime) return { success: false, error: 'End time is required.' };
  if (input.startTime >= input.endTime) {
    return { success: false, error: 'End time must be after start time.' };
  }
  if (input.status && !APPOINTMENT_STATUSES.includes(input.status)) {
    return { success: false, error: 'Invalid status.' };
  }

  const [prop] = await db
    .select({ id: properties.id, clientId: properties.clientId })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);

  if (!prop || prop.clientId !== clientId) {
    return { success: false, error: 'Property not found.' };
  }

  try {
    const appointmentId = randomUUID();

    await db.insert(appointments).values({
      id: appointmentId,
      propertyId,
      projectId: input.projectId || null,
      milestoneId: input.milestoneId || null,
      title: input.title.trim(),
      vendorId: input.vendorId || null,
      date: input.date,
      startTime: normalizeTime(input.startTime),
      endTime: normalizeTime(input.endTime),
      status: input.status ?? 'scheduled',
      davidOnSite: input.davidOnSite ?? false,
      scopeOfWork: input.scopeOfWork?.trim() || null,
      assignedPmId: input.assignedPmId || null,
    });

    await logAudit({
      actor: user,
      action: 'created appointment',
      targetType: 'appointment',
      targetId: appointmentId,
      targetLabel: input.title.trim(),
      clientId,
      metadata: { date: input.date, startTime: input.startTime },
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin'); // dashboard today's-schedule card
    return { success: true };
  } catch (error) {
    console.error('[createAppointment]', error);
    return { success: false, error: 'Failed to create appointment.' };
  }
}

/**
 * Move an appointment between statuses. All transitions get audited — the
 * log entry's `action` varies so a quick filter separates completions and
 * cancellations (meaningful) from everyday scheduled↔confirmed churn
 * (lower-value).
 */
export async function updateAppointmentStatus(
  appointmentId: string,
  clientId: string,
  newStatus: AppointmentStatus,
): Promise<ActionResult> {
  const user = await requireAdmin();

  if (!APPOINTMENT_STATUSES.includes(newStatus)) {
    return { success: false, error: 'Invalid status.' };
  }

  try {
    const [existing] = await db
      .select({
        id: appointments.id,
        title: appointments.title,
        status: appointments.status,
        propertyId: appointments.propertyId,
      })
      .from(appointments)
      .innerJoin(properties, eq(properties.id, appointments.propertyId))
      .where(and(eq(appointments.id, appointmentId), eq(properties.clientId, clientId)))
      .limit(1);

    if (!existing) return { success: false, error: 'Appointment not found.' };
    if (existing.status === newStatus) return { success: true };

    await db
      .update(appointments)
      .set({ status: newStatus })
      .where(eq(appointments.id, appointmentId));

    const action: AuditAction =
      newStatus === 'completed'
        ? 'completed appointment'
        : newStatus === 'cancelled'
          ? 'cancelled appointment'
          : 'updated appointment status';

    await logAudit({
      actor: user,
      action,
      targetType: 'appointment',
      targetId: existing.id,
      targetLabel:
        action === 'updated appointment status'
          ? `${existing.title} → ${newStatus}`
          : existing.title,
      clientId,
      metadata: { from: existing.status, to: newStatus },
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('[updateAppointmentStatus]', error);
    return { success: false, error: 'Failed to update status.' };
  }
}

/**
 * Hard-delete an appointment. Distinct from `updateAppointmentStatus(..., 'cancelled')`
 * — a cancelled appointment stays in history; a deleted one disappears.
 * Use this for appointments that were created in error.
 */
export async function deleteAppointment(
  appointmentId: string,
  clientId: string,
): Promise<ActionResult> {
  const user = await requireAdmin();

  try {
    const [existing] = await db
      .select({
        id: appointments.id,
        title: appointments.title,
      })
      .from(appointments)
      .innerJoin(properties, eq(properties.id, appointments.propertyId))
      .where(and(eq(appointments.id, appointmentId), eq(properties.clientId, clientId)))
      .limit(1);

    if (!existing) return { success: false, error: 'Appointment not found.' };

    await db.delete(appointments).where(eq(appointments.id, appointmentId));

    await logAudit({
      actor: user,
      action: 'deleted appointment',
      targetType: 'appointment',
      targetId: existing.id,
      targetLabel: existing.title,
      clientId,
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('[deleteAppointment]', error);
    return { success: false, error: 'Failed to delete appointment.' };
  }
}

/**
 * Coerce a time string into "HH:MM:SS" for Postgres' `time` type.
 * The <input type="time"> control emits "HH:MM"; adding the seconds
 * keeps Drizzle/pg from interpreting the value as invalid.
 */
function normalizeTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}
