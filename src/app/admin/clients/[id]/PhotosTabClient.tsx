'use client';

import {
  Camera,
  Check,
  CheckSquare,
  FolderOpen,
  ImageOff,
  MapPin,
  Plus,
  Square,
  Tag as TagIcon,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Field, inputClass, textareaClass } from '@/components/admin/Field';
import { FileUpload, type FileUploadItem } from '@/components/admin/FileUpload';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { cn } from '@/lib/utils';
import {
  bulkCategorizePhotos,
  bulkDeletePhotos,
  bulkRejectPhotos,
  categorizePhoto,
  deletePhoto,
  rejectPhoto,
  uploadPhotos,
  type PhotoStatus,
  type PhotoTag,
} from './photos-actions';
import type { PhotoRow, PhotoStats, ProjectOption } from './queries';

export type PhotoRowWithUrl = PhotoRow & { signedUrl: string | null };

// ---------- constants ----------

const TAG_OPTIONS: { id: PhotoTag; label: string; badge: string }[] = [
  { id: 'before', label: 'Before', badge: 'bg-blue-50 text-blue-700' },
  { id: 'during', label: 'During', badge: 'bg-amber-50 text-amber-700' },
  { id: 'after', label: 'After', badge: 'bg-emerald-50 text-emerald-700' },
];

const STATUS_FILTER_OPTIONS: { id: 'all' | PhotoStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'categorized', label: 'Categorized' },
  { id: 'rejected', label: 'Rejected' },
];

const TAG_FILTER_OPTIONS: { id: 'all' | PhotoTag; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'before', label: 'Before' },
  { id: 'during', label: 'During' },
  { id: 'after', label: 'After' },
];

function tagMeta(tag: string | null) {
  if (!tag) return null;
  return TAG_OPTIONS.find((t) => t.id === tag) ?? null;
}

// ---------- top-level component ----------

interface PhotosTabClientProps {
  clientId: string;
  propertyId: string;
  photos: PhotoRowWithUrl[];
  stats: PhotoStats;
  projects: ProjectOption[];
}

type PhotoAction =
  | {
      type: 'categorize';
      ids: string[];
      tag: PhotoTag;
      category: string | null;
      projectId: string | null;
    }
  | { type: 'reject'; ids: string[] };

