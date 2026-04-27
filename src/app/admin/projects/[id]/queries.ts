// Reads for the admin project detail page. The project is identified by
// its UUID; every query joins through `properties` so we can return the
// owning client + property in the header without a second round-trip.

import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  appointments,
  clients,
  milestones,
  photos,
  profiles,
  projectAssignments,
  projects,
  properties,
  staff,
  vendors,
} from '@/db/schema';
import { getSignedUrls } from '@/lib/storage/upload';

export type ProjectStatus = 'active' | 'completed' | 'on_hold';

export interface ProjectDetailRow {
  id: string;
  name: string;
  type: 'maintenance' | 'remodel';
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  progress: number;
  description: string | null;
  contractCents: number | null;
  changesCents: number;
  paidCents: number;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  clientId: string;
  clientName: string;
}

export interface ProjectMilestoneRow {
  id: string;
  title: string;
  category: string | null;
  dueDate: string | null;
  status:
    | 'pending'
    | 'upcoming'
    | 'in_progress'
    | 'complete'
    | 'awaiting_client';
  notes: string | null;
  order: number;
  vendorId: string | null;
  vendorName: string | null;
  questionType: string | null;
  questionBody: string | null;
  options: unknown;
  clientResponse: string | null;
  respondedAt: Date | null;
}

export interface ProjectPhotoRow {
  id: string;
  caption: string | null;
  status: 'pending' | 'categorized' | 'rejected';
  tag: 'before' | 'during' | 'after' | null;
  category: string | null;
  storagePath: string;
  signedUrl: string | null;
  uploadedAt: Date;
  uploadedByName: string | null;
  milestoneId: string | null;
  milestoneTitle: string | null;
  gpsLat: string | null;
  gpsLng: string | null;
}

export interface VendorOption {
  id: string;
  name: string;
  category: string;
}

export interface ProjectStats {
  totalMilestones: number;
  completedMilestones: number;
  photoCount: number;
  appointmentCount: number;
}

/**
 * Header data for the project detail page. Returns null when the project
 * doesn't exist — the page treats that as a 404. RLS would also block
 * cross-client reads anyway, but a missing row is a cleaner error path.
 */
