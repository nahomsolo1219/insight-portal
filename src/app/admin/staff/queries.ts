// Staff directory reads. Everything the list + edit flow needs in one
// shot — there's no separate detail page (yet), the edit modal operates
// on rows already in memory.

import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { profiles, staff } from '@/db/schema';
import { getAvatarPublicUrl } from '@/lib/storage/upload';

export type StaffRole =
  | 'founder'
  | 'project_manager'
  | 'field_staff'
  | 'admin_assistant';

export type StaffStatus = 'active' | 'pending' | 'inactive';

export interface StaffRow {
  id: string;
  name: string;
  role: StaffRole;
  email: string;
  phone: string | null;
  status: StaffStatus;
  /** Public avatar URL composed from `profiles.avatarUrl` when the
   *  staff row has a portal account; null otherwise. */
  avatarPublicUrl: string | null;
}

export async function listStaff(): Promise<StaffRow[]> {
  // Left-join profiles so we can pull the avatar path for staff who
  // have a portal account. Non-portal staff just lack the join row;
  // the UI falls back to initials. updatedAt drives the cache-bust
  // version so a recently uploaded avatar appears immediately.
  const rows = await db
    .select({
      id: staff.id,
      name: staff.name,
      role: staff.role,
      email: staff.email,
      phone: staff.phone,
      status: staff.status,
      avatarPath: profiles.avatarUrl,
      profileUpdatedAt: profiles.updatedAt,
    })
    .from(staff)
    .leftJoin(profiles, eq(profiles.staffId, staff.id))
    .orderBy(asc(staff.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    email: r.email,
    phone: r.phone,
    status: r.status,
    avatarPublicUrl: r.avatarPath
      ? getAvatarPublicUrl(r.avatarPath, r.profileUpdatedAt?.getTime())
      : null,
  }));
}
