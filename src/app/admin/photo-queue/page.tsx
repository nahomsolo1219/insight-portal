import { requireAdmin } from '@/lib/auth/current-user';
import { getSignedUrls } from '@/lib/storage/upload';
import { PhotoQueueClient, type QueuePhotoWithUrl } from './PhotoQueueClient';
import { getPendingPhotos } from './queries';

export default async function PhotoQueuePage() {
  await requireAdmin();

  const pending = await getPendingPhotos();
  const urlMap =
    pending.length > 0
      ? await getSignedUrls(pending.map((p) => p.storagePath))
      : new Map<string, string>();

  const photosWithUrls: QueuePhotoWithUrl[] = pending.map((p) => ({
    ...p,
    signedUrl: urlMap.get(p.storagePath) ?? null,
  }));

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <h1 className="font-display text-brand-teal-500 text-3xl">Photo queue</h1>
        {photosWithUrls.length > 0 && (
          <span className="bg-brand-gold-400 rounded-full px-3 py-1 text-sm font-medium text-white">
            {photosWithUrls.length}
          </span>
        )}
      </header>

      <PhotoQueueClient photos={photosWithUrls} />
    </div>
  );
}
