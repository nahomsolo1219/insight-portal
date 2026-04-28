import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current-user';
import { cn } from '@/lib/utils';
import { getSignedUrls } from '@/lib/storage/upload';
import { PhotoQueueClient, type QueuePhotoWithUrl } from './PhotoQueueClient';
import {
  ReviewedPhotoGrid,
  type ReviewedPhotoWithUrl,
} from './ReviewedPhotoGrid';
import { getPendingPhotos, getReviewedPhotos } from './queries';

type Tab = 'awaiting' | 'approved' | 'rejected';

const TABS: ReadonlyArray<{ id: Tab; label: string; status?: 'approved' | 'rejected' }> = [
  { id: 'awaiting', label: 'Awaiting review' },
  { id: 'approved', label: 'Recently approved', status: 'approved' },
  { id: 'rejected', label: 'Rejected', status: 'rejected' },
];

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function PhotoQueuePage({ searchParams }: PageProps) {
  await requireAdmin();
  const { status } = await searchParams;
  const tab: Tab =
    status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'awaiting';

  if (tab === 'awaiting') {
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
      <PhotoQueueShell tab={tab} pendingCount={pending.length}>
        <PhotoQueueClient photos={photosWithUrls} />
      </PhotoQueueShell>
    );
  }

  // Approved / rejected — read-only historical views, capped at 50.
  const dbStatus = tab === 'approved' ? 'categorized' : 'rejected';
  const reviewed = await getReviewedPhotos(dbStatus, 50);
  const urlMap =
    reviewed.length > 0
      ? await getSignedUrls(reviewed.map((p) => p.storagePath))
      : new Map<string, string>();
  const photosWithUrls: ReviewedPhotoWithUrl[] = reviewed.map((p) => ({
    ...p,
    signedUrl: urlMap.get(p.storagePath) ?? null,
  }));

  // We need the awaiting count for the tab badge whichever tab is active.
  const pendingCount = (await getPendingPhotos()).length;

  return (
    <PhotoQueueShell tab={tab} pendingCount={pendingCount}>
      <ReviewedPhotoGrid photos={photosWithUrls} status={dbStatus} />
    </PhotoQueueShell>
  );
}

function PhotoQueueShell({
  tab,
  pendingCount,
  children,
}: {
  tab: Tab;
  pendingCount: number;
  children: React.ReactNode;
}) {
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
          {tab === 'awaiting' && pendingCount > 0 && (
            <span className="bg-brand-gold-400 rounded-full px-3 py-1 text-sm font-medium text-white">
              {pendingCount}
            </span>
          )}
        </div>
      </header>

      <PhotoQueueTabs activeTab={tab} pendingCount={pendingCount} />

      {children}
    </div>
  );
}

function PhotoQueueTabs({
  activeTab,
  pendingCount,
}: {
  activeTab: Tab;
  pendingCount: number;
}) {
  return (
    <nav
      aria-label="Photo queue sections"
      className="border-line border-b -mx-1 flex gap-1 overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((t) => {
        const href =
          t.id === 'awaiting'
            ? '/admin/photo-queue'
            : `/admin/photo-queue?status=${t.status}`;
        const active = t.id === activeTab;
        const showCount = t.id === 'awaiting' && pendingCount > 0;
        return (
          <Link
            key={t.id}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors',
              active ? 'text-ink-900' : 'text-ink-500 hover:text-ink-700',
            )}
          >
            <span className="inline-flex items-center gap-2">
              {t.label}
              {showCount && (
                <span className="bg-brand-gold-100 text-brand-gold-700 rounded-full px-1.5 text-[11px] font-semibold">
                  {pendingCount}
                </span>
              )}
            </span>
            {active && (
              <span
                aria-hidden="true"
                className="bg-brand-gold-500 absolute right-4 -bottom-px left-4 h-0.5 rounded-full"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
