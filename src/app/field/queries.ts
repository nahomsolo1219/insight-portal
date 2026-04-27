// Reads for the field staff app. Every list scopes to the signed-in
// technician's project assignments via the `project_assignments` table —
// a tech who isn't on a project doesn't see its property or schedule.
// Cold start: every user lands with zero assignments until an admin adds
// them, by design.

import { and, asc, desc, eq, exists, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  appointments,
  clients,
  photos,
  projectAssignments,
  projects,
  properties,
} from '@/db/schema';
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
 * Today's appointments scoped to the signed-in tech's assignments. An
 * appointment surfaces only if the tech is assigned to at least one
 * project on its property — that covers both the "tagged to project X"
 * case (where they're explicitly on it) and the property-only walk-in
 * case (where they're on *some* project at the address). Returns empty
 * for users with no assignments.
 */
export async function getTodaysFieldSchedule(userId: string): Promise<FieldScheduleRow[]> {
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
        exists(
          db
            .select({ one: projectAssignments.projectId })
            .from(projectAssignments)
            .innerJoin(projects, eq(projects.id, projectAssignments.projectId))
            .where(
              and(
                eq(projectAssignments.userId, userId),
                eq(projects.propertyId, appointments.propertyId),
              ),
            ),
        ),
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
 * Properties the signed-in tech can shoot photos at — every property
 * with at least one project they're assigned to. All-time: completed
 * projects still surface their property so the tech can return for
 * follow-up shots. DISTINCT prevents one property appearing N times
 * when the user is assigned to N projects on it.
 */
export async function getAssignedProperties(userId: string): Promise<FieldPropertyRow[]> {
  return db
    .selectDistinct({
      id: properties.id,
      name: properties.name,
      address: properties.address,
      city: properties.city,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(projectAssignments)
    .innerJoin(projects, eq(projects.id, projectAssignments.projectId))
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .innerJoin(clients, eq(clients.id, properties.clientId))
    .where(eq(projectAssignments.userId, userId))
    .orderBy(asc(clients.name), asc(properties.name));
}

export interface FieldProjectOption {
  id: string;
  name: string;
}

/**
 * Projects on a property that the user is assigned to — populates the
 * project picker on the upload screen. All statuses included; a tech
 * may be tagging photos for a finished remodel after the fact.
 */
export async function getAssignedPropertyProjects(
  propertyId: string,
  userId: string,
): Promise<FieldProjectOption[]> {
  return db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .innerJoin(projectAssignments, eq(projectAssignments.projectId, projects.id))
    .where(
      and(eq(projects.propertyId, propertyId), eq(projectAssignments.userId, userId)),
    )
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
 * Unscoped by assignment — historical uploads stay visible even if the
 * tech was later removed from the project.
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
