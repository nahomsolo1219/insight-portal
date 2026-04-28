'use client';

import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { Check } from 'lucide-react';
import { useState } from 'react';
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
 * Status dropdown anchored via `@floating-ui/react`.
 *
 * `autoUpdate` keeps the menu pinned to the trigger across scroll, resize, and
 * DOM shifts; `flip` swaps to `top-*` when the viewport edge is close; `shift`
 * clamps the menu horizontally so it never runs off-screen. The menu renders
 * through `FloatingPortal` so it escapes `overflow: hidden` ancestors.
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

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (next) => {
      if (disabled && next) return;
      setOpen(next);
    },
    placement: align === 'right' ? 'bottom-end' : 'bottom-start',
    middleware: [
      offset(4),
      flip({ fallbackPlacements: ['top-start', 'top-end'] }),
      shift({ padding: 8 }),
    ],
    whileElementsMounted: autoUpdate,
  });
  const { setReference, setFloating } = refs;

  const click = useClick(context, { enabled: !disabled });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'menu' });
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    click,
    dismiss,
    role,
  ]);

  function handleSelect(next: string) {
    setOpen(false);
    onSelect(next);
  }

  return (
    <>
      <button
        ref={setReference}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        className={className}
        {...getReferenceProps()}
      >
        {trigger}
      </button>

      {open && (
        <FloatingPortal>
          <div
            ref={setFloating}
            style={floatingStyles}
            className="shadow-modal z-[100] min-w-[160px] overflow-hidden rounded-xl border border-line-2 bg-paper py-1"
            {...getFloatingProps()}
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
                  {...getItemProps()}
                >
                  <span className={cn('inline-flex items-center gap-2', opt.color ?? 'text-gray-700')}>
                    {opt.badge ?? null}
                    {opt.label}
                  </span>
                  {isCurrent && <Check size={14} strokeWidth={2} className="text-brand-teal-500" />}
                </button>
              );
            })}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
