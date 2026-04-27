'use client';

import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  ImageOff,
  MapPin,
  Tag as TagIcon,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Field, inputClass } from '@/components/admin/Field';
import { cn } from '@/lib/utils';

export type ReviewableTag = 'before' | 'during' | 'after';
export type ReviewableStatus = 'pending' | 'categorized' | 'rejected';

/**
 * Minimum shape the panel needs to render and act on a photo. Both the
 * Photo Queue list (multi-client) and the Photos tab (single-property)
 * map their domain rows into this shape.
 */
export interface ReviewablePhoto {
  id: string;
  caption: string | null;
  signedUrl: string | null;
  uploadedAt: Date;
  uploadedByName: string | null;
  status: ReviewableStatus;
  tag: ReviewableTag | null;
  category: string | null;
  projectId: string | null;
  /** Display strings — populate whichever the host page has. */
  clientName?: string | null;
  clientId?: string | null;
  propertyName?: string | null;
  projectName?: string | null;
  milestoneTitle?: string | null;
  gpsLat?: string | number | null;
  gpsLng?: string | number | null;
}

export interface ProjectOptionLite {
  id: string;
  name: string;
}

export interface ReviewSubmission {
  tag: ReviewableTag;
  category: string | null;
  projectId: string | null;
}

interface Props {
  /**
   * Full ordered list — the panel walks it via the navigation arrows /
   * keyboard shortcuts. Photos beyond `pending` status still show up here
   * (so the user can revisit / re-categorize from the Photos tab).
   */
  photos: ReviewablePhoto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onApprove: (photo: ReviewablePhoto, data: ReviewSubmission) => void;
  onReject: (photo: ReviewablePhoto) => void;
  /** Optional project picker (only the Photos tab passes one). */
  projects?: ProjectOptionLite[];
  /** Optional delete affordance (only Photos tab uses it). */
  onDelete?: (photo: ReviewablePhoto) => void;
  /**
   * Suggestions for the category autocomplete. Both contexts pass the
   * categories already used in their photo set.
   */
  categorySuggestions?: string[];
  /**
   * Whether to advance to the next pending photo after a successful
   * approve. Photo Queue: yes. Photos tab on a categorized photo: no.
   * Defaults to true.
   */
  autoAdvance?: boolean;
}

const TAG_OPTIONS: readonly { id: ReviewableTag; label: string; badge: string }[] = [
  { id: 'before', label: 'Before', badge: 'bg-blue-50 text-blue-700' },
  { id: 'during', label: 'During', badge: 'bg-amber-50 text-amber-700' },
  { id: 'after', label: 'After', badge: 'bg-emerald-50 text-emerald-700' },
];

/**
 * Two-up review surface. The host renders the photo grid on the left; we
 * own the right-side detail panel and the keyboard shortcuts. The host
 * tells us which photo is selected (so the grid's selection ring + the
 * panel's preview stay in sync) and we tell the host when to advance.
 *
 * Auto-advance: after a successful Approve we look forward in the photo
 * list for the next `pending` row and select it. The host's optimistic
 * resolver flips the just-approved row to `categorized`, so the next
 * Approve naturally targets the new selection.
 *
 * Keyboard shortcuts:
 *   ← / →   navigate
 *   1 2 3   tag (before / during / after)
 *   Enter   approve (requires tag)
 *   R       reject
 * Disabled when focus is inside an input/textarea so typing in the
 * category field doesn't trigger a tag change.
 */
