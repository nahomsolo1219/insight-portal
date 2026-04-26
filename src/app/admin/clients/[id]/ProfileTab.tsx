// Server-component wrapper for the Profile tab. Profile is now strictly
// about the client (info + archive). Property concerns moved to the
// dedicated Properties tab, so we drop the property fetch and the
// propertyId prop here — the only data this wrapper still needs is the
// tier + PM dropdown options for the edit-client modal.

import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { membershipTiers, staff } from '@/db/schema';
import { ProfileTabClient } from './ProfileTabClient';
import type { ClientDetailRow } from './queries';

export interface ProfileTabTier {
  id: string;
  name: string;
}

export interface ProfileTabPm {
  id: string;
  name: string;
  role: 'founder' | 'project_manager' | 'field_lead' | 'field_tech' | 'admin_assistant';
}

interface ProfileTabProps {
  client: ClientDetailRow;
}

export async function ProfileTab({ client }: ProfileTabProps) {
  const [tiers, pms] = await Promise.all([
    db
      .select({ id: membershipTiers.id, name: membershipTiers.name })
      .from(membershipTiers)
      .orderBy(asc(membershipTiers.name)),
    db
      .select({ id: staff.id, name: staff.name, role: staff.role })
      .from(staff)
      .where(and(eq(staff.status, 'active'), inArray(staff.role, ['founder', 'project_manager'])))
      .orderBy(asc(staff.name)),
  ]);

  return <ProfileTabClient client={client} tiers={tiers} pms={pms} />;
}
