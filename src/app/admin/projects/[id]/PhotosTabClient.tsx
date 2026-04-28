'use client';

import { Camera, ImageOff, Tag as TagIcon } from 'lucide-react';
import { useEffect, useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  PhotoReviewPanel,
  type ReviewablePhoto,
} from '@/components/admin/PhotoReviewPanel';
import { useToast } from '@/components/admin/ToastProvider';
import {
  categorizePhoto,
  rejectPhoto,
  type PhotoTag,
} from '@/app/admin/clients/[id]/photos-actions';
import { cn } from '@/lib/utils';
import type { ProjectPhotoRow } from './queries';

interface Props {
  projectId: string;
  clientId: string;
  photos: ProjectPhotoRow[];
}

type Action =
  | { type: 'categorize'; ids: string[]; tag: PhotoTag; category: string | null }
  | { type: 'reject'; ids: string[] };

/**
 * Slim project-scoped photo manager. Reuses the shared PhotoReviewPanel
 * (desktop side panel) — keeps parity with the client-detail Photos tab
 * UX without dragging in upload + bulk-action surface, which are still
 * the right home on the property-scoped tab.
 */
export function ProjectPhotosTabClient({ projectId, clientId, photos }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const isDesktop = useIsDesktop();

  const [optimistic, applyOptimistic] = useOptimistic(
    photos,
    (state, action: Action): ProjectPhotoRow[] => {
      switch (action.type) {
        case 'categorize':
          return state.map((p) =>
            action.ids.includes(p.id)
              ? { ...p, status: 'categorized', tag: action.tag, category: action.category }
              : p,
          );
        case 'reject':
          return state.map((p) =>
            action.ids.includes(p.id) ? { ...p, status: 'rejected' } : p,
          );
      }
    },
  );

  const categorySuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const p of optimistic) {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    }
    return Array.from(set).sort();
  }, [optimistic]);

  // Same derived-fallback pattern the other photo grids use — auto-pick
  // the first photo on desktop, slide forward when the active one drops
  // out of the visible set.
  const activeIdEffective = useMemo(() => {
    if (activeId && optimistic.some((p) => p.id === activeId)) return activeId;
    if (isDesktop && optimistic.length > 0) return optimistic[0].id;
    return null;
  }, [activeId, optimistic, isDesktop]);

  const panelPhotos = useMemo<ReviewablePhoto[]>(
    () =>
      optimistic.map((p) => ({
        id: p.id,
        caption: p.caption,
        signedUrl: p.signedUrl,
        uploadedAt: p.uploadedAt,
        uploadedByName: p.uploadedByName,
        status: p.status,
        tag: p.tag,
        category: p.category,
        projectId,
        propertyName: null,
        projectName: null,
        milestoneTitle: p.milestoneTitle,
        gpsLat: p.gpsLat,
        gpsLng: p.gpsLng,
      })),
    [optimistic, projectId],
  );

  function handleCategorize(
    photoId: string,
    data: { tag: PhotoTag; category: string | null },
  ) {
    startTransition(async () => {
      applyOptimistic({ type: 'categorize', ids: [photoId], ...data });
      const result = await categorizePhoto(photoId, clientId, {
        tag: data.tag,
        category: data.category,
        projectId,
      });
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      showToast('Photo categorized');
      router.refresh();
    });
  }

  function handleReject(photoId: string) {
    startTransition(async () => {
      applyOptimistic({ type: 'reject', ids: [photoId] });
      const result = await rejectPhoto(photoId, clientId);
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      showToast('Photo rejected');
      router.refresh();
    });
  }

  if (photos.length === 0) {
    return (
      <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
        <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
          <Camera size={24} strokeWidth={1.5} />
        </div>
        <h3 className="text-base font-semibold text-gray-900">No photos yet</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
          Photos linked to this project will show up here. Upload from the
          property&apos;s Photos tab or have field staff tag them on capture.
        </p>
      </div>
    );
  }

  return (
    <div className="md:grid md:grid-cols-[1fr_380px] md:gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {optimistic.map((photo) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            isActive={activeIdEffective === photo.id}
            onClick={() => setActiveId(photo.id)}
          />
        ))}
      </div>

      <PhotoReviewPanel
        photos={panelPhotos}
        selectedId={activeIdEffective}
        onSelect={setActiveId}
        onApprove={(p, data) =>
          handleCategorize(p.id, { tag: data.tag, category: data.category })
        }
        onReject={(p) => handleReject(p.id)}
        categorySuggestions={categorySuggestions}
      />
    </div>
  );
}

function PhotoCard({
  photo,
  isActive,
  onClick,
}: {
  photo: ProjectPhotoRow;
  isActive: boolean;
  onClick: () => void;
}) {
  const isPending = photo.status === 'pending';
  const isRejected = photo.status === 'rejected';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shadow-soft-md group relative overflow-hidden rounded-2xl bg-paper text-left transition-all',
        isPending && 'ring-2 ring-amber-300',
        isActive && 'ring-brand-teal-500 ring-2',
      )}
    >
      <div
        className={cn(
          'aspect-square w-full overflow-hidden bg-gray-100',
          isRejected && 'opacity-50 grayscale',
        )}
      >
        {photo.signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.signedUrl}
            alt={photo.caption ?? 'Photo'}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-300">
            <ImageOff size={28} strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
        {isPending && (
          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 shadow-sm">
            Pending
          </span>
        )}
        {isRejected && (
          <span className="rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 shadow-sm">
            Rejected
          </span>
        )}
        {photo.tag && !isPending && !isRejected && (
          <span className="bg-brand-teal-50 text-brand-teal-700 rounded-md px-2 py-0.5 text-[11px] font-medium shadow-sm capitalize">
            {photo.tag}
          </span>
        )}
      </div>
      <div className="px-3 py-2.5">
        <div className="truncate text-sm font-medium text-gray-900">
          {photo.caption || 'Untitled photo'}
        </div>
        {photo.milestoneTitle && (
          <div className="mt-0.5 inline-flex items-center gap-1 truncate text-[11px] text-gray-400">
            <TagIcon size={10} strokeWidth={1.5} />
            {photo.milestoneTitle}
          </div>
        )}
      </div>
    </button>
  );
}

// Same desktop check the existing photo surfaces use. Inline because a
// shared lib hook would be the third copy and we'd extract on the next
// caller per CLAUDE.md guidance.
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 768px)').matches;
  });
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isDesktop;
}

