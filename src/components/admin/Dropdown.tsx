'use client';

import { Check } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface DropdownOption {
  value: string;
  label: string;
  /** Optional Tailwind class for the label text (e.g. `'text-emerald-700'`). */
  color?: string;
  /** Optional leading badge content — we use it for colored status chips. */
  badge?: React.ReactNode;
}

interface DropdownProps {
  /** The visible trigger. Click toggles the menu; the outer wrapper is the actual `<button>`. */
  trigger: React.ReactNode;
  options: DropdownOption[];
  /** Current selected value — renders a checkmark on that option. */
  value?: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  /** Anchors the menu right-edge to the trigger's right-edge. Default: left-edge. */
  align?: 'left' | 'right';
  /** Extra className on the trigger `<button>` (layout/styles). */
  className?: string;
  /** Accessible label for the trigger. */
  ariaLabel?: string;
}

/**
 * Status dropdown that escapes `overflow: hidden` containers.
 *
 * Why a portal: the menu renders through `createPortal(..., document.body)`
 * so it's never clipped by cards, tables, or scroll containers that set
 * `overflow: hidden`. Positioning uses viewport coordinates (`position: fixed`)
 * anchored to the trigger's `getBoundingClientRect()`, re-measured on scroll
 * and resize.
 *
 * The click-outside handler runs on `mousedown` but ignores clicks inside
 * *either* the trigger OR the portal — otherwise the menu would close
 * before the `onClick` on an item had a chance to fire.
 */
export function Dropdown({
  trigger,
  options,
  value,
  onSelect,
  disabled,
  align = 'left',
  className,
  ariaLabel,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; right?: number }>({
    top: 0,
    left: 0,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    if (align === 'right') {
      setPosition({
        top: rect.bottom + 4,
        left: 0,
        right: window.innerWidth - rect.right,
      });
    } else {
      setPosition({ top: rect.bottom + 4, left: rect.left });
    }
  }, [align]);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      // Ignore clicks inside either the trigger or the portal — otherwise
      // the menu would close before the item's onClick could run.
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    function handleReposition() {
      updatePosition();
    }

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleEscape);
    // `true` for scroll captures scrolls on any ancestor, which covers
    // modals, scrollable tables, and the body.
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [open, updatePosition]);

  function handleSelect(next: string) {
    setOpen(false);
    onSelect(next);
  }

  const menuStyle: React.CSSProperties =
    align === 'right'
      ? { position: 'fixed', top: position.top, right: position.right }
      : { position: 'fixed', top: position.top, left: position.left };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={className}
      >
        {trigger}
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={menuStyle}
            className="shadow-modal z-[100] min-w-[160px] overflow-hidden rounded-xl border border-gray-100 bg-white py-1"
          >
            {options.map((opt) => {
              const isCurrent = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isCurrent}
                  onClick={() => handleSelect(opt.value)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50"
                >
                  <span className={cn('inline-flex items-center gap-2', opt.color ?? 'text-gray-700')}>
                    {opt.badge ?? null}
                    {opt.label}
                  </span>
                  {isCurrent && <Check size={14} strokeWidth={2} className="text-brand-teal-500" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
