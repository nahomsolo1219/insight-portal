// Settings page reads. Tiers + email templates only for now; the
// "Company" section is a placeholder with no DB backing yet.

import { asc, count, eq } from 'drizzle-orm';
import { db } from '@/db';
import { clients, emailTemplates, membershipTiers, staff } from '@/db/schema';

export interface MembershipTierRow {
  id: string;
  name: string;
  annualPriceCents: number;
  description: string | null;
  clientCount: number;
}

export async function listMembershipTiers(): Promise<MembershipTierRow[]> {
  const tiers = await db
    .select({
      id: membershipTiers.id,
      name: membershipTiers.name,
      annualPriceCents: membershipTiers.annualPriceCents,
      description: membershipTiers.description,
    })
    .from(membershipTiers)
    .orderBy(asc(membershipTiers.name));

  if (tiers.length === 0) return [];

  const counts = await db
    .select({ tierId: clients.membershipTierId, count: count() })
    .from(clients)
    .groupBy(clients.membershipTierId);

  const countMap = new Map<string, number>();
  for (const row of counts) {
    if (row.tierId) countMap.set(row.tierId, Number(row.count));
  }

  return tiers.map((t) => ({ ...t, clientCount: countMap.get(t.id) ?? 0 }));
}

export interface EmailTemplateRow {
  id: string;
  name: string;
  key: string | null;
  subject: string;
  body: string;
  bodyHtml: string | null;
  variables: string[];
  enabled: boolean;
  lastEditedByName: string | null;
  updatedAt: Date;
}

export async function listEmailTemplates(): Promise<EmailTemplateRow[]> {
  const rows = await db
    .select({
      id: emailTemplates.id,
      name: emailTemplates.name,
      key: emailTemplates.key,
      subject: emailTemplates.subject,
      body: emailTemplates.body,
      bodyHtml: emailTemplates.bodyHtml,
      variables: emailTemplates.variables,
      enabled: emailTemplates.enabled,
      lastEditedByName: staff.name,
      updatedAt: emailTemplates.updatedAt,
    })
    .from(emailTemplates)
    .leftJoin(staff, eq(staff.id, emailTemplates.lastEditedBy))
    .orderBy(asc(emailTemplates.name));

  return rows.map((r) => ({
    ...r,
    variables: Array.isArray(r.variables)
      ? (r.variables as string[])
      : [],
  }));
}
