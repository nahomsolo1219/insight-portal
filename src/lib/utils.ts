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

export function initialsFrom(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}