export function PhotoReviewPanel({
  photos,
  selectedId,
  onSelect,
  onApprove,
  onReject,
  projects,
  onDelete,
  categorySuggestions = [],
  autoAdvance = true,
}: Props) {
  const selectedIndex = selectedId
    ? photos.findIndex((p) => p.id === selectedId)
    : -1;
  const photo = selectedIndex >= 0 ? photos[selectedIndex] : null;

  const pendingCount = useMemo(
    () => photos.filter((p) => p.status === 'pending').length,
    [photos],
  );
  const pendingPosition = useMemo(() => {
    if (!photo || photo.status !== 'pending') return null;
    return photos.filter((p, i) => i <= selectedIndex && p.status === 'pending').length;
  }, [photo, photos, selectedIndex]);

  // Local form state — re-seeded whenever the selection changes so navigating
  // between photos doesn't carry over a half-typed category.
  const [tag, setTag] = useState<ReviewableTag | null>(null);
  const [category, setCategory] = useState('');
  const [projectId, setProjectId] = useState('');

  useEffect(() => {
    setTag(photo?.tag ?? null);
    setCategory(photo?.category ?? '');
    setProjectId(photo?.projectId ?? '');
  }, [photo]);

  function next() {
    const i = selectedIndex >= 0 ? selectedIndex + 1 : 0;
    if (i < photos.length) onSelect(photos[i].id);
  }
  function prev() {
    const i = selectedIndex >= 0 ? selectedIndex - 1 : 0;
    if (i >= 0) onSelect(photos[i].id);
  }
  function nextPending(fromIndex: number): ReviewablePhoto | null {
    for (let i = fromIndex + 1; i < photos.length; i++) {
      if (photos[i].status === 'pending') return photos[i];
    }
    // Wrap to the start so the user can clear out the leftovers without
    // re-opening the page.
    for (let i = 0; i < fromIndex; i++) {
      if (photos[i].status === 'pending') return photos[i];
    }
    return null;
  }

  function approve() {
    if (!photo || !tag) return;
    onApprove(photo, {
      tag,
      category: category.trim() || null,
      projectId: projectId || null,
    });
    if (autoAdvance) {
      const target = nextPending(selectedIndex);
      if (target) onSelect(target.id);
    }
  }
  function reject() {
    if (!photo) return;
    onReject(photo);
    if (autoAdvance) {
      const target = nextPending(selectedIndex);
      if (target) onSelect(target.id);
    }
  }

  // Keyboard shortcuts — only on desktop (the panel is `hidden` below md
  // anyway, but we still gate to avoid hijacking keys on mobile devices
  // with attached keyboards).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          prev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          next();
          break;
        case '1':
          if (photo) setTag('before');
          break;
        case '2':
          if (photo) setTag('during');
          break;
        case '3':
          if (photo) setTag('after');
          break;
        case 'Enter':
          e.preventDefault();
          approve();
          break;
        case 'r':
        case 'R':
          reject();
          break;
        default:
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo, tag, category, projectId, selectedIndex, photos]);

  if (!photo) {
    return (
      <aside className="shadow-card sticky top-6 hidden h-[calc(100vh-7rem)] flex-col items-center justify-center rounded-2xl bg-white p-8 text-center md:flex">
        <ImageOff size={28} strokeWidth={1.25} className="mb-3 text-gray-300" />
        <p className="text-sm font-medium text-gray-700">Select a photo to review</p>
        <p className="mt-1 text-xs text-gray-500">
          Click a thumbnail on the left, or use ← → to navigate.
        </p>
      </aside>
    );
  }

  const hasGps =
    photo.gpsLat !== null &&
    photo.gpsLat !== '' &&
    photo.gpsLat !== undefined &&
    photo.gpsLng !== null &&
    photo.gpsLng !== '' &&
    photo.gpsLng !== undefined;

  const isPending = photo.status === 'pending';
  const submitLabel = isPending ? 'Approve' : 'Update';
  const datalistId = `photo-categories-${photo.id}`;

  return (
    <aside className="shadow-card sticky top-6 hidden h-[calc(100vh-7rem)] flex-col rounded-2xl bg-white md:flex">
      <div className="flex flex-1 flex-col overflow-y-auto p-5">
        <div className="overflow-hidden rounded-xl bg-gray-50">
          {photo.signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.signedUrl}
              alt={photo.caption ?? 'Photo'}
              className="aspect-[4/3] w-full object-contain"
            />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center text-gray-300">
              <ImageOff size={48} strokeWidth={1.5} />
            </div>
          )}
        </div>

        <div className="mt-4 space-y-1">
          <div className="text-base font-semibold text-gray-900">
            {photo.caption || 'Untitled photo'}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            {photo.clientName && photo.clientId ? (
              <Link
                href={`/admin/clients/${photo.clientId}`}
                className="hover:text-brand-teal-500 font-medium text-gray-700 transition-colors"
              >
                {photo.clientName}
              </Link>
            ) : photo.clientName ? (
              <span className="font-medium text-gray-700">{photo.clientName}</span>
            ) : null}
            {photo.propertyName && <span>{photo.propertyName}</span>}
            {photo.projectName && (
              <span className="inline-flex items-center gap-1">
                <FolderOpen size={11} strokeWidth={1.5} />
                {photo.projectName}
              </span>
            )}
            {photo.milestoneTitle && (
              <span className="inline-flex items-center gap-1">
                <TagIcon size={11} strokeWidth={1.5} />
                {photo.milestoneTitle}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
            <span>
              {formatRelative(photo.uploadedAt)}
              {photo.uploadedByName ? ` · ${photo.uploadedByName}` : ''}
            </span>
            {hasGps && (
              <a
                href={`https://www.google.com/maps?q=${photo.gpsLat},${photo.gpsLng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand-teal-500 inline-flex items-center gap-1 transition-colors"
              >
                <MapPin size={11} strokeWidth={1.5} />
                {Number(photo.gpsLat).toFixed(4)}, {Number(photo.gpsLng).toFixed(4)}
              </a>
            )}
            {photo.status !== 'pending' && (
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 font-medium',
                  photo.status === 'rejected'
                    ? 'bg-red-50 text-red-600'
                    : 'bg-emerald-50 text-emerald-700',
                )}
              >
                {photo.status === 'rejected' ? 'Rejected' : 'Categorized'}
              </span>
            )}
          </div>
        </div>

        <div className="mt-5 space-y-4 border-t border-gray-100 pt-5">
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
              list={datalistId}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputClass}
              placeholder="Type or pick a suggestion"
            />
            {categorySuggestions.length > 0 && (
              <datalist id={datalistId}>
                {categorySuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            )}
          </Field>

          {projects && (
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
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 p-4">
        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(photo)}
              aria-label="Delete photo"
              className="inline-flex items-center justify-center rounded-xl px-3 py-2.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50"
            >
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
          )}
          {photo.status !== 'rejected' && (
            <button
              type="button"
              onClick={reject}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              Reject
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={approve}
            disabled={!tag}
            className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div className="flex items-center gap-1">
            <NavArrow label="Previous photo" disabled={selectedIndex <= 0} onClick={prev}>
              <ChevronLeft size={14} strokeWidth={1.75} />
            </NavArrow>
            <NavArrow
              label="Next photo"
              disabled={selectedIndex >= photos.length - 1}
              onClick={next}
            >
              <ChevronRight size={14} strokeWidth={1.75} />
            </NavArrow>
          </div>
          <div className="text-[11px] text-gray-500">
            {pendingPosition !== null && pendingCount > 0
              ? `${pendingPosition} of ${pendingCount} pending`
              : `${selectedIndex + 1} of ${photos.length}`}
          </div>
        </div>

        <p className="mt-2 text-[10px] text-gray-400">
          ← → navigate · 1 2 3 tag · Enter {submitLabel.toLowerCase()} · R reject
        </p>
      </div>
    </aside>
  );
}

function NavArrow({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="hover:bg-brand-warm-50 inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function formatRelative(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
