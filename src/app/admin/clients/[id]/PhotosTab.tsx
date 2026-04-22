// Server wrapper for the Photos tab. Fetches the full photo list + status
// rollup + project picker options, then batch-signs every thumbnail URL
// so the grid can render without a round-trip per image.

import { getSignedUrls } from '@/lib/storage/upload';
import { PhotosTabClient, type PhotoRowWithUrl } from './PhotosTabClient';
import {
  getPhotoStats,
  getPhotosForProperty,
  getProjectsForPropertySelect,
} from './queries';

interface PhotosTabProps {
  clientId: string;
  propertyId: string;
}

export async function PhotosTab({ clientId, propertyId }: PhotosTabProps) {
  const [photoRows, stats, projectOptions] = await Promise.all([
    getPhotosForProperty(propertyId),
    getPhotoStats(propertyId),
    getProjectsForPropertySelect(propertyId),
  ]);

  const urlMap =
    photoRows.length > 0
      ? await getSignedUrls(photoRows.map((p) => p.storagePath))
      : new Map<string, string>();

  const photosWithUrls: PhotoRowWithUrl[] = photoRows.map((p) => ({
    ...p,
    signedUrl: urlMap.get(p.storagePath) ?? null,
  }));

  return (
    <PhotosTabClient
      clientId={clientId}
      propertyId={propertyId}
      photos={photosWithUrls}
      stats={stats}
      projects={projectOptions}
    />
  );
}