export function PhotosTabClient({
  clientId,
  propertyId,
  photos,
  stats,
  projects,
}: PhotosTabClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [, startTransition] = useTransition();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [bulkCatOpen, setBulkCatOpen] = useState(false);
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleteSingleTarget, setDeleteSingleTarget] = useState<PhotoRowWithUrl | null>(null);

  const [statusFilter, setStatusFilter] = useState<'all' | PhotoStatus>('all');
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [tagFilter, setTagFilter] = useState<'all' | PhotoTag>('all');

  // Optimistic overlay — categorize and reject both collapse the server
  // round-trip to a single frame. Delete stays non-optimistic because it's
  // gated behind a confirm modal that already communicates the wait.
  const [optimisticPhotos, applyOptimistic] = useOptimistic(
    photos,
    (state, action: PhotoAction): PhotoRowWithUrl[] => {
      switch (action.type) {
        case 'categorize':
          return state.map((p) =>
            action.ids.includes(p.id)
              ? {
                  ...p,
                  status: 'categorized',
                  tag: action.tag,
                  category: action.category,
                  projectId: action.projectId,
                }
              : p,
          );
        case 'reject':
          return state.map((p) =>
            action.ids.includes(p.id) ? { ...p, status: 'rejected' } : p,
          );
      }
    },
  );

  // Derive the stats bar from optimistic photos so the Pending counter
  // drops the instant the yellow ring disappears on a card.
  const liveStats = useMemo<PhotoStats>(() => {
    if (optimisticPhotos.length === 0) return stats;
    let pending = 0;
    let categorized = 0;
    let rejected = 0;
    for (const p of optimisticPhotos) {
      if (p.status === 'pending') pending += 1;
      else if (p.status === 'categorized') categorized += 1;
      else if (p.status === 'rejected') rejected += 1;
    }
    return { total: optimisticPhotos.length, pending, categorized, rejected };
  }, [optimisticPhotos, stats]);

  const filtered = useMemo(() => {
    return optimisticPhotos.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (projectFilter && p.projectId !== projectFilter) return false;
      if (tagFilter !== 'all' && p.tag !== tagFilter) return false;
      return true;
    });
  }, [optimisticPhotos, statusFilter, projectFilter, tagFilter]);

  const detailPhoto = detailId
    ? optimisticPhotos.find((p) => p.id === detailId) ?? null
    : null;

  function handleCategorize(
    ids: string[],
    data: { tag: PhotoTag; category: string | null; projectId: string | null },
  ) {
    startTransition(async () => {
      applyOptimistic({ type: 'categorize', ids, ...data });
      const result =
        ids.length === 1
          ? await categorizePhoto(ids[0], clientId, data)
          : await bulkCategorizePhotos(ids, clientId, data);
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      showToast(ids.length === 1 ? 'Photo categorized' : `Categorized ${ids.length} photos`);
      router.refresh();
    });
  }

  function handleReject(ids: string[]) {
    startTransition(async () => {
      applyOptimistic({ type: 'reject', ids });
      const result =
        ids.length === 1
          ? await rejectPhoto(ids[0], clientId)
          : await bulkRejectPhotos(ids, clientId);
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      showToast(ids.length === 1 ? 'Photo rejected' : `Rejected ${ids.length} photos`);
      router.refresh();
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds(new Set(filtered.map((p) => p.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  return (
    <div className="pb-24">
      <StatsBar stats={liveStats} />

      <div className="mb-5 flex items-center justify-between gap-3">
        <FilterBar
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          projectFilter={projectFilter}
          setProjectFilter={setProjectFilter}
          tagFilter={tagFilter}
          setTagFilter={setTagFilter}
          projects={projects}
        />
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex flex-shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all duration-150"
        >
          <Upload size={16} strokeWidth={2} />
          Upload photos
        </button>
      </div>

      {photos.length === 0 ? (
        <EmptyState onUploadClick={() => setUploadOpen(true)} />
      ) : filtered.length === 0 ? (
        <FilteredEmptyState />
      ) : (
        <PhotoGrid
          photos={filtered}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onCardClick={setDetailId}
        />
      )}

      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          totalVisible={filtered.length}
          onSelectAll={selectAllVisible}
          onClear={clearSelection}
          onCategorize={() => setBulkCatOpen(true)}
          onReject={() => setBulkRejectOpen(true)}
          onDelete={() => setBulkDeleteOpen(true)}
        />
      )}

      {detailPhoto && (
        <PhotoDetailModal
          photo={detailPhoto}
          projects={projects}
          onClose={() => setDetailId(null)}
          onCategorize={handleCategorize}
          onReject={handleReject}
          onRequestDelete={() => {
            setDetailId(null);
            setDeleteSingleTarget(detailPhoto);
          }}
        />
      )}

      {uploadOpen && (
        <UploadPhotosModal
          clientId={clientId}
          propertyId={propertyId}
          projects={projects}
          onClose={() => setUploadOpen(false)}
        />
      )}

      {bulkCatOpen && (
        <BulkCategorizeModal
          photoIds={Array.from(selectedIds)}
          projects={projects}
          onClose={() => setBulkCatOpen(false)}
          onCategorize={handleCategorize}
          onDone={clearSelection}
        />
      )}

      {bulkRejectOpen && (
        <BulkOptimisticConfirmModal
          title="Reject selected photos?"
          confirmLabel="Reject"
          body={
            <>
              You&apos;re about to reject{' '}
              <strong className="font-semibold">{selectedIds.size}</strong>{' '}
              {selectedIds.size === 1 ? 'photo' : 'photos'}. Rejected photos are hidden from the
              client and can be re-categorized later.
            </>
          }
          onClose={() => setBulkRejectOpen(false)}
          onConfirm={() => {
            handleReject(Array.from(selectedIds));
            clearSelection();
          }}
        />
      )}

      {bulkDeleteOpen && (
        <BulkConfirmModal
          title="Delete selected photos?"
          confirmLabel="Delete"
          danger
          successMessage={`Deleted ${selectedIds.size} ${selectedIds.size === 1 ? 'photo' : 'photos'}`}
          body={
            <>
              You&apos;re about to permanently delete{' '}
              <strong className="font-semibold">{selectedIds.size}</strong>{' '}
              {selectedIds.size === 1 ? 'photo' : 'photos'} from the database and storage. This
              cannot be undone.
            </>
          }
          onClose={() => setBulkDeleteOpen(false)}
          run={async () => bulkDeletePhotos(Array.from(selectedIds), clientId)}
          onSuccess={clearSelection}
        />
      )}

      {deleteSingleTarget && (
        <SingleDeleteModal
          photo={deleteSingleTarget}
          clientId={clientId}
          onClose={() => setDeleteSingleTarget(null)}
        />
      )}
    </div>
  );
}

// ---------- stats bar ----------

function StatsBar({ stats }: { stats: PhotoStats }) {
  return (
    <div className="mb-6 grid grid-cols-4 gap-4">
      <StatMini label="Total" value={stats.total} />
      <StatMini label="Pending" value={stats.pending} tone={stats.pending > 0 ? 'gold' : 'default'} />
      <StatMini label="Categorized" value={stats.categorized} tone="emerald" />
      <StatMini label="Rejected" value={stats.rejected} tone="muted" />
    </div>
  );
}

function StatMini({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'gold' | 'emerald' | 'muted';
}) {
  const valueClass =
    tone === 'gold'
      ? 'text-brand-gold-500'
      : tone === 'emerald'
        ? 'text-emerald-700'
        : tone === 'muted'
          ? 'text-gray-400'
          : 'text-gray-900';
  return (
    <div className="shadow-card rounded-2xl bg-white p-5">
      <div className="text-xs font-medium tracking-wider text-gray-500 uppercase">{label}</div>
      <div className={cn('mt-2 text-2xl font-light tracking-tight', valueClass)}>{value}</div>
    </div>
  );
}

// ---------- filter bar ----------

interface FilterBarProps {
  statusFilter: 'all' | PhotoStatus;
  setStatusFilter: (s: 'all' | PhotoStatus) => void;
  projectFilter: string;
  setProjectFilter: (p: string) => void;
  tagFilter: 'all' | PhotoTag;
  setTagFilter: (t: 'all' | PhotoTag) => void;
  projects: ProjectOption[];
}

function FilterBar({
  statusFilter,
  setStatusFilter,
  projectFilter,
  setProjectFilter,
  tagFilter,
  setTagFilter,
  projects,
}: FilterBarProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <ToggleGroup
        options={STATUS_FILTER_OPTIONS}
        value={statusFilter}
        onChange={setStatusFilter}
      />
      <ToggleGroup
        options={TAG_FILTER_OPTIONS}
        value={tagFilter}
        onChange={setTagFilter}
      />
      {projects.length > 0 && (
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-brand-teal-200 focus:outline-none"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

interface ToggleOption<V extends string> {
  id: V;
  label: string;
}

function ToggleGroup<V extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly ToggleOption<V>[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <div className="bg-brand-warm-200 inline-flex gap-1 rounded-xl p-1">
      {options.map((opt) => {
        const isActive = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all',
              isActive
                ? 'shadow-soft text-brand-teal-500 bg-white'
                : 'hover:text-brand-teal-500 text-gray-500',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- photo grid + card ----------

interface PhotoGridProps {
  photos: PhotoRowWithUrl[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onCardClick: (id: string) => void;
}

function PhotoGrid({ photos, selectedIds, onToggleSelect, onCardClick }: PhotoGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          selected={selectedIds.has(photo.id)}
          onToggleSelect={() => onToggleSelect(photo.id)}
          onOpen={() => onCardClick(photo.id)}
        />
      ))}
    </div>
  );
}

interface PhotoCardProps {
  photo: PhotoRowWithUrl;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}

function PhotoCard({ photo, selected, onToggleSelect, onOpen }: PhotoCardProps) {
  const tag = tagMeta(photo.tag);
  const isPending = photo.status === 'pending';
  const isRejected = photo.status === 'rejected';

  return (
    <div
      className={cn(
        'shadow-card group relative overflow-hidden rounded-2xl bg-white transition-all',
        isPending && 'ring-2 ring-amber-300',
        selected && 'ring-brand-teal-500 ring-2',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left"
        aria-label={photo.caption ?? 'View photo'}
      >
        <div
          className={cn(
            'aspect-square w-full overflow-hidden bg-gray-100',
            isRejected && 'opacity-50 grayscale',
          )}
        >
          {photo.signedUrl ? (
            // Signed URLs expire and come from Supabase Storage; next/image's
            // remote pattern + optimization add latency for zero visible win
            // at thumbnail size. A plain <img> with lazy-load is the right
            // primitive here.
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

      {/* Selection checkbox — top left */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
        aria-label={selected ? 'Deselect photo' : 'Select photo'}
        className={cn(
          'absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-md border transition-all',
          selected
            ? 'border-brand-teal-500 bg-brand-teal-500 text-white'
            : 'border-white/80 bg-white/80 text-gray-400 opacity-0 backdrop-blur-sm group-hover:opacity-100',
        )}
      >
        {selected ? <CheckSquare size={16} strokeWidth={2} /> : <Square size={16} strokeWidth={2} />}
      </button>

      {/* Status / tag — top right */}
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
        {tag && !isPending && !isRejected && (
          <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium shadow-sm', tag.badge)}>
            {tag.label}
          </span>
        )}
      </div>

      {/* Caption + meta */}
      <div className="px-3 py-2.5">
        <div className="truncate text-sm font-medium text-gray-900" title={photo.caption ?? ''}>
          {photo.caption || 'Untitled photo'}
        </div>
        <div className="mt-0.5 truncate text-xs text-gray-500">
          {photo.uploadedByName ? `${photo.uploadedByName} · ` : ''}
          {formatUploadedAt(photo.uploadedAt)}
        </div>
        {photo.category && (
          <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-gray-400">
            <TagIcon size={10} strokeWidth={1.5} />
            <span className="truncate">{photo.category}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- empty states ----------

function EmptyState({ onUploadClick }: { onUploadClick: () => void }) {
  return (
    <div className="shadow-card rounded-2xl bg-white p-12 text-center">
      <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
        <Camera size={24} strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">No photos yet</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        Field staff will upload photos from job sites, or you can upload directly here.
      </p>
      <button
        type="button"
        onClick={onUploadClick}
        className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all"
      >
        <Plus size={16} />
        Upload photos
      </button>
    </div>
  );
}

function FilteredEmptyState() {
  return (
    <div className="shadow-card rounded-2xl bg-white p-12 text-center text-sm text-gray-400">
      No photos match the current filters.
    </div>
  );
}

// ---------- bulk action bar ----------

interface BulkActionBarProps {
  count: number;
  totalVisible: number;
  onSelectAll: () => void;
  onClear: () => void;
  onCategorize: () => void;
  onReject: () => void;
  onDelete: () => void;
}

function BulkActionBar({
  count,
  totalVisible,
  onSelectAll,
  onClear,
  onCategorize,
  onReject,
  onDelete,
}: BulkActionBarProps) {
  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
      <div className="shadow-modal flex items-center gap-2 rounded-2xl border border-gray-100 bg-white py-2 pr-2 pl-4">
        <span className="text-sm font-medium text-gray-900">
          {count} selected
          {count < totalVisible && (
            <>
              {' '}
              <button
                type="button"
                onClick={onSelectAll}
                className="text-brand-teal-500 hover:text-brand-teal-600 ml-1 text-xs font-medium underline-offset-2 hover:underline"
              >
                Select all {totalVisible}
              </button>
            </>
          )}
        </span>
        <div className="mx-2 h-5 w-px bg-gray-200" />
        <button
          type="button"
          onClick={onCategorize}
          className="bg-brand-teal-500 hover:bg-brand-teal-600 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-white transition-all"
        >
          <TagIcon size={14} strokeWidth={1.5} />
          Categorize
        </button>
        <button
          type="button"
          onClick={onReject}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-gray-600 transition-all hover:bg-gray-100"
        >
          <X size={14} strokeWidth={1.5} />
          Reject
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-red-500 transition-all hover:bg-red-50"
        >
          <Trash2 size={14} strokeWidth={1.5} />
          Delete
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

// ---------- detail modal ----------

interface PhotoDetailModalProps {
  photo: PhotoRowWithUrl;
  projects: ProjectOption[];
  onClose: () => void;
  onCategorize: (
    ids: string[],
    data: { tag: PhotoTag; category: string | null; projectId: string | null },
  ) => void;
  onReject: (ids: string[]) => void;
  onRequestDelete: () => void;
}

function PhotoDetailModal({
  photo,
  projects,
  onClose,
  onCategorize,
  onReject,
  onRequestDelete,
}: PhotoDetailModalProps) {
  const [error, setError] = useState<string | null>(null);

  const [tag, setTag] = useState<PhotoTag | null>(photo.tag);
  const [category, setCategory] = useState(photo.category ?? '');
  const [projectId, setProjectId] = useState(photo.projectId ?? '');

  const tagBadge = tagMeta(photo.tag);

  function save() {
    setError(null);
    if (!tag) {
      setError('Pick a tag to categorize this photo.');
      return;
    }
    onCategorize([photo.id], {
      tag,
      category: category.trim() || null,
      projectId: projectId || null,
    });
    onClose();
  }

  function reject() {
    onReject([photo.id]);
    onClose();
  }

  const hasGps =
    photo.gpsLat !== null && photo.gpsLat !== '' && photo.gpsLng !== null && photo.gpsLng !== '';

  return (
    <Modal
      open
      onClose={onClose}
      title={photo.caption || 'Photo'}
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onRequestDelete}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-red-500 transition-all hover:bg-red-50"
          >
            <Trash2 size={14} strokeWidth={1.5} />
            Delete
          </button>
          {photo.status !== 'rejected' && (
            <button
              type="button"
              onClick={reject}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 transition-all hover:bg-gray-100"
            >
              Reject
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-5 py-2.5 font-medium text-gray-700 transition-all hover:bg-gray-100"
          >
            Close
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!tag}
            className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-5 py-2.5 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {photo.status === 'categorized' ? 'Update' : 'Categorize'}
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

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
          <span>
            Uploaded {formatUploadedAt(photo.uploadedAt)}
            {photo.uploadedByName ? ` by ${photo.uploadedByName}` : ''}
          </span>
          {photo.projectName && (
            <span className="inline-flex items-center gap-1">
              <FolderOpen size={12} strokeWidth={1.5} />
              {photo.projectName}
            </span>
          )}
          {photo.milestoneTitle && (
            <span className="inline-flex items-center gap-1">
              <TagIcon size={12} strokeWidth={1.5} />
              {photo.milestoneTitle}
            </span>
          )}
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
          {tagBadge && photo.status === 'categorized' && (
            <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium', tagBadge.badge)}>
              {tagBadge.label}
            </span>
          )}
        </div>

        {/* Categorization controls */}
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

          <Field label="Category" hint="Optional — e.g. Exterior, Roof, Interior drywall">
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Project" hint={projects.length === 0 ? 'No projects on this property' : 'Optional'}>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={projects.length === 0}
              className={inputClass}
            >
              <option value="">— None —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
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

// ---------- upload modal ----------

interface UploadPhotosModalProps {
  clientId: string;
  propertyId: string;
  projects: ProjectOption[];
  onClose: () => void;
}

function UploadPhotosModal({ clientId, propertyId, projects, onClose }: UploadPhotosModalProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [files, setFiles] = useState<FileUploadItem[]>([]);
  const [projectId, setProjectId] = useState('');
  const [tag, setTag] = useState<PhotoTag | ''>('');
  const [category, setCategory] = useState('');
  const [caption, setCaption] = useState('');

  function submit() {
    setError(null);
    if (files.length === 0) {
      setError('Add at least one image.');
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      for (const f of files) formData.append('files', f.file);

      const result = await uploadPhotos(
        clientId,
        propertyId,
        {
          projectId: projectId || null,
          tag: tag || null,
          category: category.trim() || null,
          caption: caption.trim() || undefined,
        },
        formData,
      );

      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }

      const { uploadedCount, failedCount, errors } = result.data!;
      if (uploadedCount === 0) {
        const msg = errors[0]?.error
          ? `Upload failed: ${errors[0].error}`
          : `Upload failed for all ${failedCount} file${failedCount === 1 ? '' : 's'}.`;
        setError(msg);
        showToast(msg, 'error');
        return;
      }
      if (failedCount > 0) {
        const first = errors[0];
        const msg =
          `${uploadedCount} uploaded · ${failedCount} failed` +
          (first ? ` — ${first.name}: ${first.error}` : '');
        setError(msg);
        showToast(msg, 'error');
        router.refresh();
        return;
      }

      showToast(uploadedCount === 1 ? 'Photo uploaded' : `${uploadedCount} photos uploaded`);
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload photos"
      size="lg"
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
            onClick={submit}
            disabled={isPending || files.length === 0}
            className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-5 py-2.5 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? `Uploading ${files.length}...` : `Upload ${files.length || ''}`.trim()}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <Field
          label="Photos"
          required
          hint="Drag and drop or click to browse. Multiple files supported."
        >
          <FileUpload
            kind="image"
            multiple
            maxFiles={40}
            onChange={setFiles}
            disabled={isPending}
          />
        </Field>

        <Field
          label="Tag"
          hint="Optional. Setting a tag auto-categorizes and skips the pending queue."
        >
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setTag('')}
              className={cn(
                'flex items-center justify-center rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
                tag === ''
                  ? 'border-brand-teal-500 bg-brand-teal-50 text-brand-teal-500'
                  : 'hover:border-brand-teal-200 hover:text-brand-teal-500 border-gray-200 text-gray-600',
              )}
            >
              None
            </button>
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

        <div className="grid grid-cols-2 gap-4">
          <Field label="Category" hint="Optional — applies to all uploads">
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Exterior"
              className={inputClass}
            />
          </Field>

          <Field label="Project" hint={projects.length === 0 ? 'No projects' : 'Optional'}>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={projects.length === 0}
              className={inputClass}
            >
              <option value="">— None —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Caption" hint="Applied to every upload — otherwise the filename is used.">
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={2}
            placeholder="What was captured and why"
            className={textareaClass}
          />
        </Field>

        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------- bulk categorize modal ----------

interface BulkCategorizeModalProps {
  photoIds: string[];
  projects: ProjectOption[];
  onClose: () => void;
  onCategorize: (
    ids: string[],
    data: { tag: PhotoTag; category: string | null; projectId: string | null },
  ) => void;
  onDone: () => void;
}

function BulkCategorizeModal({
  photoIds,
  projects,
  onClose,
  onCategorize,
  onDone,
}: BulkCategorizeModalProps) {
  const [error, setError] = useState<string | null>(null);

  const [tag, setTag] = useState<PhotoTag | null>(null);
  const [category, setCategory] = useState('');
  const [projectId, setProjectId] = useState('');

  function submit() {
    setError(null);
    if (!tag) {
      setError('Pick a tag for the batch.');
      return;
    }
    onCategorize(photoIds, {
      tag,
      category: category.trim() || null,
      projectId: projectId || null,
    });
    onDone();
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Categorize ${photoIds.length} photo${photoIds.length === 1 ? '' : 's'}`}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-5 py-2.5 font-medium text-gray-700 transition-all hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!tag}
            className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-5 py-2.5 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply to all
          </button>
        </>
      }
    >
      <div className="space-y-5">
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

        <Field label="Category" hint="Optional — applies to all selected photos">
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Project" hint={projects.length === 0 ? 'No projects' : 'Optional'}>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={projects.length === 0}
            className={inputClass}
          >
            <option value="">— None —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------- optimistic confirm (fires a synchronous parent handler) ----------

interface BulkOptimisticConfirmModalProps {
  title: string;
  confirmLabel: string;
  body: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
}

function BulkOptimisticConfirmModal({
  title,
  confirmLabel,
  body,
  onClose,
  onConfirm,
}: BulkOptimisticConfirmModalProps) {
  function handle() {
    onConfirm();
    onClose();
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-5 py-2.5 font-medium text-gray-700 transition-all hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handle}
            className="bg-brand-teal-500 hover:bg-brand-teal-600 shadow-soft rounded-xl px-5 py-2.5 font-medium text-white transition-all"
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-700">{body}</p>
    </Modal>
  );
}

// ---------- shared bulk confirm modal (reject / delete) ----------

interface BulkConfirmModalProps {
  title: string;
  confirmLabel: string;
  /** Toast text on success. Set to `null` to suppress the toast. */
  successMessage: string | null;
  body: React.ReactNode;
  danger?: boolean;
  onClose: () => void;
  run: () => Promise<{ success: true; data?: unknown } | { success: false; error: string }>;
  onSuccess: () => void;
}

function BulkConfirmModal({
  title,
  confirmLabel,
  successMessage,
  body,
  danger,
  onClose,
  run,
  onSuccess,
}: BulkConfirmModalProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await run();
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      if (successMessage) showToast(successMessage);
      onSuccess();
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
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
            className={cn(
              'shadow-soft rounded-xl px-5 py-2.5 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50',
              danger ? 'bg-red-500 hover:bg-red-600' : 'bg-brand-teal-500 hover:bg-brand-teal-600',
            )}
          >
            {isPending ? 'Working...' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-700">{body}</p>
      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
    </Modal>
  );
}

// ---------- single-photo delete modal ----------

interface SingleDeleteModalProps {
  photo: PhotoRowWithUrl;
  clientId: string;
  onClose: () => void;
}

function SingleDeleteModal({ photo, clientId, onClose }: SingleDeleteModalProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await deletePhoto(photo.id, clientId);
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Photo deleted');
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Delete photo?"
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
            {isPending ? 'Deleting...' : 'Delete'}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-gray-700">
        You&apos;re about to delete{' '}
        <strong className="font-semibold">{photo.caption || 'this photo'}</strong>.
      </p>
      <p className="text-sm text-gray-500">
        This removes the file from storage and the database. Use{' '}
        <span className="inline-flex items-center gap-1">
          <Check size={12} strokeWidth={1.5} />
          Reject
        </span>{' '}
        instead if you want to keep it hidden but recoverable.
      </p>
      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
    </Modal>
  );
}

// ---------- helpers ----------

/**
 * Format a photo's upload timestamp. Same date/time as the card and the
 * detail view — keeping it terse since the card is narrow.
 */
function formatUploadedAt(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
