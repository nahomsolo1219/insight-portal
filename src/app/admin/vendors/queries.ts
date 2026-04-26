// Vendor directory reads. Pure select — the page component owns auth.

import { asc } from 'drizzle-orm';
import { db } from '@/db';
import { vendors } from '@/db/schema';

export interface VendorRow {
  id: string;
  name: string;
  category: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  jobsCompleted: number;
  notes: string | null;
}

export async function listVendors(): Promise<VendorRow[]> {
  return db
    .select({
      id: vendors.id,
      name: vendors.name,
      category: vendors.category,
      phone: vendors.phone,
      email: vendors.email,
      active: vendors.active,
      jobsCompleted: vendors.jobsCompleted,
      notes: vendors.notes,
    })
    .from(vendors)
    .orderBy(asc(vendors.name));
}
