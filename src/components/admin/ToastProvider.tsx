'use client';

import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastRecord {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Emits a toast from any descendant of `<ToastProvider>`. Preferred shape:
 *
 *   const { showToast } = useToast();
 *   showToast('Client created');                  // success (default)
 *   showToast('Failed to delete', 'error');       // error
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within <ToastProvider>');
  }
  return ctx;
}

const TONE_STYLES: Record<
  ToastTone,
  { bg: string; icon: typeof CheckCircle2; iconColor: string }
> = {
  success: { bg: 'border-emerald-200', icon: CheckCircle2, iconColor: 'text-emerald-600' },
  error: { bg: 'border-rose-200', icon: AlertCircle, iconColor: 'text-rose-600' },
  info: { bg: 'border-sky-200', icon: Info, iconColor: 'text-sky-600' },
};

/**
 * Thin global toast manager. Toasts stack bottom-right; each auto-dismisses
 * after 4 seconds, or on click of its ×. Deliberately tiny API — we don't
 * need action buttons or custom durations for this product.
 *
 * Styling mirrors the existing `<Toast>` primitive (white card with a
 * tinted border + tone icon). Portal-less by design — a fixed-position
 * container inside the layout tree is enough to escape card overflows.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Stable context — only `showToast` identity matters to callers, and
  // it's already memoised above.
  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="fixed right-6 bottom-6 z-[200] flex flex-col gap-2"
      >
        {toasts.map((t) => {
          const Icon = TONE_STYLES[t.tone].icon;
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                'shadow-elevated flex max-w-sm items-start gap-3 rounded-xl border bg-white px-4 py-3',
                TONE_STYLES[t.tone].bg,
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 h-5 w-5 flex-shrink-0',
                  TONE_STYLES[t.tone].iconColor,
                )}
              />
              <p className="flex-1 text-sm text-[#444]">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="hover:text-brand-teal-500 -mr-1 p-1 text-[#737373]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
