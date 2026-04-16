'use client';

import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastProps {
  open: boolean;
  tone?: ToastTone;
  message: string;
  onClose: () => void;
  durationMs?: number;
}

const toneStyles: Record<
  ToastTone,
  { bg: string; icon: React.ComponentType<{ className?: string }> }
> = {
  success: { bg: 'border-emerald-200', icon: CheckCircle2 },
  error: { bg: 'border-rose-200', icon: AlertCircle },
  info: { bg: 'border-sky-200', icon: CheckCircle2 },
};

const iconColor: Record<ToastTone, string> = {
  success: 'text-emerald-600',
  error: 'text-rose-600',
  info: 'text-sky-600',
};

export function Toast({ open, tone = 'success', message, onClose, durationMs = 3000 }: ToastProps) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onClose, durationMs);
    return () => clearTimeout(t);
  }, [open, durationMs, onClose]);

  if (!open) return null;

  const Icon = toneStyles[tone].icon;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'shadow-elevated fixed right-6 bottom-6 z-50 flex max-w-sm items-start gap-3 rounded-xl border bg-white px-4 py-3',
        toneStyles[tone].bg,
      )}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 flex-shrink-0', iconColor[tone])} />
      <p className="flex-1 text-sm text-[#444]">{message}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="hover:text-brand-teal-500 -mr-1 p-1 text-[#737373]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
