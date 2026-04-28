'use client';

import { AlertCircle, File as FileIcon, Image as ImageIcon, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { MAX_FILE_SIZE, validateFile, type FileKind } from '@/lib/storage/validation';

export interface FileUploadItem {
  file: File;
  /** Client-generated id for React keys. */
  id: string;
  /** Object URL for images — used for inline preview; revoked on unmount / remove. */
  preview?: string;
  /** Validation error message. If present, this file won't be part of onChange's payload. */
  error?: string;
}

interface FileUploadProps {
  kind: FileKind;
  multiple?: boolean;
  maxSize?: number;
  maxFiles?: number;
  /**
   * Called whenever the VALID-file list changes. Files with validation errors
   * stay visible in the list (so the user can see why they were rejected) but
   * are filtered out of this callback's payload.
   */
  onChange: (files: FileUploadItem[]) => void;
  disabled?: boolean;
  hint?: string;
}

/**
 * Drag-and-drop file picker with preview, multi-file support, and
 * client-side validation. Does NOT upload on its own — it stages files;
 * the parent form is responsible for posting them to a Server Action.
 *
 * Object URLs for image previews are revoked on item removal and on
 * component unmount to avoid memory leaks.
 */
export function FileUpload({
  kind,
  multiple = true,
  maxSize = MAX_FILE_SIZE,
  maxFiles = 20,
  onChange,
  disabled,
  hint,
}: FileUploadProps) {
  const [items, setItems] = useState<FileUploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<FileUploadItem[]>([]);

  // Mirror the latest items list into a ref so the unmount cleanup below
  // has access without closing over a stale render's array.
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Revoke any remaining preview URLs when the component unmounts. Running
  // this as a separate effect with an empty dep list keeps the teardown
  // independent of items changes (which have their own revocation paths in
  // addFiles/removeItem).
  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        if (item.preview) URL.revokeObjectURL(item.preview);
      }
    };
  }, []);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const files = Array.from(incoming);
      const newItems: FileUploadItem[] = files.map((file) => {
        const validation = validateFile(file, kind, maxSize);
        return {
          file,
          id:
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `${file.name}-${file.size}-${Math.random()}`,
          preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
          error: validation.ok ? undefined : validation.error,
        };
      });

      setItems((prev) => {
        const combined = multiple ? [...prev, ...newItems] : newItems;

        // If we're in single-file mode, revoke any previews we're displacing.
        if (!multiple) {
          for (const old of prev) {
            if (old.preview) URL.revokeObjectURL(old.preview);
          }
        }

        // Cap at maxFiles. Revoke previews for anything we drop on the floor.
        const capped = combined.slice(0, maxFiles);
        if (combined.length > maxFiles) {
          for (const overflow of combined.slice(maxFiles)) {
            if (overflow.preview) URL.revokeObjectURL(overflow.preview);
          }
        }

        onChange(capped.filter((item) => !item.error));
        return capped;
      });
    },
    [kind, maxSize, maxFiles, multiple, onChange],
  );

  const removeItem = useCallback(
    (id: string) => {
      setItems((prev) => {
        const target = prev.find((item) => item.id === id);
        if (target?.preview) URL.revokeObjectURL(target.preview);
        const next = prev.filter((item) => item.id !== id);
        onChange(next.filter((item) => !item.error));
        return next;
      });
    },
    [onChange],
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  }

  const acceptAttr =
    kind === 'pdf'
      ? 'application/pdf'
      : kind === 'image'
        ? 'image/jpeg,image/png,image/webp,image/heic,image/heif'
        : 'application/pdf,image/*';

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          'relative cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all',
          isDragging
            ? 'border-brand-teal-400 bg-brand-teal-50'
            : 'hover:border-brand-teal-300 bg-brand-warm-50 border-line',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={acceptAttr}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            // Reset the input so selecting the same file twice fires onChange.
            e.target.value = '';
          }}
        />
        <div className="text-brand-teal-500 shadow-soft mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-paper">
          <Upload size={18} strokeWidth={1.5} />
        </div>
        <p className="text-sm font-medium text-gray-700">
          {isDragging ? 'Drop files here' : 'Drag files here or click to browse'}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {kindBlurb(kind)} · up to {(maxSize / 1024 / 1024).toFixed(0)} MB
          {multiple && ` · max ${maxFiles} files`}
        </p>
        {hint && <p className="mt-2 text-xs text-gray-400">{hint}</p>}
      </div>

      {items.length > 0 && (
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <FileCard
              key={item.id}
              item={item}
              onRemove={() => removeItem(item.id)}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function kindBlurb(kind: FileKind): string {
  switch (kind) {
    case 'pdf':
      return 'PDF files';
    case 'image':
      return 'JPEG, PNG, WebP, HEIC';
    case 'any':
      return 'PDFs or images';
  }
}

interface FileCardProps {
  item: FileUploadItem;
  onRemove: () => void;
  disabled?: boolean;
}

function FileCard({ item, onRemove, disabled }: FileCardProps) {
  const isImage = item.file.type.startsWith('image/');
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border p-3',
        item.error ? 'border-red-200 bg-red-50' : 'border-line-2 bg-paper',
      )}
    >
      <div className="bg-cream flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg text-gray-400">
        {isImage && item.preview ? (
          // Object URLs are local-origin and short-lived; next/image would
          // serialise them poorly, so a plain <img> is the right primitive.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.preview} alt={item.file.name} className="h-full w-full object-cover" />
        ) : isImage ? (
          <ImageIcon size={16} strokeWidth={1.5} />
        ) : (
          <FileIcon size={16} strokeWidth={1.5} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900">{item.file.name}</div>
        <div className={cn('text-xs', item.error ? 'text-red-600' : 'text-gray-500')}>
          {item.error ? (
            <span className="inline-flex items-center gap-1">
              <AlertCircle size={12} strokeWidth={1.5} />
              {item.error}
            </span>
          ) : (
            formatBytes(item.file.size)
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${item.file.name}`}
        className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <X size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
