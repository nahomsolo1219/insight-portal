// Reads for the field staff app. Field staff can be dispatched to any
// active client, so these queries deliberately ignore "ownership" — the
// security model is RLS + the role check at the layout level, not data
// scoping per technician.

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { appointments, clients, photos, projects, properties } from '@/db/schema';
import { getSignedUrls } from '@/lib/storage/upload';

export interface FieldScheduleRow {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  clientId: string;
  clientName: string;
  projectId: string | null;
  projectName: string | null;
  davidOnSite: boolean;
}

/**
 * Today's appointments across every active client. Field staff use this
 * as the day's punch list — pick a stop, upload photos, move on. Sorted
 * earliest-first by start time.
 */
export async function getTodaysFieldSchedule(): Promise<FieldScheduleRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  return db
    .select({
      id: appointments.id,
      title: appointments.title,
      date: appointments.date,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      status: appointments.status,
      propertyId: appointments.propertyId,
      propertyName: properties.name,
      propertyAddress: properties.address,
      clientId: clients.id,
      clientName: clients.name,
      projectId: appointments.projectId,
      projectName: projects.name,
      davidOnSite: appointments.davidOnSite,
    })
    .from(appointments)
    .innerJoin(properties, eq(properties.id, appointments.propertyId))
    .innerJoin(clients, eq(clients.id, properties.clientId))
    .leftJoin(projects, eq(projects.id, appointments.projectId))
    .where(
      and(
        eq(appointments.date, today),
        inArray(appointments.status, ['scheduled', 'confirmed']),
      ),
    )
    .orderBy(asc(appointments.startTime));
}

export interface FieldPropertyRow {
  id: string;
  name: string;
  address: string;
  city: string | null;
  clientId: string;
  clientName: string;
}

/**
 * Every property under an active client — drives the property dropdown
 * on the upload screen for ad-hoc visits that aren't on today's schedule.
 * Sorted by client then property name so the dropdown groups intuitively.
 */
export async function getAllActiveProperties(): Promise<FieldPropertyRow[]> {
  return db
    .select({
      id: properties.id,
      name: properties.name,
      address: properties.address,
      city: properties.city,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(properties)
    .innerJoin(clients, eq(clients.id, properties.clientId))
    .where(eq(clients.status, 'active'))
    .orderBy(asc(clients.name), asc(properties.name));
}

export interface FieldProjectOption {
  id: string;
  name: string;
}

/**
 * Active projects on a property — populates the optional project picker
 * on the upload screen. Inactive projects are filtered out so the
 * picker doesn't show stale options.
 */
export async function getPropertyProjects(propertyId: string): Promise<FieldProjectOption[]> {
  return db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.propertyId, propertyId), eq(projects.status, 'active')))
    .orderBy(asc(projects.name));
}

export interface FieldRecentUpload {
  id: string;
  caption: string | null;
  status: 'pending' | 'categorized' | 'rejected';
  storagePath: string;
  signedUrl: string | null;
  uploadedAt: Date;
  propertyName: string;
  clientName: string;
}

/**
 * The signed-in user's last N uploads with thumbnail URLs. Powers the
 * "My recent uploads" strip on the home page so the technician can see
 * what they shipped that morning + which photos the office has reviewed.
 */
export async function getMyRecentUploads(
  userId: string,
  limit = 12,
): Promise<FieldRecentUpload[]> {
  const rows = await db
    .select({
      id: photos.id,
      caption: photos.caption,
      status: photos.status,
      storagePath: photos.storagePath,
      uploadedAt: photos.uploadedAt,
      propertyName: properties.name,
      clientName: clients.name,
    })
    .from(photos)
    .innerJoin(properties, eq(properties.id, photos.propertyId))
    .innerJoin(clients, eq(clients.id, properties.clientId))
    .where(eq(photos.uploadedByUserId, userId))
    .orderBy(desc(photos.uploadedAt))
    .limit(limit);

  if (rows.length === 0) return [];

  // One batched signed-URL roundtrip rather than N. Empty paths shouldn't
  // happen (storage_path is NOT NULL on photos), but the filter is cheap
  // insurance.
  const paths = rows.map((r) => r.storagePath).filter(Boolean);
  const urlByPath =
    paths.length > 0 ? await getSignedUrls(paths) : new Map<string, string>();

  return rows.map((r) => ({
    ...r,
    signedUrl: urlByPath.get(r.storagePath) ?? null,
  }));
}
