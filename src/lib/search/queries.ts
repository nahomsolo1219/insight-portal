'use server';

import { and, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  clients,
  maintenancePlans,
  milestones,
  projects,
  properties,
  staff,
} from '@/db/schema';
import { requireAdmin } from '@/lib/auth/current-user';
import { EMPTY_RESULTS, type SearchResults } from './types';

const MAX_PER_GROUP = 5;

/**
 * Admin global search. ILIKE across clients, properties, projects,
 * maintenance plans, decisions (awaiting_client milestones), and staff.
 * Returns up to 5 results per group, ordered by relevance (starts-with
 * first, then contains).
 */
export async function searchAdmin(query: string): Promise<SearchResults> {
  await requireAdmin();

  const trimmed = query.trim();
  if (trimmed.length < 2) return EMPTY_RESULTS;

  // Escape special LIKE characters.
  const escaped = trimmed.replace(/[%_\\]/g, '\\$&');
  const pattern = `%${escaped}%`;
  const startsPattern = `${escaped}%`;

  // Relevance ordering: starts-with → contains.
  function relevanceOrder(col: ReturnType<typeof sql.raw>) {
    return sql`CASE WHEN ${col} ILIKE ${startsPattern} THEN 1 ELSE 2 END`;
  }

  const [
    clientRows,
    propertyRows,
    projectRows,
    planRows,
    decisionRows,
    staffRows,
  ] = await Promise.all([
    // Clients: name, email
    db
      .select({ id: clients.id, name: clients.name, email: clients.email })
      .from(clients)
      .where(or(ilike(clients.name, pattern), ilike(clients.email, pattern)))
      .orderBy(relevanceOrder(sql.raw(`"clients"."name"`)))
      .limit(MAX_PER_GROUP),

    // Properties: name, address → joined to client for context
    db
      .select({
        id: properties.id,
        name: properties.name,
        address: properties.address,
        clientName: clients.name,
        clientId: clients.id,
      })
      .from(properties)
      .innerJoin(clients, eq(clients.id, properties.clientId))
      .where(or(ilike(properties.name, pattern), ilike(properties.address, pattern)))
      .orderBy(relevanceOrder(sql.raw(`"properties"."name"`)))
      .limit(MAX_PER_GROUP),

    // Projects: name
    db
      .select({
        id: projects.id,
        name: projects.name,
        type: projects.type,
        propertyName: properties.name,
        clientName: clients.name,
        clientId: clients.id,
      })
      .from(projects)
      .innerJoin(properties, eq(properties.id, projects.propertyId))
      .innerJoin(clients, eq(clients.id, properties.clientId))
      .where(ilike(projects.name, pattern))
      .orderBy(relevanceOrder(sql.raw(`"projects"."name"`)))
      .limit(MAX_PER_GROUP),

    // Maintenance plans: name
    db
      .select({
        id: maintenancePlans.id,
        name: maintenancePlans.name,
        status: maintenancePlans.status,
        propertyName: properties.name,
        clientName: clients.name,
        clientId: clients.id,
      })
      .from(maintenancePlans)
      .innerJoin(properties, eq(properties.id, maintenancePlans.propertyId))
      .innerJoin(clients, eq(clients.id, properties.clientId))
      .where(ilike(maintenancePlans.name, pattern))
      .orderBy(relevanceOrder(sql.raw(`"maintenance_plans"."name"`)))
      .limit(MAX_PER_GROUP),

    // Decisions: milestones where status='awaiting_client' and no response
    db
      .select({
        id: milestones.id,
        title: milestones.title,
        projectName: projects.name,
        clientName: clients.name,
        clientId: clients.id,
        projectId: projects.id,
      })
      .from(milestones)
      .innerJoin(projects, eq(projects.id, milestones.projectId))
      .innerJoin(properties, eq(properties.id, projects.propertyId))
      .innerJoin(clients, eq(clients.id, properties.clientId))
      .where(
        and(
          eq(milestones.status, 'awaiting_client'),
          isNull(milestones.clientResponse),
          or(ilike(milestones.title, pattern), ilike(milestones.questionBody, pattern)),
        ),
      )
      .orderBy(relevanceOrder(sql.raw(`"milestones"."title"`)))
      .limit(MAX_PER_GROUP),

    // Staff: name, email
    db
      .select({ id: staff.id, name: staff.name, role: staff.role, email: staff.email })
      .from(staff)
      .where(or(ilike(staff.name, pattern), ilike(staff.email, pattern)))
      .orderBy(relevanceOrder(sql.raw(`"staff"."name"`)))
      .limit(MAX_PER_GROUP),
  ]);

  return {
    clients: clientRows,
    properties: propertyRows,
    projects: projectRows,
    maintenance_plans: planRows,
    decisions: decisionRows,
    staff: staffRows,
  };
}
