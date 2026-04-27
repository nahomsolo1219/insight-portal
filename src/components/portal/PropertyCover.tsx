import Image from 'next/image';
import { cn } from '@/lib/utils';

export interface PropertyCoverProps {
  /** Used to deterministically pick a gradient palette when no photo exists. */
  propertyId: string;
  /** Public Supabase Storage URL, or null when no cover has been uploaded. */
  coverPhotoUrl: string | null;
  /** Drives the cache-busting query string when a cover exists. */
  uploadedAt: Date | null;
  /** Sizing / positioning from the parent — typical container has
   *  `relative` and an aspect ratio plus a fixed width/height. */
  className?: string;
  /** Image alt text. Default reads as decorative. */
  alt?: string;
  /** Pass-through to next/image. Use only for above-the-fold heroes. */
  priority?: boolean;
}

/**
 * Visual anchor for a property — either the admin-uploaded cover photo
 * (served from the public `property-covers` bucket and optimized through
 * next/image) or a deterministic gradient fallback that uses the
 * client-portal palette.
 *
 * **Server-component-compatible.** No `'use client'`, no React state,
 * no useEffect. The fallback gradient renders on the server, which keeps
 * the hero painted before any JS hydrates.
 *
 * Cache-bust note: when admin replaces a cover, the file path stays
 * `{propertyId}.{ext}` (overwrite-on-conflict), so the URL doesn't
 * change. The `?v={timestamp}` query string we tack on lets the
 * browser invalidate its cached copy on the next render.
 */
export function PropertyCover({
  propertyId,
  coverPhotoUrl,
  uploadedAt,
  className,
  alt,
  priority = false,
}: PropertyCoverProps) {
  if (coverPhotoUrl) {
    const cacheBuster = uploadedAt ? `?v=${uploadedAt.getTime()}` : '';
    return (
      <div className={cn('relative overflow-hidden', className)}>
        <Image
          src={`${coverPhotoUrl}${cacheBuster}`}
          alt={alt ?? 'Property cover'}
          fill
          // Heuristic sizes for the three Phase 2+ consumers (landing
          // cards ~390px wide, dashboard rail ~360px, project header
          // full-bleed up to ~1200px). Bias toward larger so the
          // full-bleed case stays sharp on retina; smaller uses
          // download a slightly oversized candidate, which is the
          // right trade-off for image quality at the cost of a few
          // tens of KB.
          sizes="(max-width: 768px) 100vw, 75vw"
          className="object-cover"
          priority={priority}
        />
      </div>
    );
  }

  const palette = paletteFor(propertyId);
  return (
    <div
      className={cn('relative overflow-hidden', className)}
      role="img"
      aria-label={alt ?? 'Property cover (no photo)'}
    >
      {/* Background gradient — diagonal, three stops. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(135deg, ${palette.from} 0%, ${palette.via} 55%, ${palette.to} 100%)`,
        }}
      />
      {/* Two soft abstract circles add depth without becoming
          representational. Matches the editorial/painterly spirit of
          the reference HTML without copying its specific shapes. */}
      <svg
        viewBox="0 0 400 240"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <circle cx="320" cy="60" r="80" fill={palette.shape} fillOpacity="0.18" />
        <circle cx="80" cy="200" r="60" fill={palette.shape} fillOpacity="0.12" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Palette selection
// ---------------------------------------------------------------------------

interface Palette {
  /** Top-left stop. */
  from: string;
  /** Mid stop, sets the dominant tone. */
  via: string;
  /** Bottom-right stop. */
  to: string;
  /** Tint for the abstract shape overlay. */
  shape: string;
}

/**
 * Four palettes — warm / dusk / morn / cool. Each one composes from the
 * client-portal tokens documented in DESIGN_SYSTEM.md (cream, ivory,
 * teal scale, amber scale). Four felt right: it's enough variation that
 * neighbouring property cards in a grid look distinct without making
 * any single property's "signature" feel arbitrary; fewer (2) would
 * read as alternating stripes, more (8+) would feel noisy.
 */
const PALETTES: readonly Palette[] = [
  // warm — cream into amber. The default-feel mood.
  { from: '#FAF4E5', via: '#F4E9D2', to: '#C99A3F', shape: '#B8862E' },
  // dusk — cream lifting into deep teal.
  { from: '#FBF8F1', via: '#E8F0EF', to: '#1A6863', shape: '#0E3A38' },
  // morn — ivory into amber-100, sunrise feel.
  { from: '#FBF8F1', via: '#F4E9D2', to: '#FAF4E5', shape: '#C99A3F' },
  // cool — ivory into muted teal.
  { from: '#F7F4ED', via: '#E8F0EF', to: '#14504C', shape: '#1A6863' },
];

/**
 * Cheap deterministic hash — character-sum of the propertyId modulo
 * the palette count. UUIDs distribute character codes uniformly enough
 * that the four palettes get ~25% each across a real client base.
 */
function paletteFor(propertyId: string): Palette {
  let sum = 0;
  for (let i = 0; i < propertyId.length; i++) {
    sum = (sum + propertyId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(sum) % PALETTES.length;
  return PALETTES[idx];
}
