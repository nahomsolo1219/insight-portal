// Property-scoped dashboard reads (Phase 2B-1+ of the client-portal redesign).
//
// The existing /portal queries.ts surfaces client-wide rollups; this file
// adds a single property-scoped read so the editorial hero, Featured
// Decision card, right-rail Next Visit / Recent Photos cards, and the
// stat strip can all speak to one home at a time. RLS is the safety net,
// but every query also filters by clientId/propertyId explicitly so a bad
// policy can't leak across properties.

import { and, asc, desc, eq, inArray, isNotNull, lte } from 'drizzle-orm';
import { db } from '@/db';
import {
  appointments,
  milestones,
  photos,
  projects,
  properties,
  staff,
  vendors,
} from '@/db/schema';
import { getSignedUrls } from '@/lib/storage/upload';
import type { DecisionType, PortalDecisionOption } from '../projects/[id]/queries';

/** Plain-object shape of the hero/featured-decision data the dashboard
 *  consumes — no Date instances on the wire, just ISO strings, so the
 *  selectDashboardHeroCopy pure function can be tested without Drizzle. */
export interface PropertyDashboardData {
  /** From the property record — admin-authored editorial chip. */
  statusTone: 'green' | 'amber' | 'neutral' | 'rose' | null;
  statusLabel: string | null;
  /** Pending decisions on THIS property's projects. */
  pendingDecisionCount: number;
  activeProjectCount: number;
  /** The single highest-priority decision (oldest awaiting_client) — fully
   *  hydrated so the FeaturedDecisionCard can render without re-fetching. */
  featuredDecision: FeaturedDecision | null;
  /** Most recent completed visit on this property within the last ~2
   *  days. Null when nothing qualifies. */
  mostRecentCompletedVisit: VisitSummary | null;
  /** Soonest scheduled / confirmed appointment on this property. */
  nextScheduledVisit: VisitSummary | null;
  /** Up to 4 most-recent categorized photos on this property — fuels
   *  the right-rail "Recent photos" card. Empty when nothing qualifies. */
  recentPhotos: RecentPhotoTile[];
}

export interface FeaturedDecision {
  id: string;
  /** Question text. May be null on legacy rows — the wrapper falls back to
   *  the milestone title in that case. */
  questionBody: string | null;
  /** Milestone title (a short label) — used as fallback headline. */
  title: string;
  questionType: DecisionType | null;
  options: PortalDecisionOption[];
  /** Project this decision belongs to. */
  projectId: string;
  projectName: string;
  /** Optional small explanatory paragraph (uses milestone.notes). */
  notes: string | null;
}

export interface VisitSummary {
  /** ISO date "YYYY-MM-DD". */
  date: string;
  /** "HH:MM" or "HH:MM:SS" — null when admin didn't pin a time. */
  startTime: string | null;
  /** "HH:MM" or "HH:MM:SS" — null when admin didn't set an end time. */
  endTime: string | null;
  /** Appointment title — used as the headline of the right-rail
   *  Next Visit card. Null only on legacy rows missing the field. */
  title: string | null;
  /** Vendor first name (preferred) or staff first name; null if neither. */
  visitorFirstName: string | null;
}

export interface RecentPhotoTile {
  id: string;
  caption: string | null;
  tag: 'before' | 'during' | 'after' | null;
  storagePath: string;
  /** Pre-signed URL for the editorial 4-up grid. Null when the storage
   *  signer fails (rare — render an ImageOff placeholder in that case). */
  signedUrl: string | null;
  /** Project the photo belongs to — drives the click destination. Null
   *  when the photo is property-scoped only (rare; the link falls back
   *  to the property's projects index in that case). */
  projectId: string | null;
}

/**
 * Single round of reads for everything the dashboard hero + Featured
 * Decision card need on a given property. Implementation:
 *
 *  1. Load the property record (statusLabel/Tone) and the project ids on
 *     this property — both keyed by `clientId+propertyId` for defence in
 *     depth on top of RLS.
 *  2. With the project list, read pending-decision milestones (sorted
 *     oldest-first), recent past appointments (the editorial "we were by
 *     yesterday" branch), and upcoming appointments — all in parallel.
 *  3. Pick the *single* most-aged decision and shape it into the
 *     FeaturedDecision payload, then collapse the visit rows into the
 *     two summary fields the hero copy reads.
 */
