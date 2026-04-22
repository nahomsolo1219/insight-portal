// Cross-client schedule queries. Joins all the way back to the client so
// each row carries a clickable client name — David lives in this view
// during the day and needs to hop to any client's detail page in one click.

import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/db';
import { appointments, clients, properties, staff, vendors } from '@/db/schema';

export interface ScheduleRow {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  startTime: string | null;
  endTime: string | null;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  davidOnSite: boolean;
  scopeOfWork: string | null;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  clientId: string;
  clientName: string;
  vendorName: string | null;
  pmName: string | null;
}

/**
 * Fetch every appointment between `startDate` and `endDate` inclusive,
 * sorted chronologically. Date range is always inclusive on both ends so
 * "day" view (start === end) works without special casing.
 */
export async function getSchedule(
  startDate: string,
  endDate: string,
): Promise<ScheduleRow[]> {
  return db
    .select({
      id: appointments.id,
      title: appointments.title,
      date: appointments.date,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      status: appointments.status,
      davidOnSite: appointments.davidOnSite,
      scopeOfWork: appointments.scopeOfWork,
      propertyId: appointments.propertyId,
      propertyName: properties.name,
      propertyAddress: properties.address,
      clientId: clients.id,
      clientName: clients.name,
      vendorName: vendors.name,
      pmName: staff.name,
    })
    .from(appointments)
    .innerJoin(properties, eq(properties.id, appointments.propertyId))
    .innerJoin(clients, eq(clients.id, properties.clientId))
    .leftJoin(vendors, eq(vendors.id, appointments.vendorId))
    .leftJoin(staff, eq(staff.id, appointments.assignedPmId))
    .where(and(gte(appointments.date, startDate), lte(appointments.date, endDate)))
    .orderBy(asc(appointments.date), asc(appointments.startTime));
}
