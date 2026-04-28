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
      <header>
        <div className="mb-3 flex items-center gap-2">
          <span aria-hidden="true" className="bg-brand-gold-500 inline-block h-px w-8" />
          <span className="text-ink-500 text-[11px] font-medium uppercase tracking-[0.18em]">
            Field intake
          </span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-ink-900 text-3xl font-light tracking-tight">Photo queue</h1>
          {photosWithUrls.length > 0 && (
            <span className="bg-brand-gold-400 rounded-full px-3 py-1 text-sm font-medium text-white">
              {photosWithUrls.length}
            </span>
          )}
        </div>
      </header>

      <PhotoQueueClient photos={photosWithUrls} />
    </div>
  );
}
