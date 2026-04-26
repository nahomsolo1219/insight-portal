'use client';

import { Camera, Check, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { getPropertyProjectsAction, uploadFieldPhotos } from '../actions';
import type { FieldProjectOption, FieldPropertyRow } from '../queries';

interface Props {
  properties: FieldPropertyRow[];
  initialPropertyId: string | null;
  initialProjectId: string | null;
  initialProjects: FieldProjectOption[];
}

interface Pick {
  // Stable client id so the thumbnail strip can key reliably across
  // re-renders even though the underlying File doesn't have one.
  key: string;
  file: File;
  previewUrl: string;
}

interface SuccessState {
  uploadedCount: number;
  failedCount: number;
  errors: { name: string; error: string }[];
}

const ACCEPT_LIST = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

/**
 * Mobile-first photo capture for field staff.
 *
 * The whole flow lives in one client component so the file picker, the
 * thumbnail strip, the property/project selectors, and the upload progress
 * all share state without prop-drilling. Three visual states:
 *
 *   1. Idle    — empty drop zone + a big tap-to-camera button.
 *   2. Picked  — thumbnail strip with × per file + the gold Upload N CTA.
 *   3. Success — confirmation card with "Upload more" / "Back to home".
 *
 * Property switching does a server-action round-trip to refresh the
 * project picker rather than passing the full property→projects map up
 * front (would be O(properties) reads server-side for a screen most
 * technicians use exactly once per visit).
 */
export function MobilePhotoCapture({
  properties,
  initialPropertyId,
  initialProjectId,
  initialProjects,
}: Props) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [propertyId, setPropertyId] = useState<string | null>(initialPropertyId);
  const [projects, setProjects] = useState<FieldProjectOption[]>(initialProjects);
  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const [caption, setCaption] = useState('');
  const [picks, setPicks] = useState<Pick[]>([]);

  const [isUploading, startUploadTransition] = useTransition();
  const [isFetchingProjects, startProjectsTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  // Revoke object URLs when picks are dropped — prevents an event-loop
  // memory leak across repeated upload cycles on the same screen.
  useEffect(() => {
    return () => {
      picks.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // We intentionally only want this on unmount; per-pick revoke is
    // handled in `removePick`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePropertyChange(nextId: string) {
    const id = nextId || null;
    setPropertyId(id);
    setProjectId(null);
    if (!id) {
      setProjects([]);
      return;
    }
    startProjectsTransition(async () => {
      const next = await getPropertyProjectsAction(id);
      setProjects(next);
    });
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same file later
    if (files.length === 0) return;

    setSuccess(null);
    setError(null);

    const next: Pick[] = files.map((file) => ({
      key:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setPicks((prev) => [...prev, ...next]);
  }

  function removePick(key: string) {
    setPicks((prev) => {
      const target = prev.find((p) => p.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  }

  function submit() {
    setError(null);
    if (!propertyId) return setError('Pick a property first.');
    if (picks.length === 0) return setError('Add at least one photo.');

    startUploadTransition(async () => {
      const formData = new FormData();
      for (const p of picks) formData.append('photos', p.file);

      const result = await uploadFieldPhotos(
        propertyId,
        { projectId, caption },
        formData,
      );

      if (!result.success) {
        setError(result.error);
        return;
      }
      // Drop the local previews now that the server has them — keeps the
      // success card free of leftover thumbnails.
      picks.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPicks([]);
      setCaption('');
      setSuccess({
        uploadedCount: result.uploadedCount,
        failedCount: result.failedCount,
        errors: result.errors,
      });
    });
  }

  // ---- Success view ----
  if (success) {
    return (
      <SuccessCard
        result={success}
        onUploadMore={() => {
          setSuccess(null);
        }}
      />
    );
  }

  // ---- Form view ----
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="prop-select">Property</Label>
        <select
          id="prop-select"
          value={propertyId ?? ''}
          onChange={(e) => handlePropertyChange(e.target.value)}
          // 48px height meets the touch-target minimum on mobile and
          // gives the iOS native picker comfortable hit area.
          className="focus:ring-brand-teal-200 focus:border-brand-teal-300 h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-base text-gray-900 focus:ring-2 focus:outline-none"
        >
          <option value="">— Select a property —</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.clientName} · {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="proj-select">
          Project <span className="text-xs font-normal text-gray-400">(optional)</span>
        </Label>
        <select
          id="proj-select"
          value={projectId ?? ''}
          onChange={(e) => setProjectId(e.target.value || null)}
          disabled={!propertyId || projects.length === 0 || isFetchingProjects}
          className="focus:ring-brand-teal-200 focus:border-brand-teal-300 h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-base text-gray-900 focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="">
            {!propertyId
              ? 'Pick a property first'
              : isFetchingProjects
                ? 'Loading…'
                : projects.length === 0
                  ? 'No active projects on this property'
                  : '— None —'}
          </option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="caption">
          Caption <span className="text-xs font-normal text-gray-400">(optional)</span>
        </Label>
        <textarea
          id="caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={2}
          placeholder="Describe what you're photographing…"
          className="focus:ring-brand-teal-200 focus:border-brand-teal-300 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-3 text-base text-gray-900 focus:ring-2 focus:outline-none"
        />
      </div>

      <CameraDropZone
        fileInputId={fileInputId}
        fileInputRef={fileInputRef}
        onFiles={handleFiles}
        disabled={!propertyId || isUploading}
      />

      {picks.length > 0 && (
        <ThumbnailStrip picks={picks} onRemove={removePick} disabled={isUploading} />
      )}

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={isUploading || picks.length === 0 || !propertyId}
        // 56px tall full-width gold CTA — the most important button on
        // the screen, sized for a one-thumb tap.
        className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {isUploading ? (
          <>
            <Loader2 size={18} strokeWidth={2} className="animate-spin" />
            Uploading {picks.length}…
          </>
        ) : picks.length === 0 ? (
          'Choose photos to upload'
        ) : (
          <>
            <Camera size={18} strokeWidth={1.75} />
            Upload {picks.length} {picks.length === 1 ? 'photo' : 'photos'}
          </>
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Camera drop zone
// ---------------------------------------------------------------------------

function CameraDropZone({
  fileInputId,
  fileInputRef,
  onFiles,
  disabled,
}: {
  fileInputId: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled: boolean;
}) {
  return (
    <div>
      {/*
        capture="environment" tells iOS Safari + Chrome on Android to open
        the rear camera by default. The OS will still surface a "Photo
        Library" option so the technician can pick existing shots from
        the morning.
      */}
      <input
        ref={fileInputRef}
        id={fileInputId}
        type="file"
        accept={ACCEPT_LIST}
        capture="environment"
        multiple
        onChange={onFiles}
        className="sr-only"
      />
      <label
        htmlFor={fileInputId}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-white py-8 text-center transition-colors',
          disabled
            ? 'border-gray-200 opacity-60'
            : 'border-brand-teal-200 hover:border-brand-teal-400 hover:bg-brand-warm-50',
        )}
      >
        <span className="bg-brand-teal-50 text-brand-teal-500 flex h-12 w-12 items-center justify-center rounded-full">
          <Camera size={22} strokeWidth={1.75} />
        </span>
        <span className="text-sm font-semibold text-gray-700">
          Tap to take a photo or choose from gallery
        </span>
        <span className="text-[11px] text-gray-400">
          JPEG, PNG, WebP, HEIC · up to 25 MB each
        </span>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thumbnail strip (selected, pre-upload)
// ---------------------------------------------------------------------------

function ThumbnailStrip({
  picks,
  onRemove,
  disabled,
}: {
  picks: Pick[];
  onRemove: (key: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-2">
        {picks.map((p) => (
          <div key={p.key} className="relative flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.previewUrl}
              alt={p.file.name}
              className="h-20 w-20 rounded-xl border border-gray-200 object-cover"
            />
            <button
              type="button"
              onClick={() => onRemove(p.key)}
              disabled={disabled}
              aria-label={`Remove ${p.file.name}`}
              className="absolute -top-1.5 -right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-white shadow-md transition-opacity hover:bg-black disabled:opacity-30"
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Success view
// ---------------------------------------------------------------------------

function SuccessCard({
  result,
  onUploadMore,
}: {
  result: SuccessState;
  onUploadMore: () => void;
}) {
  const { uploadedCount, failedCount, errors } = result;
  return (
    <div className="space-y-5">
      <div className="shadow-card flex flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Check size={28} strokeWidth={2.5} />
        </span>
        <h2 className="text-xl font-semibold text-gray-900">
          {uploadedCount} {uploadedCount === 1 ? 'photo' : 'photos'} uploaded
        </h2>
        <p className="text-sm text-gray-500">
          They&apos;re in the office&apos;s queue for review and tagging.
        </p>
        {failedCount > 0 && (
          <div className="mt-2 w-full rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-left text-xs text-amber-700">
            <p className="font-medium">
              {failedCount} {failedCount === 1 ? 'photo' : 'photos'} failed:
            </p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {errors.slice(0, 4).map((e, i) => (
                <li key={i}>
                  <span className="font-medium">{e.name}</span> — {e.error}
                </li>
              ))}
              {errors.length > 4 && (
                <li className="opacity-70">…and {errors.length - 4} more</li>
              )}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onUploadMore}
          className="bg-brand-teal-500 hover:bg-brand-teal-600 inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-white transition-colors"
        >
          <Camera size={16} strokeWidth={1.75} />
          Upload more
        </button>
        <Link
          href="/field"
          className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-semibold text-gray-700">
      {children}
    </label>
  );
}
