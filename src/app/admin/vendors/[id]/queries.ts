// Reads for the vendor detail page. Three pieces:
//   - vendor row + on-file document count + nearest expiration
//   - hydrated documents list (signed URLs, type-grouped)
//   - recent appointments where this vendor was assigned

import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  appointments,
  clients,
  projects,
  properties,
  vendorDocuments,
  vendors,
} from '@/db/schema';
import { getSignedUrls } from '@/lib/storage/upload';

export type VendorDocumentType =
  | 'insurance'
  | 'w9'
  | 'license'
  | 'contract'
  | 'certificate'
  | 'other';

export interface VendorDetailRow {
  id: string;
  name: string;
  category: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  jobsCompleted: number;
  notes: string | null;
}

export interface VendorDocumentRow {
  id: string;
  name: string;
  type: VendorDocumentType;
  storagePath: string;
  signedUrl: string | null;
  expirationDate: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface VendorJobRow {
  id: string;
  title: string;
  date: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  clientId: string;
  clientName: string;
  propertyName: string;
  projectName: string | null;
}

/** Plain vendor row — header data for the detail page. */
export async function getVendorDetail(vendorId: string): Promise<VendorDetailRow | null> {
  const [vendor] = await db
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
    .where(eq(vendors.id, vendorId))
    .limit(1);
  return vendor ?? null;
}

/**
 * All documents on file for a vendor. Sorted by type → most-recent first
 * within each type so the typical "I need the current insurance cert"
 * lookup lands at the top of its bucket. URLs signed in one batch.
 */
export async function getVendorDocuments(vendorId: string): Promise<VendorDocumentRow[]> {
  const rows = await db
    .select({
      id: vendorDocuments.id,
      name: vendorDocuments.name,
      type: vendorDocuments.type,
      storagePath: vendorDocuments.storagePath,
      expirationDate: vendorDocuments.expirationDate,
      notes: vendorDocuments.notes,
      createdAt: vendorDocuments.createdAt,
    })
    .from(vendorDocuments)
    .where(eq(vendorDocuments.vendorId, vendorId))
    .orderBy(asc(vendorDocuments.type), desc(vendorDocuments.createdAt));

  if (rows.length === 0) return [];

  const paths = rows.map((r) => r.storagePath).filter(Boolean);
  const urlByPath =
    paths.length > 0 ? await getSignedUrls(paths) : new Map<string, string>();

  return rows.map((r) => ({
    ...r,
    signedUrl: urlByPath.get(r.storagePath) ?? null,
  }));
}

/**
 * Recent appointments this vendor was assigned to, with enough context
 * (client + property) to navigate back to the source. Ordered by most-
 * recent first so completed jobs land above future scheduled ones.
 */
export async function getVendorJobHistory(
  vendorId: string,
  limit = 10,
): Promise<VendorJobRow[]> {
  return db
    .select({
      id: appointments.id,
      title: appointments.title,
      date: appointments.date,
      status: appointments.status,
      clientId: clients.id,
      clientName: clients.name,
      propertyName: properties.name,
      projectName: projects.name,
    })
    .from(appointments)
    .innerJoin(properties, eq(properties.id, appointments.propertyId))
    .innerJoin(clients, eq(clients.id, properties.clientId))
    .leftJoin(projects, eq(projects.id, appointments.projectId))
    .where(eq(appointments.vendorId, vendorId))
    .orderBy(desc(appointments.date))
    .limit(limit);
}
