// Staff directory reads. Everything the list + edit flow needs in one
// shot — there's no separate detail page (yet), the edit modal operates
// on rows already in memory.

import { asc } from 'drizzle-orm';
import { db } from '@/db';
import { staff } from '@/db/schema';

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
}

export async function listStaff(): Promise<StaffRow[]> {
  return db
    .select({
      id: staff.id,
      name: staff.name,
      role: staff.role,
      email: staff.email,
      phone: staff.phone,
      status: staff.status,
    })
    .from(staff)
    .orderBy(asc(staff.name));
}
