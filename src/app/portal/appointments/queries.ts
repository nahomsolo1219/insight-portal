// Appointment reads scoped to the signed-in client. Same pattern as the
// rest of the portal: take `clientId`, filter explicitly even though RLS
// already enforces it, derive the property-id list once and reuse.

import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { appointments, projects, properties, vendors } from '@/db/schema';

export interface ClientAppointmentRow {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  scopeOfWork: string | null;
  davidOnSite: boolean;
  propertyName: string;
  propertyAddress: string | null;
  projectName: string | null;
  vendorName: string | null;
}

export interface ClientAppointmentLists {
  upcoming: ClientAppointmentRow[];
  past: ClientAppointmentRow[];
}

/**
 * All appointments across the client's properties, split into upcoming and
 * past. `cancelled` rows are excluded from both buckets — they're noise the
 * client doesn't need to see twice.
 *
 * Past is sorted most-recent-first (typical "what just happened" reading
 * order); upcoming stays chronological so the next visit is at the top.
 */
export async function getClientAppointments(
  clientId: string,
): Promise<ClientAppointmentLists> {
  const clientProperties = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.clientId, clientId));

  const propertyIds = clientProperties.map((p) => p.id);
  if (propertyIds.length === 0) return { upcoming: [], past: [] };

  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({
      id: appointments.id,
      title: appointments.title,
      date: appointments.date,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      status: appointments.status,
      scopeOfWork: appointments.scopeOfWork,
      davidOnSite: appointments.davidOnSite,
      propertyName: properties.name,
      propertyAddress: properties.address,
      projectName: projects.name,
      vendorName: vendors.name,
    })
    .from(appointments)
    .innerJoin(properties, eq(properties.id, appointments.propertyId))
    .leftJoin(projects, eq(projects.id, appointments.projectId))
    .leftJoin(vendors, eq(vendors.id, appointments.vendorId))
    .where(inArray(appointments.propertyId, propertyIds))
    .orderBy(asc(appointments.date), asc(appointments.startTime));

  const upcoming: ClientAppointmentRow[] = [];
  const past: ClientAppointmentRow[] = [];

  for (const row of rows) {
    if (row.status === 'cancelled') continue;
    const isUpcoming =
      (row.status === 'scheduled' || row.status === 'confirmed') && row.date >= today;
    if (isUpcoming) {
      upcoming.push(row);
    } else {
      past.push(row);
    }
  }

  // Most recent past visit first (the upcoming list keeps DB order).
  past.reverse();

  return { upcoming, past };
}

/**
 * Distinct dates that should get a dot on the mini calendar. Skips
 * cancelled appointments since the client can't see them anywhere else
 * either.
 */
export async function getAppointmentDates(clientId: string): Promise<string[]> {
  const clientProperties = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.clientId, clientId));

  const propertyIds = clientProperties.map((p) => p.id);
  if (propertyIds.length === 0) return [];

  const rows = await db
    .select({ date: appointments.date })
    .from(appointments)
    .where(
      and(
        inArray(appointments.propertyId, propertyIds),
        inArray(appointments.status, ['scheduled', 'confirmed', 'completed']),
      ),
    );

  return Array.from(new Set(rows.map((r) => r.date)));
}
