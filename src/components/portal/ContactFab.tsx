'use client';

import { Mail, MessageCircle, Phone, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn, initialsFrom } from '@/lib/utils';

interface Props {
  pmName: string | null;
  pmEmail: string | null;
  pmPhone: string | null;
}

const FALLBACK = {
  name: 'Insight Home Maintenance',
  email: 'david@insighthm.com',
  phone: '(415) 559-2967',
};

/**
 * Floating action button anchored bottom-right. Tapping expands into a
 * compact card with the assigned PM's contact details — `tel:` and
 * `mailto:` deep-link straight to the device's native dialer / mail app.
 *
 * Position: `bottom-20` clears the mobile bottom-tab bar (which sits at
 * `bottom-0` and is roughly 56px tall); `md:bottom-6` drops back to a
 * normal margin once the tab bar disappears at md+.
 *
 * Falls back to David's direct line if no PM is assigned to the client.
 */
export function ContactFab({ pmName, pmEmail, pmPhone }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside / Escape close — same primitives as the portal user menu.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const name = pmName ?? FALLBACK.name;
  const email = pmEmail ?? FALLBACK.email;
  const phone = pmPhone ?? FALLBACK.phone;
  const initials = initialsFrom(name) || 'IH';

  return (
    <div
      ref={ref}
      className="fixed right-4 bottom-20 z-40 md:right-6 md:bottom-6"
    >
      {open && (
        <div
          role="dialog"
          aria-label="Contact your team"
          className="shadow-elevated absolute right-0 bottom-16 w-72 overflow-hidden rounded-2xl border border-gray-100 bg-white"
        >
          <div className="bg-brand-teal-500 flex items-center gap-3 px-4 py-3 text-white">
            <span className="bg-brand-teal-600 inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{name}</div>
              <div className="text-[11px] text-white/70">
                {pmName ? 'Your project manager' : 'Insight HM main line'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-lg p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>

          <div className="space-y-1 p-3">
            <a
              href={`tel:${phone.replace(/[^0-9+]/g, '')}`}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50"
            >
              <span className="bg-emerald-50 text-emerald-600 inline-flex h-8 w-8 items-center justify-center rounded-lg">
                <Phone size={14} strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium tracking-wider text-gray-400 uppercase">
                  Call
                </div>
                <div className="truncate text-sm text-gray-900">{phone}</div>
              </div>
            </a>
            <a
              href={`mailto:${email}`}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50"
            >
              <span className="bg-brand-gold-50 text-brand-gold-500 inline-flex h-8 w-8 items-center justify-center rounded-lg">
                <Mail size={14} strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium tracking-wider text-gray-400 uppercase">
                  Email
                </div>
                <div className="truncate text-sm text-gray-900">{email}</div>
              </div>
            </a>
          </div>

          <p className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-[11px] text-gray-500">
            Available Mon–Fri · 8 AM – 5 PM PT
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close contact menu' : 'Contact your team'}
        aria-expanded={open}
        className={cn(
          'shadow-elevated flex h-14 w-14 items-center justify-center rounded-full text-white transition-all',
          open
            ? 'bg-brand-teal-600 rotate-90'
            : 'bg-brand-teal-500 hover:bg-brand-teal-600',
        )}
      >
        {open ? (
          <X size={22} strokeWidth={1.75} />
        ) : (
          <MessageCircle size={22} strokeWidth={1.75} />
        )}
      </button>
    </div>
  );
}
