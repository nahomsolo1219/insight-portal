// Every milestone in `awaiting_client` status — the things David has
// asked a client to decide but hasn't heard back on. Joined to the full
// client chain so cards can link straight to the relevant client.

import { asc, desc, eq } from 'drizzle-orm';
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
