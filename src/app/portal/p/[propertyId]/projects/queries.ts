// Reads for the client portal projects list. Always scoped by `clientId`
// even though RLS enforces it — the explicit filter makes intent clear and
// guards against a misconfigured policy leaking another client's projects.

import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { milestones, projects, properties } from '@/db/schema';

export interface ClientProjectListRow {
  id: string;
  name: string;
  type: 'maintenance' | 'remodel';
  status: 'active' | 'completed' | 'on_hold';
  progress: number;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  propertyId: string;
  propertyName: string;
  pendingDecisions: number;
}

/**
 * Every project (active, completed, on-hold) on a SINGLE property. The
 * portal is property-scoped (the sidebar switcher picks one home at a
 * time), so we filter to `propertyId` rather than rolling up the whole
 * client. Active projects sort first; within each status, newest start
 * date wins. Pending-decision counts come back in the same payload so the
 * card can flag projects the client needs to act on.
 *
 * `clientId` is still required for the ownership check — the property must
 * belong to the signed-in client (defence in depth on top of RLS + the
 * layout's own check).
 */
export async function getClientProjects(
  clientId: string,
  propertyId: string,
): Promise<ClientProjectListRow[]> {
  // Ownership check: the property exists AND belongs to this client. A
  // miss returns empty rather than leaking another property's projects.
  const [property] = await db
    .select({ id: properties.id, name: properties.name })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.clientId, clientId)))
    .limit(1);
  if (!property) return [];

  const projectRows = await db
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
    })
    .from(projects)
    .where(eq(projects.propertyId, propertyId))
    // Active first; within each status, newest start date wins.
    .orderBy(asc(projects.status), desc(projects.startDate));

  if (projectRows.length === 0) return [];

  // Pull pending-decision counts in one grouped roundtrip rather than a
  // count-per-project query. Awaiting-client milestones are how the
  // portal surfaces "you have something to do".
  const projectIds = projectRows.map((p) => p.id);
  const decisionRows = await db
    .select({
      projectId: milestones.projectId,
      count: count(),
    })
    .from(milestones)
    .where(
      and(
        inArray(milestones.projectId, projectIds),
        eq(milestones.status, 'awaiting_client'),
      ),
    )
    .groupBy(milestones.projectId);

  const decisionsByProject = new Map(
    decisionRows.map((r) => [r.projectId, Number(r.count)]),
  );

  return projectRows.map((p) => ({
    ...p,
    propertyName: property.name,
    pendingDecisions: decisionsByProject.get(p.id) ?? 0,
  }));
}
