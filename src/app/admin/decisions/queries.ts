// Every milestone in `awaiting_client` status — the things David has
// asked a client to decide but hasn't heard back on. Joined to the full
// client chain so cards can link straight to the relevant client.

import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { clients, milestones, projects, properties } from '@/db/schema';

export interface DecisionRow {
  id: string;
  title: string;
  /** YYYY-MM-DD | null — soonest-due first when present, never-due last. */
  dueDate: string | null;
  questionType: 'single' | 'multi' | 'approval' | 'open' | 'acknowledge' | null;
  questionBody: string | null;
  /** jsonb — shape varies by questionType; client normalises to a string[]. */
  options: unknown;
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
  return db
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
}
