import { ImageOff, MapPin, User as UserIcon } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { ReviewedPhotoRow } from './queries';

export interface ReviewedPhotoWithUrl extends ReviewedPhotoRow {
  signedUrl: string | null;
}

interface Props {
  photos: ReviewedPhotoWithUrl[];
  /** Drives empty-state copy + the small per-card status pill on
   *  rejected cards (so a card pulled out of context still reads
   *  correctly). Approved cards rely on the page-level tab label. */
  status: 'categorized' | 'rejected';
}

/**
 * Read-only grid of reviewed photos for the "Recently approved" and
 * "Rejected" photo-queue tabs. Shares the awaiting-tab card silhouette
 * (image on top, caption + meta below) but strips the selection
 * checkboxes, status dropdown, and "open review modal" affordances —
 * the review work is already done.
 *
 * The schema doesn't carry `reviewed_at` / `reviewed_by` /
 * `rejection_reason`, so the meta line surfaces upload time + uploader
 * name + a "reviewed {n} ago" stamp derived from `updatedAt`.
 */
export function ReviewedPhotoGrid({ photos, status }: Props) {
  if (photos.length === 0) {
    return (
      <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
        <h3 className="text-base font-semibold text-ink-900">
          {status === 'categorized'
            ? 'No approved photos yet'
            : 'No rejected photos yet'}
        </h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-500">
          {status === 'categorized'
            ? 'Photos you approve from the Awaiting tab show up here for the most recent 50.'
            : 'Photos you reject from the Awaiting tab show up here for the most recent 50.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {photos.map((photo) => (
        <ReviewedPhotoCard key={photo.id} photo={photo} status={status} />
      ))}
    </div>
  );
}

function ReviewedPhotoCard({
  photo,
  status,
}: {
  photo: ReviewedPhotoWithUrl;
  status: 'categorized' | 'rejected';
}) {
  return (
    <div className="shadow-soft-md flex flex-col overflow-hidden rounded-2xl bg-paper">
      <div className="bg-cream relative aspect-[4/3] w-full overflow-hidden">
        {photo.signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.signedUrl}
            alt={photo.caption ?? 'Project photo'}
            className={cn(
              'h-full w-full object-cover',
              status === 'rejected' && 'opacity-60',
            )}
            loading="lazy"
          />
        ) : (
          <div className="text-ink-300 flex h-full w-full items-center justify-center">
            <ImageOff size={28} strokeWidth={1.25} />
          </div>
        )}
        {/* Status pill: rejected only — approved cards inherit context
            from the active tab. */}
        {status === 'rejected' && (
          <span className="absolute top-2 left-2 rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-rose-900 uppercase">
            Rejected
          </span>
        )}
        {/* Tag chip: only meaningful for approved (admin sets at review). */}
        {status === 'categorized' && photo.tag && (
          <span className="absolute top-2 left-2 rounded-md bg-paper/90 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-ink-700 uppercase backdrop-blur-sm">
            {photo.tag}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 p-4">
        <div>
          <div className="truncate text-sm font-medium text-ink-900">
            {photo.caption?.trim() || 'Untitled photo'}
          </div>
          {photo.category && (
            <div className="mt-0.5 truncate text-xs text-ink-500">
              {photo.category}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
          <Link
            href={`/admin/clients/${photo.clientId}`}
            className="hover:text-brand-teal-500 inline-flex items-center gap-1 font-medium text-ink-700 transition-colors"
            title={photo.clientName}
          >
            <UserIcon size={11} strokeWidth={1.5} className="text-ink-400" />
            <span className="truncate">{photo.clientName}</span>
          </Link>
          <span className="inline-flex items-center gap-1">
            <MapPin size={11} strokeWidth={1.5} className="text-ink-400" />
            <span className="truncate">{photo.propertyName}</span>
          </span>
        </div>

        {photo.projectName && (
          <div className="text-xs text-ink-500">
            <span className="text-ink-400">Project · </span>
            {photo.projectName}
          </div>
        )}

        <div className="text-[11px] text-ink-400">
          {photo.uploadedByName && (
            <>
              <span>by {photo.uploadedByName}</span>
              <span className="mx-1.5">·</span>
            </>
          )}
          <span>
            uploaded {formatRelative(photo.uploadedAt)}
          </span>
          <span className="mx-1.5">·</span>
          <span>
            reviewed {formatRelative(photo.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** "12m ago" / "3h ago" / "2d ago" / "Apr 12". `updatedAt` is the
 *  proxy for review time since there's no dedicated column. */
function formatRelative(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
