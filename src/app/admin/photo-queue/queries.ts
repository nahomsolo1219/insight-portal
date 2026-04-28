// Cross-client photo queue queries. Three time slices:
//   - pending     → admin's review queue (the active workspace)
//   - categorized → "Recently approved" tab (historical view, capped 50)
//   - rejected    → "Rejected" tab (historical view, capped 50)
//
// The schema doesn't carry `reviewed_at` / `reviewed_by` / `rejection_reason`
// columns; `updatedAt` from the standard timestamps row is the closest
// proxy for "when did this last change state" and we order by it for the
// reviewed tabs.

import { count, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { clients, photos, projects, properties } from '@/db/schema';

export interface PendingPhotoRow {
  id: string;
  caption: string | null;
  storagePath: string;
  uploadedByName: string | null;
  uploadedAt: Date;
  gpsLat: string | null;
  gpsLng: string | null;
  propertyId: string;
  propertyName: string;
  clientId: string;
  clientName: string;
  projectId: string | null;
  projectName: string | null;
}

export interface ReviewedPhotoRow extends PendingPhotoRow {
  /** Admin-assigned tag at review time. */
  tag: 'before' | 'during' | 'after' | null;
  /** Admin-assigned free-text category. */
  category: string | null;
  /** Proxy for "review timestamp" — `photos.updatedAt` flips when the
   *  status moves. Schema doesn't have a dedicated `reviewed_at`. */
  updatedAt: Date;
  status: 'categorized' | 'rejected';
}

export async function getPendingPhotos(): Promise<PendingPhotoRow[]> {
  return db
    .select({
      id: photos.id,
      caption: photos.caption,
      storagePath: photos.storagePath,
      uploadedByName: photos.uploadedByName,
      uploadedAt: photos.uploadedAt,
      gpsLat: photos.gpsLat,
      gpsLng: photos.gpsLng,
      propertyId: properties.id,
      propertyName: properties.name,
      clientId: clients.id,
      clientName: clients.name,
      projectId: photos.projectId,
      projectName: projects.name,
    })
    .from(photos)
    .innerJoin(properties, eq(properties.id, photos.propertyId))
    .innerJoin(clients, eq(clients.id, properties.clientId))
    .leftJoin(projects, eq(projects.id, photos.projectId))
    .where(eq(photos.status, 'pending'))
    .orderBy(desc(photos.uploadedAt));
}

/**
 * Recent reviewed photos for the historical tabs. Capped at 50 — the
 * tabs are a "what was the last batch" reference, not a full archive.
 * Pass either `'categorized'` (= approved) or `'rejected'`.
 */
export async function getReviewedPhotos(
  status: 'categorized' | 'rejected',
  limit = 50,
): Promise<ReviewedPhotoRow[]> {
  const rows = await db
    .select({
      id: photos.id,
      caption: photos.caption,
      storagePath: photos.storagePath,
      uploadedByName: photos.uploadedByName,
      uploadedAt: photos.uploadedAt,
      updatedAt: photos.updatedAt,
      gpsLat: photos.gpsLat,
      gpsLng: photos.gpsLng,
      tag: photos.tag,
      category: photos.category,
      propertyId: properties.id,
      propertyName: properties.name,
      clientId: clients.id,
      clientName: clients.name,
      projectId: photos.projectId,
      projectName: projects.name,
    })
    .from(photos)
    .innerJoin(properties, eq(properties.id, photos.propertyId))
    .innerJoin(clients, eq(clients.id, properties.clientId))
    .leftJoin(projects, eq(projects.id, photos.projectId))
    .where(eq(photos.status, status))
    .orderBy(desc(photos.updatedAt))
    .limit(limit);

  // Bind the literal status onto each row so the consumer doesn't have to
  // pass it through separately. The DB column is the same union.
  return rows.map((r) => ({ ...r, status }));
}

export async function getPendingPhotoCount(): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(photos)
    .where(eq(photos.status, 'pending'));
  return Number(row?.count ?? 0);
}
