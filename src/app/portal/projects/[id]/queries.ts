// Project-detail query for the client portal timeline. Fetches everything
// the timeline page needs in parallel and signs photo URLs in one batch.

import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import {
  appointments,
  clients,
  milestones,
  photos,
  projects,
  properties,
  staff,
  vendors,
} from '@/db/schema';
import { getSignedUrls } from '@/lib/storage/upload';

export type MilestoneStatus =
  | 'complete'
  | 'in_progress'
  | 'upcoming'
  | 'pending'
  | 'awaiting_client';

export type DecisionType = 'single' | 'multi' | 'approval' | 'open' | 'acknowledge';

/** Persisted shape of a decision option (matches S3's template_milestones JSON). */
export interface PortalDecisionOption {
  label: string;
  imageStoragePath: string | null;
  imageUrl: string | null;
  description: string | null;
}

export interface TimelinePhoto {
  id: string;
  tag: 'before' | 'during' | 'after' | null;
  category: string | null;
  caption: string | null;
  storagePath: string;
  signedUrl: string | null;
  milestoneId: string | null;
}

export interface TimelineMilestone {
  id: string;
  title: string;
  category: string | null;
  status: MilestoneStatus;
  dueDate: string | null;
  notes: string | null;
  order: number;
  questionType: DecisionType | null;
  questionBody: string | null;
  options: PortalDecisionOption[];
  clientResponse: string | null;
  respondedAt: Date | null;
  vendorName: string | null;
  /** Photos already filtered to this milestone, hydrated with signed URLs. */
  photos: TimelinePhoto[];
}

export interface TimelineAppointment {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
}

export interface TimelinePayload {
  project: {
    id: string;
    name: string;
    type: 'maintenance' | 'remodel';
    status: 'active' | 'completed' | 'on_hold';
    progress: number;
    startDate: string | null;
    endDate: string | null;
    description: string | null;
    propertyId: string;
    contractCents: number | null;
    changesCents: number;
    paidCents: number;
  };
  property: {
    name: string;
    address: string;
    city: string | null;
  } | null;
  pmName: string | null;
  pmEmail: string | null;
  pmPhone: string | null;
  milestones: TimelineMilestone[];
  unattachedPhotos: TimelinePhoto[];
  nextAppointment: TimelineAppointment | null;
  stats: {
    totalMilestones: number;
    completedMilestones: number;
    pendingDecisions: number;
    /** Decisions awaiting the client AND not yet responded to. */
    awaitingResponse: number;
  };
}

/**
 * Loads the entire timeline payload in three parallel reads after a quick
 * ownership check. Returns null if the project either doesn't exist or
 * doesn't belong to the requesting client — RLS would also block the read,
 * but the explicit join keeps the error path clean (404 vs empty data).
 */
