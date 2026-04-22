import { clsx, type ClassValue } from 'clsx';

// Small helper so components can write cn('base', condition && 'x')
// without importing clsx directly everywhere. Mirrors the shadcn convention
// minus tailwind-merge (not needed yet).
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/**
 * Format a money value stored in cents (the DB format) as USD.
 * E.g. formatCurrency(462500) → "$4,625".
 */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a Postgres `time` column ("HH:MM:SS" or "HH:MM") as a 12-hour
 * time with AM/PM and no seconds. E.g. "09:00:00" → "9:00 AM".
 * Returns an empty string on malformed input so callers don't need to
 * branch on null checks.
 */
export function formatTime(hms: string | null | undefined): string {
  if (!hms) return '';
  const [hStr, mStr] = hms.split(':');
  const hours = Number.parseInt(hStr, 10);
  const minutes = Number.parseInt(mStr ?? '0', 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '';
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  const mm = minutes.toString().padStart(2, '0');
  return `${hours12}:${mm} ${period}`;
}

export function initialsFrom(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}
