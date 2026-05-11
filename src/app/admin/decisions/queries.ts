// Every milestone in `awaiting_client` status — the things David has
// asked a client to decide but hasn't heard back on. Joined to the full
// client chain so cards can link straight to the relevant client.

import { and, asc, desc, eq, gte, isNotNull, lte } from 'drizzle-orm';
import { db } from '@/db';
import { clients, milestones, projects, properties } from '@/db/schema';
import {
  hydrateOptionGroups,
  type AdminDecisionOption,
} from '@/lib/decision-options';

export interface DecisionRow {
  id: string;
  title: string;
  /** YYYY-MM-DD | null — soonest-due first when present, never-due last. */
  dueDate: string | null;
  questionType: 'single' | 'multi' | 'approval' | 'open' | 'acknowledge' | null;
  questionBody: string | null;
  /** Hydrated server-side: each option gets a pre-signed `imageUrl` when
   *  the underlying jsonb stored an `imageStoragePath`. */
  options: AdminDecisionOption[];
  clientResponse: string | null;
  respondedAt: Date | null;
  projectId: string;
  projectName: string;
  propertyId: string;
  propertyName: string;
  clientId: string;
  clientName: string;
  createdAt: Date;
}

export async function getPendingDecisions(): Promise<DecisionRow[]> {
  const rows = await db
    .select({
      id: milestones.id,
      title: milestones.title,
      dueDate: milestones.dueDate,
      questionType: milestones.questionType,
      questionBody: milestones.questionBody,
      options: milestones.options,
      clientResponse: milestones.clientResponse,
      respondedAt: milestones.respondedAt,
      projectId: projects.id,
      projectName: projects.name,
      propertyId: properties.id,
      propertyName: properties.name,
      clientId: clients.id,
      clientName: clients.name,
      createdAt: milestones.createdAt,
    })
    .from(milestones)
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .innerJoin(clients, eq(clients.id, properties.clientId))
    .where(eq(milestones.status, 'awaiting_client'))
    .orderBy(asc(milestones.dueDate), desc(milestones.createdAt));

  // Sign every option image across every milestone in one batch.
  const optionsByRow = await hydrateOptionGroups(rows);

  return rows.map((row) => ({
    ...row,
    options: optionsByRow.get(row.id) ?? [],
  }));
}

// ---------- past decisions (audit) ----------

export type PastDecisionSort = 'newest' | 'oldest' | 'client';

export interface PastDecisionFilters {
  clientId?: string;
  /** YYYY-MM-DD — inclusive lower bound on respondedAt. */
  startDate?: string;
  /** YYYY-MM-DD — inclusive upper bound on respondedAt. */
  endDate?: string;
  sort?: PastDecisionSort;
}

export interface PastDecisionClientOption {
  id: string;
  name: string;
}

const PAST_DECISIONS_LIMIT = 50;

/**
 * Every milestone the client has already responded to — read across all
 * clients for the firm-wide audit surface. Independent of current status:
 * once `clientResponse` is set, the decision is considered "past" even
 * if David hasn't flipped the milestone to complete yet.
 */
export async function getPastDecisions(
  filters: PastDecisionFilters = {},
): Promise<DecisionRow[]> {
  const conditions = [isNotNull(milestones.clientResponse)];

  if (filters.clientId) {
    conditions.push(eq(clients.id, filters.clientId));
  }
  if (filters.startDate) {
    conditions.push(gte(milestones.respondedAt, new Date(`${filters.startDate}T00:00:00Z`)));
  }
  if (filters.endDate) {
    // End of day in UTC — inclusive bound that still treats the date as a
    // calendar day rather than a timestamp.
    conditions.push(lte(milestones.respondedAt, new Date(`${filters.endDate}T23:59:59.999Z`)));
  }

  const sort = filters.sort ?? 'newest';
  const orderBy =
    sort === 'oldest'
      ? [asc(milestones.respondedAt)]
      : sort === 'client'
        ? [asc(clients.name), desc(milestones.respondedAt)]
        : [desc(milestones.respondedAt)];

  const rows = await db
    .select({
      id: milestones.id,
      title: milestones.title,
      dueDate: milestones.dueDate,
      questionType: milestones.questionType,
      questionBody: milestones.questionBody,
      options: milestones.options,
      clientResponse: milestones.clientResponse,
      respondedAt: milestones.respondedAt,
      projectId: projects.id,
      projectName: projects.name,
      propertyId: properties.id,
      propertyName: properties.name,
      clientId: clients.id,
      clientName: clients.name,
      createdAt: milestones.createdAt,
    })
    .from(milestones)
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .innerJoin(clients, eq(clients.id, properties.clientId))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(PAST_DECISIONS_LIMIT);

  const optionsByRow = await hydrateOptionGroups(rows);

  return rows.map((row) => ({
    ...row,
    options: optionsByRow.get(row.id) ?? [],
  }));
}

/**
 * Distinct clients with at least one past decision. Drives the filter
 * dropdown so we don't show options that would return zero rows.
 */
export async function getPastDecisionClients(): Promise<PastDecisionClientOption[]> {
  const rows = await db
    .selectDistinct({ id: clients.id, name: clients.name })
    .from(milestones)
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .innerJoin(clients, eq(clients.id, properties.clientId))
    .where(isNotNull(milestones.clientResponse))
    .orderBy(asc(clients.name));

  return rows;
}
