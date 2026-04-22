// Cross-client photo queue: every photo in `pending` status, regardless
// of which client it belongs to. Each row carries its client + property
// so the card can show who the photo is for without a second round-trip.

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

export async function getPendingPhotoCount(): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(photos)
    .where(eq(photos.status, 'pending'));
  return Number(row?.count ?? 0);
}
