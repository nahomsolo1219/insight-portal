'use client';

import { Camera, Loader2 } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { useToast } from '@/components/admin/ToastProvider';
import { cn } from '@/lib/utils';

type Size = 'sm' | 'md' | 'lg';

interface Props {
  /** Signed URL of the current avatar; falls back to initials when null. */
  currentUrl?: string | null;
  initials: string;
  size?: Size;
  onUpload: (formData: FormData) => Promise<{ success: boolean; error?: string }>;
  /** When true, the avatar renders read-only (no hover overlay, no click). */
  readOnly?: boolean;
  /** Aria label override; defaults to "Change avatar". */
  ariaLabel?: string;
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-10 w-10 text-xs',
  md: 'h-14 w-14 text-base',
  lg: 'h-20 w-20 text-xl',
};

const ICON_SIZE: Record<Size, number> = {
  sm: 12,
  md: 14,
  lg: 18,
};

/**
 * Circular avatar with click-to-upload affordance.
 *
 * - Shows the signed image when `currentUrl` is set, otherwise an
 *   initials fallback on the brand-teal background.
 * - On hover (when not read-only), a semi-transparent overlay reveals a
 *   small camera icon. Click → file picker → immediate upload.
 * - During upload, a spinner overlays the image so the user can see the
 *   in-flight state without the parent having to wire `useTransition`.
 * - Upload failures bubble through `useToast`; success is silent so the
 *   refreshed image is the user-visible signal.
 */
export function AvatarUpload({
  currentUrl,
  initials,
  size = 'md',
  onUpload,
  readOnly,
  ariaLabel,
}: Props) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  // Optimistic preview: when the user picks a file we render a local
  // object URL so the swap feels instant. Cleared once the parent
  // re-renders with the new signed URL (router.refresh after upload).
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    const formData = new FormData();
    formData.append('avatar', file);

    startTransition(async () => {
      const result = await onUpload(formData);
      if (!result.success) {
        showToast(result.error ?? 'Upload failed', 'error');
        // Roll back the preview so the user sees the previous avatar.
        URL.revokeObjectURL(localUrl);
        setPreviewUrl(null);
      } else {
        // Keep the local preview until the next paint cycle hands us the
        // server's signed URL; then GC the object URL on next render.
        setTimeout(() => {
          URL.revokeObjectURL(localUrl);
          setPreviewUrl(null);
        }, 1500);
      }
    });
  }

  const displayUrl = previewUrl ?? currentUrl ?? null;
  const sizeClass = SIZE_CLASSES[size];
  const interactive = !readOnly;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => interactive && fileInputRef.current?.click()}
        disabled={!interactive || isPending}
        aria-label={ariaLabel ?? 'Change avatar'}
        className={cn(
          'group relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full transition-all',
          sizeClass,
          interactive && 'cursor-pointer',
          !interactive && 'cursor-default',
        )}
      >
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayUrl}
            alt={initials}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="bg-brand-teal-500 flex h-full w-full items-center justify-center font-semibold text-white">
            {initials || 'U'}
          </span>
        )}

        {/* Hover overlay — only shows when interactive. The camera icon
            sits centered under a dark scrim so it reads cleanly over both
            light initials and dark photos. */}
        {interactive && (
          <span
            className={cn(
              'absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity',
              'group-hover:opacity-100',
              isPending && 'opacity-100',
            )}
          >
            {isPending ? (
              <Loader2 size={ICON_SIZE[size]} strokeWidth={2} className="animate-spin" />
            ) : (
              <Camera size={ICON_SIZE[size]} strokeWidth={1.75} />
            )}
          </span>
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}