export async function getProjectDetail(
  projectId: string,
): Promise<ProjectDetailRow | null> {
  const [row] = await db
    .select({
      id: projects.id,
      name: projects.name,
      type: projects.type,
      status: projects.status,
      startDate: projects.startDate,
      endDate: projects.endDate,
      progress: projects.progress,
      description: projects.description,
      contractCents: projects.contractCents,
      changesCents: projects.changesCents,
      paidCents: projects.paidCents,
      propertyId: properties.id,
      propertyName: properties.name,
      propertyAddress: properties.address,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(projects)
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .innerJoin(clients, eq(clients.id, properties.clientId))
    .where(eq(projects.id, projectId))
    .limit(1);

  return row ?? null;
}

export async function getProjectMilestones(
  projectId: string,
): Promise<ProjectMilestoneRow[]> {
  return db
    .select({
      id: milestones.id,
      title: milestones.title,
      category: milestones.category,
      dueDate: milestones.dueDate,
      status: milestones.status,
      notes: milestones.notes,
      order: milestones.order,
      vendorId: milestones.vendorId,
      vendorName: vendors.name,
      questionType: milestones.questionType,
      questionBody: milestones.questionBody,
      options: milestones.options,
      clientResponse: milestones.clientResponse,
      respondedAt: milestones.respondedAt,
    })
    .from(milestones)
    .leftJoin(vendors, eq(vendors.id, milestones.vendorId))
    .where(eq(milestones.projectId, projectId))
    .orderBy(asc(milestones.order), asc(milestones.dueDate));
}

/**
 * Hydrated photos for this project. Same `getSignedUrls` batching pattern
 * the rest of the admin uses; one round-trip per page render even with
 * dozens of photos.
 */
export async function getProjectPhotos(
  projectId: string,
): Promise<ProjectPhotoRow[]> {
  const rows = await db
    .select({
      id: photos.id,
      caption: photos.caption,
      status: photos.status,
      tag: photos.tag,
      category: photos.category,
      storagePath: photos.storagePath,
      uploadedAt: photos.uploadedAt,
      uploadedByName: photos.uploadedByName,
      milestoneId: photos.milestoneId,
      milestoneTitle: milestones.title,
      gpsLat: photos.gpsLat,
      gpsLng: photos.gpsLng,
    })
    .from(photos)
    .leftJoin(milestones, eq(milestones.id, photos.milestoneId))
    .where(eq(photos.projectId, projectId))
    .orderBy(desc(photos.uploadedAt));

  if (rows.length === 0) return [];

  const paths = rows.map((r) => r.storagePath).filter(Boolean);
  const urlByPath = paths.length > 0 ? await getSignedUrls(paths) : new Map<string, string>();

  return rows.map((r) => ({
    ...r,
    signedUrl: urlByPath.get(r.storagePath) ?? null,
  }));
}

/** Lightweight counts for the stats row + sidebar context. */
export async function getProjectStats(projectId: string): Promise<ProjectStats> {
  const [milestoneRows, photoCount, appointmentCount] = await Promise.all([
    db
      .select({ status: milestones.status })
      .from(milestones)
      .where(eq(milestones.projectId, projectId)),
    db
      .select({ id: photos.id })
      .from(photos)
      .where(eq(photos.projectId, projectId))
      .then((rows) => rows.length),
    db
      .select({ id: appointments.id })
      .from(appointments)
      .where(eq(appointments.projectId, projectId))
      .then((rows) => rows.length),
  ]);

  const completedMilestones = milestoneRows.filter(
    (m) => m.status === 'complete',
  ).length;

  return {
    totalMilestones: milestoneRows.length,
    completedMilestones,
    photoCount,
    appointmentCount,
  };
}

/** Active vendors for the milestone vendor-assignment picker. */
export async function getActiveVendors(): Promise<VendorOption[]> {
  return db
    .select({ id: vendors.id, name: vendors.name, category: vendors.category })
    .from(vendors)
    .where(eq(vendors.active, true))
    .orderBy(asc(vendors.name));
}

// ---------------------------------------------------------------------------
// Field-staff project assignments — admin UI data
// ---------------------------------------------------------------------------

export interface ProjectAssignmentRow {
  profileId: string;
  name: string;
  assignedAt: Date;
}

/**
 * Currently-assigned staff for this project, oldest-assignment-first.
 * The earliest row tends to read as "the lead" but no formal lead role
 * exists yet — David curates assignment order if it matters. Joins
 * profiles → staff so the display name comes from the staff record
 * (staff.name is the canonical HR name; profiles.fullName may be stale
 * if the user invited themselves with a different display name).
 */
export async function getProjectAssignments(
  projectId: string,
): Promise<ProjectAssignmentRow[]> {
  return db
    .select({
      profileId: projectAssignments.userId,
      name: staff.name,
      assignedAt: projectAssignments.assignedAt,
    })
    .from(projectAssignments)
    .innerJoin(profiles, eq(profiles.id, projectAssignments.userId))
    .innerJoin(staff, eq(staff.id, profiles.staffId))
    .where(eq(projectAssignments.projectId, projectId))
    .orderBy(asc(projectAssignments.assignedAt));
}

export interface FieldStaffPickerRow {
  profileId: string;
  name: string;
  /** Number of currently-active or on-hold projects this person is on.
   *  Excludes completed projects so the picker shows current load,
   *  not lifetime work. */
  currentAssignmentCount: number;
}

/**
 * All active field staff with a linked profile, plus a count of their
 * "current" project load. Drives the Add staff modal on the Team tab
 * AND the multi-select on the New Project form. Field staff without a
 * profile (no portal account yet) are excluded — `project_assignments`
 * FKs to `profiles.id`, so they can't be assigned anyway.
 */
export async function getActiveFieldStaffForPicker(): Promise<FieldStaffPickerRow[]> {
  // One query: staff → profile → LEFT JOIN ON-status assignments. The
  // count() is filtered by project status via FILTER (...) which
  // tracks active+on_hold projects (treating "current load" as
  // anything not-completed). Drizzle's `count()` aggregate plus a
  // raw SQL filter clause keeps this to a single round-trip.
  const rows = await db
    .select({
      profileId: profiles.id,
      name: staff.name,
      currentAssignmentCount: sql<number>`
        COUNT(${projectAssignments.projectId}) FILTER (
          WHERE ${projects.status} IN ('active', 'on_hold')
        )::int
      `,
    })
    .from(staff)
    .innerJoin(profiles, eq(profiles.staffId, staff.id))
    .leftJoin(projectAssignments, eq(projectAssignments.userId, profiles.id))
    .leftJoin(projects, eq(projects.id, projectAssignments.projectId))
    .where(and(eq(staff.role, 'field_staff'), eq(staff.status, 'active')))
    .groupBy(profiles.id, staff.name)
    .orderBy(asc(staff.name));

  return rows;
}

/**
 * Just the assigned staff names for a project, in oldest-first order.
 * Used by the project header's "Team:" indicator — separated from
 * `getProjectAssignments` so the page header can fetch only the names
 * (no assignedAt overhead) without dragging in the full Team tab
 * payload.
 */
export async function getProjectAssignedNames(projectId: string): Promise<string[]> {
  const rows = await db
    .select({ name: staff.name })
    .from(projectAssignments)
    .innerJoin(profiles, eq(profiles.id, projectAssignments.userId))
    .innerJoin(staff, eq(staff.id, profiles.staffId))
    .where(eq(projectAssignments.projectId, projectId))
    .orderBy(asc(projectAssignments.assignedAt));
  return rows.map((r) => r.name);
}