export async function getPropertyDashboardData(
  clientId: string,
  propertyId: string,
): Promise<PropertyDashboardData> {
  const [propertyRow, projectRows] = await Promise.all([
    db
      .select({
        statusLabel: properties.statusLabel,
        statusTone: properties.statusTone,
      })
      .from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.clientId, clientId)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({ id: projects.id, name: projects.name, status: projects.status })
      .from(projects)
      .innerJoin(properties, eq(properties.id, projects.propertyId))
      .where(and(eq(properties.id, propertyId), eq(properties.clientId, clientId))),
  ]);

  const projectIdToName = new Map<string, string>();
  let activeProjectCount = 0;
  for (const p of projectRows) {
    projectIdToName.set(p.id, p.name);
    if (p.status === 'active') activeProjectCount += 1;
  }
  const projectIds = projectRows.map((p) => p.id);

  // The "today" boundary for the visit windows. Sliced to YYYY-MM-DD to
  // match Postgres' `date` columns (the appointments.date column has no
  // time-of-day component).
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const yesterdayIso = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [decisionRows, recentVisitRow, upcomingVisitRow, photoRows] =
    await Promise.all([
      projectIds.length === 0
        ? Promise.resolve([])
        : db
            .select({
              id: milestones.id,
              title: milestones.title,
              questionBody: milestones.questionBody,
              questionType: milestones.questionType,
              options: milestones.options,
              notes: milestones.notes,
              projectId: milestones.projectId,
              createdAt: milestones.createdAt,
            })
            .from(milestones)
            .where(
              and(
                inArray(milestones.projectId, projectIds),
                eq(milestones.status, 'awaiting_client'),
              ),
            )
            // Oldest first — `awaiting_client_at` doesn't exist on the
            // schema, so created_at is the agreed proxy. Updated_at would
            // shift on every admin edit and isn't a stable priority signal.
            .orderBy(asc(milestones.createdAt)),
      // Most-recent completed visit within the last 2 days. We pull the
      // single newest completed appointment (date desc) on this property
      // joined to the vendor and staff tables so we can prefer a vendor's
      // name (the on-site contractor) and fall back to the assigned PM.
      db
        .select({
          date: appointments.date,
          startTime: appointments.startTime,
          endTime: appointments.endTime,
          title: appointments.title,
          vendorName: vendors.name,
          staffName: staff.name,
        })
        .from(appointments)
        .leftJoin(vendors, eq(vendors.id, appointments.vendorId))
        .leftJoin(staff, eq(staff.id, appointments.assignedPmId))
        .where(
          and(
            eq(appointments.propertyId, propertyId),
            eq(appointments.status, 'completed'),
            // Inclusive "today or yesterday" — anything older drops off.
            lte(appointments.date, todayIso),
            // gte yesterday: appointments are date strings, lexicographic
            // compare matches calendar order for `YYYY-MM-DD`.
            // Using inArray is overkill; an explicit gte keeps the index hit.
            // (A two-day window is small enough the comparison stays cheap.)
            isNotNull(appointments.date),
          ),
        )
        .orderBy(desc(appointments.date), desc(appointments.startTime))
        .limit(1)
        .then((rows) => {
          const row = rows[0];
          if (!row) return null;
          // Filter to the 2-day window in code (Postgres `date >=` would
          // require an extra param wrangle here that's not worth it for
          // a single-row read).
          if (row.date !== todayIso && row.date !== yesterdayIso) return null;
          return row;
        }),
      db
        .select({
          date: appointments.date,
          startTime: appointments.startTime,
          endTime: appointments.endTime,
          title: appointments.title,
          vendorName: vendors.name,
          staffName: staff.name,
        })
        .from(appointments)
        .leftJoin(vendors, eq(vendors.id, appointments.vendorId))
        .leftJoin(staff, eq(staff.id, appointments.assignedPmId))
        .where(
          and(
            eq(appointments.propertyId, propertyId),
            inArray(appointments.status, ['scheduled', 'confirmed']),
          ),
        )
        .orderBy(asc(appointments.date), asc(appointments.startTime))
        .limit(1)
        .then((rows) => {
          const row = rows[0];
          if (!row) return null;
          if (row.date < todayIso) return null;
          return row;
        }),
      // Recent photos for the right-rail 4-up grid. Property-scoped (vs
      // the client-wide /portal queries.ts version) and capped at 4 —
      // the card never shows more.
      db
        .select({
          id: photos.id,
          caption: photos.caption,
          tag: photos.tag,
          storagePath: photos.storagePath,
          projectId: photos.projectId,
        })
        .from(photos)
        .where(
          and(
            eq(photos.propertyId, propertyId),
            // The schema enum value for "client-visible" is `categorized`,
            // not `approved` — admin's photo-queue review flips photos
            // from `pending` → `categorized` once tagged.
            eq(photos.status, 'categorized'),
          ),
        )
        .orderBy(desc(photos.uploadedAt))
        .limit(4),
    ]);

  // Sign every photo URL in one batch storage call. Empty list → empty
  // map; we still bind the field so the caller doesn't have to branch.
  const urlByPath =
    photoRows.length > 0
      ? await getSignedUrls(photoRows.map((p) => p.storagePath))
      : new Map<string, string>();

  const recentPhotos: RecentPhotoTile[] = photoRows.map((p) => ({
    id: p.id,
    caption: p.caption,
    tag: p.tag,
    storagePath: p.storagePath,
    signedUrl: urlByPath.get(p.storagePath) ?? null,
    projectId: p.projectId,
  }));

  // Hydrate the featured decision. We don't sign decision-option image
  // URLs here because production options don't carry covers (per the
  // Phase 2B-1 brief — text-only option cards). The shape stays
  // compatible with PortalDecisionOption so a future surface that
  // wants images can plug in by signing here.
  let featuredDecision: FeaturedDecision | null = null;
  const oldest = decisionRows[0];
  if (oldest) {
    const projectName = projectIdToName.get(oldest.projectId) ?? '';
    featuredDecision = {
      id: oldest.id,
      title: oldest.title,
      questionBody: oldest.questionBody,
      questionType: oldest.questionType,
      options: hydrateOptionsTextOnly(oldest.options),
      notes: oldest.notes,
      projectId: oldest.projectId,
      projectName,
    };
  }

  return {
    statusTone: propertyRow?.statusTone ?? null,
    statusLabel: propertyRow?.statusLabel ?? null,
    pendingDecisionCount: decisionRows.length,
    activeProjectCount,
    featuredDecision,
    mostRecentCompletedVisit: recentVisitRow
      ? {
          date: recentVisitRow.date,
          startTime: recentVisitRow.startTime,
          endTime: recentVisitRow.endTime,
          title: recentVisitRow.title,
          visitorFirstName: pickFirstName(recentVisitRow.vendorName, recentVisitRow.staffName),
        }
      : null,
    nextScheduledVisit: upcomingVisitRow
      ? {
          date: upcomingVisitRow.date,
          startTime: upcomingVisitRow.startTime,
          endTime: upcomingVisitRow.endTime,
          title: upcomingVisitRow.title,
          visitorFirstName: pickFirstName(
            upcomingVisitRow.vendorName,
            upcomingVisitRow.staffName,
          ),
        }
      : null,
    recentPhotos,
  };
}

/**
 * Convert raw jsonb `options` into the rich PortalDecisionOption[] shape
 * the FeaturedDecisionCard expects. Cover swatches are deliberately not
 * rendered on the dashboard, so we keep imageStoragePath/imageUrl null
 * even when the seed data stored a path. Same defensive shape as the
 * project timeline's hydrateOptions, minus the URL-signing pass.
 */
function hydrateOptionsTextOnly(raw: unknown): PortalDecisionOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === 'string') {
      return { label: item, imageStoragePath: null, imageUrl: null, description: null };
    }
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      return {
        label: typeof obj.label === 'string' ? obj.label : '',
        imageStoragePath: null,
        imageUrl: null,
        description: typeof obj.description === 'string' ? obj.description : null,
      };
    }
    return { label: '', imageStoragePath: null, imageUrl: null, description: null };
  });
}

/** Return the first whitespace-delimited token of the first non-empty
 *  candidate. Used to keep "Mike was by today" / "David is heading over"
 *  from spilling into a full surname. */
function pickFirstName(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    const trimmed = c?.trim();
    if (trimmed) {
      const first = trimmed.split(/\s+/)[0];
      if (first) return first;
    }
  }
  return null;
}
