// Server-component wrapper for the Profile tab. Loads the full property row
// (the parent page only selects a subset) plus the tier + PM dropdown options
// for the edit modal, then hands everything to the client component.

import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { membershipTiers, staff } from '@/db/schema';
import { ProfileTabClient } from './ProfileTabClient';
import type { ClientDetailRow } from './queries';
import { getPropertyDetail } from './queries';

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
  // `clientId` is implicit in `client.id`; the page passes it explicitly for
  // symmetry with the other tab wrappers, but we only need `client` here.
  clientId: string;
  propertyId: string | null;
  client: ClientDetailRow;
}

export async function ProfileTab({ propertyId, client }: ProfileTabProps) {
  const [property, tiers, pms] = await Promise.all([
    propertyId ? getPropertyDetail(propertyId) : Promise.resolve(null),
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

  return <ProfileTabClient client={client} property={property} tiers={tiers} pms={pms} />;
}
