'use client';

import { CheckCheck, CheckSquare, ImageOff, MapPin, Square, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Field, inputClass } from '@/components/admin/Field';
import { Modal } from '@/components/admin/Modal';
import { cn } from '@/lib/utils';
import {
  bulkRejectPhotos,
  categorizePhoto,
  rejectPhoto,
  type PhotoTag,
} from '../clients/[id]/photos-actions';
import type { PendingPhotoRow } from './queries';

export type QueuePhotoWithUrl = PendingPhotoRow & { signedUrl: string | null };

const TAG_OPTIONS: { id: PhotoTag; label: string; badge: string }[] = [
  { id: 'before', label: 'Before', badge: 'bg-blue-50 text-blue-700' },
  { id: 'during', label: 'During', badge: 'bg-amber-50 text-amber-700' },
  { id: 'after', label: 'After', badge: 'bg-emerald-50 text-emerald-700' },
];

interface PhotoQueueClientProps {
  photos: QueuePhotoWithUrl[];
}

export function PhotoQueueClient({ photos }: PhotoQueueClientProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);

  // Group by client so David can see "4 from the Andersons, 2 from the
  // Smiths" rather than a flat mishmash. Ordering within each group stays
  // newest-first per the server sort.
  const byClient = useMemo(() => {
    const map = new Map<string, { clientName: string; photos: QueuePhotoWithUrl[] }>();
    for (const p of photos) {
      const entry = map.get(p.clientId);
      if (entry) entry.photos.push(p);
      else map.set(p.clientId, { clientName: p.clientName, photos: [p] });
    }
    return Array.from(map.entries());
  }, [photos]);

  const detailPhoto = detailId ? photos.find((p) => p.id === detailId) ?? null : null;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function selectAllFromClient(clientPhotos: QueuePhotoWithUrl[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const p of clientPhotos) next.add(p.id);
      return next;
    });
  }

  if (photos.length === 0) {
    return <EmptyState />;
  }

  // Build a clientId map for bulkReject — selected photos may span
  // multiple clients, so we need to group the action call by client.
  const selectedByClient = new Map<string, string[]>();
  for (const p of photos) {
    if (!selectedIds.has(p.id)) continue;
    const existing = selectedByClient.get(p.clientId);
    if (existing) existing.push(p.id);
    else selectedByClient.set(p.clientId, [p.id]);
  }

  return (
    <div className="pb-24">
      <div className="space-y-8">
        {byClient.map(([clientId, group]) => (
          <section key={clientId}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/clients/${clientId}`}
                  className="hover:text-brand-teal-500 text-sm font-semibold text-gray-900 transition-colors"
                >
                  {group.clientName}
                </Link>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                  {group.photos.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => selectAllFromClient(group.photos)}
                className="hover:text-brand-teal-500 text-xs font-medium text-gray-500 transition-colors"
              >
                Select all
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {group.photos.map((photo) => (
                <QueuePhotoCard
                  key={photo.id}
                  photo={photo}
                  selected={selectedIds.has(photo.id)}
                  onToggleSelect={() => toggleSelect(photo.id)}
                  onOpen={() => setDetailId(photo.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          onClear={clearSelection}
          onReject={() => setBulkRejectOpen(true)}
        />
      )}

      {detailPhoto && (
        <PhotoReviewModal
          photo={detailPhoto}
          onClose={() => setDetailId(null)}
        />
      )}

      {bulkRejectOpen && (
        <BulkRejectModal
          selectedByClient={selectedByClient}
          onClose={() => setBulkRejectOpen(false)}
          onSuccess={clearSelection}
        />
      )}
    </div>
  );
}

// ---------- card ----------

interface QueuePhotoCardProps {
  photo: QueuePhotoWithUrl;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}

function QueuePhotoCard({ photo, selected, onToggleSelect, onOpen }: QueuePhotoCardProps) {
  return (
    <div
      className={cn(
        'shadow-card group relative overflow-hidden rounded-2xl bg-white transition-all ring-2 ring-amber-300',
        selected && 'ring-brand-teal-500',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left"
        aria-label={photo.caption ?? 'Review photo'}
      >
        <div className="aspect-square w-full overflow-hidden bg-gray-100">
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
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
        aria-label={selected ? 'Deselect' : 'Select'}
        className={cn(
          'absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-md border transition-all',
          selected
            ? 'border-brand-teal-500 bg-brand-teal-500 text-white'
            : 'border-white/80 bg-white/80 text-gray-400 opacity-0 backdrop-blur-sm group-hover:opacity-100',
        )}
      >
        {selected ? <CheckSquare size={16} strokeWidth={2} /> : <Square size={16} strokeWidth={2} />}
      </button>

      <div className="px-3 py-2.5">
        <div className="truncate text-sm font-medium text-gray-900" title={photo.caption ?? ''}>
          {photo.caption || 'Untitled photo'}
        </div>
        <div className="mt-0.5 truncate text-xs text-gray-500">
          {photo.propertyName}
          {photo.uploadedByName ? ` · ${photo.uploadedByName}` : ''}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-gray-400">
          {formatUploadedAt(photo.uploadedAt)}
        </div>
      </div>
    </div>
  );
}

// ---------- bulk action bar ----------

function BulkActionBar({
  count,
  onClear,
  onReject,
}: {
  count: number;
  onClear: () => void;
  onReject: () => void;
}) {
  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
      <div className="shadow-modal flex items-center gap-2 rounded-2xl border border-gray-100 bg-white py-2 pr-2 pl-4">
        <span className="text-sm font-medium text-gray-900">{count} selected</span>
        <div className="mx-2 h-5 w-px bg-gray-200" />
        <button
          type="button"
          onClick={onReject}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-red-500 transition-all hover:bg-red-50"
        >
          <X size={14} strokeWidth={1.5} />
          Reject
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="ml-1 rounded-lg p-1.5 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

// ---------- review modal ----------

interface PhotoReviewModalProps {
  photo: QueuePhotoWithUrl;
  onClose: () => void;
}

function PhotoReviewModal({ photo, onClose }: PhotoReviewModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [tag, setTag] = useState<PhotoTag | null>(null);
  const [category, setCategory] = useState('');

  function approve() {
    setError(null);
    if (!tag) {
      setError('Pick a tag to approve this photo.');
      return;
    }
    startTransition(async () => {
      const result = await categorizePhoto(photo.id, photo.clientId, {
        tag,
        category: category.trim() || null,
        projectId: photo.projectId,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectPhoto(photo.id, photo.clientId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  const hasGps =
    photo.gpsLat !== null && photo.gpsLat !== '' && photo.gpsLng !== null && photo.gpsLng !== '';

  return (
    <Modal
      open
      onClose={onClose}
      title={photo.caption || 'Review photo'}
      size="lg"
      locked={isPending}
      footer={
        <>
          <button
            type="button"
            onClick={reject}
            disabled={isPending}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 transition-all hover:bg-gray-100 disabled:opacity-50"
          >
            Reject
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl px-5 py-2.5 font-medium text-gray-700 transition-all hover:bg-gray-100 disabled:opacity-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={approve}
            disabled={isPending || !tag}
            className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-5 py-2.5 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Approve'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="overflow-hidden rounded-xl bg-gray-100">
          {photo.signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.signedUrl}
              alt={photo.caption ?? 'Photo'}
              className="max-h-[60vh] w-full object-contain"
            />
          ) : (
            <div className="flex h-64 items-center justify-center text-gray-300">
              <ImageOff size={48} strokeWidth={1.5} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
          <Link
            href={`/admin/clients/${photo.clientId}`}
            className="hover:text-brand-teal-500 font-medium text-gray-700 transition-colors"
          >
            {photo.clientName}
          </Link>
          <span>{photo.propertyName}</span>
          {photo.projectName && <span>{photo.projectName}</span>}
          <span>
            {formatUploadedAt(photo.uploadedAt)}
            {photo.uploadedByName ? ` · ${photo.uploadedByName}` : ''}
          </span>
          {hasGps && (
            <a
              href={`https://www.google.com/maps?q=${photo.gpsLat},${photo.gpsLng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-brand-teal-500 inline-flex items-center gap-1 transition-colors"
            >
              <MapPin size={12} strokeWidth={1.5} />
              {Number(photo.gpsLat).toFixed(4)}, {Number(photo.gpsLng).toFixed(4)}
            </a>
          )}
        </div>

        <div className="space-y-4 border-t border-gray-100 pt-4">
          <Field label="Tag" required>
            <div className="grid grid-cols-3 gap-2">
              {TAG_OPTIONS.map((opt) => {
                const isActive = tag === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTag(opt.id)}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
                      isActive
                        ? 'border-brand-teal-500 bg-brand-teal-50 text-brand-teal-500'
                        : 'hover:border-brand-teal-200 hover:text-brand-teal-500 border-gray-200 text-gray-600',
                    )}
                  >
                    <span className={cn('rounded px-1.5 py-0.5 text-[10px]', opt.badge)}>
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Category" hint="Optional — e.g. Exterior, Roof">
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------- bulk reject modal ----------

interface BulkRejectModalProps {
  /** photos to reject, grouped by clientId — each client call is a separate audit entry. */
  selectedByClient: Map<string, string[]>;
  onClose: () => void;
  onSuccess: () => void;
}

function BulkRejectModal({ selectedByClient, onClose, onSuccess }: BulkRejectModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const total = Array.from(selectedByClient.values()).reduce((sum, ids) => sum + ids.length, 0);

  function confirm() {
    setError(null);
    startTransition(async () => {
      // Fan out one bulkRejectPhotos per client — the action is client-
      // scoped (ownership check joins through properties) so we can't
      // batch across clients in a single call.
      const results = await Promise.all(
        Array.from(selectedByClient.entries()).map(([clientId, ids]) =>
          bulkRejectPhotos(ids, clientId),
        ),
      );
      const failure = results.find((r) => !r.success);
      if (failure && !failure.success) {
        setError(failure.error);
        return;
      }
      onSuccess();
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Reject selected photos?"
      size="sm"
      locked={isPending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl px-5 py-2.5 font-medium text-gray-700 transition-all hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={isPending}
            className="shadow-soft rounded-xl bg-red-500 px-5 py-2.5 font-medium text-white transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Rejecting...' : 'Reject'}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-700">
        You&apos;re about to reject <strong className="font-semibold">{total}</strong>{' '}
        {total === 1 ? 'photo' : 'photos'} across{' '}
        <strong className="font-semibold">{selectedByClient.size}</strong>{' '}
        {selectedByClient.size === 1 ? 'client' : 'clients'}. Rejected photos are hidden from the
        client and can be re-categorized later.
      </p>
      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
    </Modal>
  );
}

// ---------- empty state ----------

function EmptyState() {
  return (
    <div className="shadow-card rounded-2xl bg-white p-12 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <CheckCheck size={24} strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">All caught up</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        No photos are awaiting review. New uploads from field staff will appear here.
      </p>
    </div>
  );
}

// ---------- helpers ----------

function formatUploadedAt(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