export async function getProjectTimeline(
  projectId: string,
  clientId: string,
): Promise<TimelinePayload | null> {
  // 1. Ownership check — joining through properties guarantees the project
  //    is on a property this client owns. Without this, a forged URL would
  //    rely entirely on RLS to block the read.
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      type: projects.type,
      status: projects.status,
      progress: projects.progress,
      startDate: projects.startDate,
      endDate: projects.endDate,
      description: projects.description,
      propertyId: projects.propertyId,
      contractCents: projects.contractCents,
      changesCents: projects.changesCents,
      paidCents: projects.paidCents,
    })
    .from(projects)
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .where(and(eq(projects.id, projectId), eq(properties.clientId, clientId)))
    .limit(1);

  if (!project) return null;

  // 2. Parallel reads for everything the page needs. Property + PM lookup
  //    is a join from clients, but it's cheap enough to be one of these.
  const today = new Date().toISOString().slice(0, 10);

  const [propertyRow, pmRow, rawMilestones, rawPhotos, nextAppointment] = await Promise.all([
    db
      .select({
        name: properties.name,
        address: properties.address,
        city: properties.city,
      })
      .from(properties)
      .where(eq(properties.id, project.propertyId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        name: staff.name,
        email: staff.email,
        phone: staff.phone,
      })
      .from(clients)
      .leftJoin(staff, eq(staff.id, clients.assignedPmId))
      .where(eq(clients.id, clientId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        id: milestones.id,
        title: milestones.title,
        category: milestones.category,
        status: milestones.status,
        dueDate: milestones.dueDate,
        notes: milestones.notes,
        order: milestones.order,
        questionType: milestones.questionType,
        questionBody: milestones.questionBody,
        options: milestones.options,
        clientResponse: milestones.clientResponse,
        respondedAt: milestones.respondedAt,
        vendorName: vendors.name,
      })
      .from(milestones)
      .leftJoin(vendors, eq(vendors.id, milestones.vendorId))
      .where(eq(milestones.projectId, projectId))
      .orderBy(asc(milestones.order), asc(milestones.dueDate)),
    // Include any photo on this project, plus property-level photos that
    // weren't tied to a specific project — field staff often upload to
    // the property without picking a project, and those would otherwise
    // be invisible to the client. Photos linked to a *different* project
    // on the same property are excluded (they belong on that project's
    // timeline).
    db
      .select({
        id: photos.id,
        tag: photos.tag,
        category: photos.category,
        caption: photos.caption,
        storagePath: photos.storagePath,
        milestoneId: photos.milestoneId,
      })
      .from(photos)
      .where(
        and(
          eq(photos.status, 'categorized'),
          or(
            eq(photos.projectId, projectId),
            and(
              eq(photos.propertyId, project.propertyId),
              isNull(photos.projectId),
            ),
          ),
        ),
      )
      .orderBy(asc(photos.tag), desc(photos.uploadedAt)),
    db
      .select({
        id: appointments.id,
        title: appointments.title,
        date: appointments.date,
        startTime: appointments.startTime,
        endTime: appointments.endTime,
        status: appointments.status,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.projectId, projectId),
          inArray(appointments.status, ['scheduled', 'confirmed']),
        ),
      )
      .orderBy(asc(appointments.date), asc(appointments.startTime))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  // 3. Sign every photo URL in one batch + every decision-option image
  //    URL across all milestones. Combined into one storage call so we
  //    don't ping Supabase 30+ times for a busy project.
  const optionPaths = rawMilestones.flatMap((m) => collectOptionPaths(m.options));
  const allPaths = [
    ...rawPhotos.map((p) => p.storagePath).filter(Boolean),
    ...optionPaths,
  ];
  const urlByPath =
    allPaths.length > 0 ? await getSignedUrls(allPaths) : new Map<string, string>();

  // 4. Reshape — attach signed URLs, normalise legacy string options into
  //    rich objects, and group photos under their milestone (with the
  //    leftovers going into unattachedPhotos so the timeline can show
  //    project-wide shots that aren't tied to a particular milestone).
  const photosByMilestone = new Map<string, TimelinePhoto[]>();
  const unattachedPhotos: TimelinePhoto[] = [];
  for (const p of rawPhotos) {
    const tp: TimelinePhoto = {
      id: p.id,
      tag: p.tag,
      category: p.category,
      caption: p.caption,
      storagePath: p.storagePath,
      signedUrl: urlByPath.get(p.storagePath) ?? null,
      milestoneId: p.milestoneId,
    };
    if (p.milestoneId) {
      const existing = photosByMilestone.get(p.milestoneId);
      if (existing) existing.push(tp);
      else photosByMilestone.set(p.milestoneId, [tp]);
    } else {
      unattachedPhotos.push(tp);
    }
  }

  const timelineMilestones: TimelineMilestone[] = rawMilestones.map((m) => ({
    id: m.id,
    title: m.title,
    category: m.category,
    status: m.status,
    dueDate: m.dueDate,
    notes: m.notes,
    order: m.order,
    questionType: m.questionType,
    questionBody: m.questionBody,
    options: hydrateOptions(m.options, urlByPath),
    clientResponse: m.clientResponse,
    respondedAt: m.respondedAt,
    vendorName: m.vendorName,
    photos: photosByMilestone.get(m.id) ?? [],
  }));

  const completed = timelineMilestones.filter((m) => m.status === 'complete').length;
  const pendingDecisions = timelineMilestones.filter(
    (m) => m.status === 'awaiting_client',
  ).length;
  const awaitingResponse = timelineMilestones.filter(
    (m) => m.status === 'awaiting_client' && !m.clientResponse,
  ).length;

  // Suppress unused-variable warning — kept for future "appointment
  // imminent today" callouts.
  void today;

  return {
    project,
    property: propertyRow ?? null,
    pmName: pmRow?.name ?? null,
    pmEmail: pmRow?.email ?? null,
    pmPhone: pmRow?.phone ?? null,
    milestones: timelineMilestones,
    unattachedPhotos,
    nextAppointment: nextAppointment ?? null,
    stats: {
      totalMilestones: timelineMilestones.length,
      completedMilestones: completed,
      pendingDecisions,
      awaitingResponse,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Pull every option `imageStoragePath` out of a single milestone's jsonb. */
function collectOptionPaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const paths: string[] = [];
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const path = (item as Record<string, unknown>).imageStoragePath;
      if (typeof path === 'string' && path) paths.push(path);
    }
  }
  return paths;
}

/**
 * Convert raw jsonb `options` into the rich PortalDecisionOption[] shape
 * the timeline expects. Plain strings (the historical seed format) are
 * wrapped so callers never have to branch on shape.
 */
function hydrateOptions(
  raw: unknown,
  urlByPath: Map<string, string>,
): PortalDecisionOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === 'string') {
      return { label: item, imageStoragePath: null, imageUrl: null, description: null };
    }
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const path = typeof obj.imageStoragePath === 'string' ? obj.imageStoragePath : null;
      return {
        label: typeof obj.label === 'string' ? obj.label : '',
        imageStoragePath: path,
        imageUrl: path ? urlByPath.get(path) ?? null : null,
        description: typeof obj.description === 'string' ? obj.description : null,
      };
    }
    return { label: '', imageStoragePath: null, imageUrl: null, description: null };
  });
}
