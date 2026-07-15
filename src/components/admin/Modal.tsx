'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
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

  // Portal to <body> so the overlay is never trapped by a transformed/
  // positioned ancestor's containing block. This matters on the client portal,
  // where the Edit-profile modal is rendered inside the sidebar drawer — the
  // drawer's `translate-x` transform makes `position: fixed` resolve against
  // the 256px drawer instead of the viewport, so the modal came out cramped and
  // off-centre. Modals always open from a client-side interaction (open starts
  // false), so the SSR pass returns null here and never touches `document`.
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
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
          'bg-paper border-line shadow-soft-lg flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl border',
          sizes[size],
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-line flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-8 sm:py-6">
          <div>
            <h2 className="text-ink-900 text-xl font-medium tracking-tight">{title}</h2>
            {description && <p className="text-ink-500 mt-1 text-sm">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            aria-label="Close"
            className="text-ink-500 hover:bg-cream hover:text-ink-700 rounded-lg p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">{children}</div>
        {footer && (
          <div className="bg-cream border-line flex items-center justify-end gap-3 border-t px-5 py-4 sm:px-8 sm:py-5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
