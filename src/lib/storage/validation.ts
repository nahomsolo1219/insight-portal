// Client + server shared file-validation rules. Safe to import from either
// side — pure TypeScript with no Supabase dependency.

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_PDF_TYPES = ['application/pdf'] as const;

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

/** What the caller expects to receive. `any` allows either PDFs or images. */
export type FileKind = 'pdf' | 'image' | 'any';

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateFile(
  file: File,
  kind: FileKind,
  maxSize: number = MAX_FILE_SIZE,
): ValidationResult {
  if (file.size === 0) {
    return { ok: false, error: `${file.name} is empty.` };
  }
  if (file.size > maxSize) {
    return {
      ok: false,
      error: `${file.name} is too large. Max size is ${formatMb(maxSize)}.`,
    };
  }

  const allowedTypes: readonly string[] =
    kind === 'pdf'
      ? ALLOWED_PDF_TYPES
      : kind === 'image'
        ? ALLOWED_IMAGE_TYPES
        : [...ALLOWED_PDF_TYPES, ...ALLOWED_IMAGE_TYPES];

  // Browsers sometimes send 'application/octet-stream' for HEIC on macOS —
  // fall back to the extension if the declared MIME is missing or unknown.
  const effectiveType = file.type || guessTypeFromExtension(file.name);

  if (!allowedTypes.includes(effectiveType)) {
    return { ok: false, error: `${file.name} is not a supported file type.` };
  }

  return { ok: true };
}

export function getExtension(filename: string): string {
  const match = filename.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : '';
}

/** Human-readable MB rounding used across validation errors. */
function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

function guessTypeFromExtension(filename: string): string {
  const ext = getExtension(filename);
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    default:
      return '';
  }
}
