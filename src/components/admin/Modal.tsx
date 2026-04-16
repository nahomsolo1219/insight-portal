'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

export type ModalSize = 'sm' | 'md' | 'lg';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: ModalSize;
  /** While true, the modal is uncloseable — no Esc, no backdrop click, close button disabled. Use during in-flight submissions. */
  locked?: boolean;
}

const sizes: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  locked = false,
}: ModalProps) {
  // Esc-to-close, ignored while locked. Registering even when !open would be
  // cheap, but keeping it conditional avoids a stray listener in the common
  // case where the modal is never opened.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, locked, onClose]);

  // Prevent background scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!locked) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          'shadow-modal flex max-h-[85vh] w-full flex-col overflow-hidden rounded-3xl bg-white',
          sizes[size],
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-8 py-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
            {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            aria-label="Close"
            className="rounded-lg p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6">{children}</div>
        {footer && (
          <div className="bg-brand-warm-50 flex items-center justify-end gap-3 border-t border-gray-100 px-8 py-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
