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
 * Every project (active, completed, on-hold) across all of this client's
 * properties. Active projects sort first; within each status, newest start
 * date wins. Pending-decision counts come back in the same payload so the
 * card can flag projects the client needs to act on.
 */
export async function getClientProjects(
  clientId: string,
): Promise<ClientProjectListRow[]> {
  // 1. Walk the property → project tree once, keeping property names on hand
  //    so we don't N+1 a lookup per card.
  const clientProperties = await db
    .select({ id: properties.id, name: properties.name })
    .from(properties)
    .where(eq(properties.clientId, clientId));

  const propertyIds = clientProperties.map((p) => p.id);
  if (propertyIds.length === 0) return [];

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
    .where(inArray(projects.propertyId, propertyIds))
    // Active first; within each status, newest start date wins.
    .orderBy(asc(projects.status), desc(projects.startDate));

  if (projectRows.length === 0) return [];

  // 2. Pull pending-decision counts in one grouped roundtrip rather than a
  //    count-per-project query. Awaiting-client milestones are how the
  //    portal surfaces "you have something to do".
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
  const propertyById = new Map(clientProperties.map((p) => [p.id, p.name]));

  return projectRows.map((p) => ({
    ...p,
    propertyName: propertyById.get(p.propertyId) ?? '',
    pendingDecisions: decisionsByProject.get(p.id) ?? 0,
  }));
}
