'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

interface MiniCalendarProps {
  /** ISO `YYYY-MM-DD` strings. Days that match get a teal dot. */
  appointmentDates: string[];
  /** ISO date the calendar should open on. Defaults to today. */
  initialMonth?: string;
}

/**
 * Visual-only month grid. The page owns the appointment data; this just
 * draws dots and lets the user scrub between months. Tapping a day with
 * appointments scrolls the corresponding appointment card into view —
 * cards expose `data-appt-date` for the lookup, so MiniCalendar doesn't
 * need to know about IDs.
 *
 * Mon-first layout (matches David's spec mockup and is the prevailing
 * convention outside the US for week-on-a-page views).
 */
export function MiniCalendar({ appointmentDates, initialMonth }: MiniCalendarProps) {
  const today = useMemo(() => startOfDayLocal(new Date()), []);
  const [cursor, setCursor] = useState(() =>
    initialMonth ? parseLocalDate(initialMonth) : today,
  );

  const dotSet = useMemo(() => new Set(appointmentDates), [appointmentDates]);
  const monthGrid = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const monthLabel = cursor.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  function handleDayClick(day: Date) {
    const iso = isoDateLocal(day);
    if (!dotSet.has(iso)) return;
    const target = document.querySelector<HTMLElement>(`[data-appt-date="${iso}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  return (
    <div className="shadow-card rounded-2xl bg-white p-5">
      <header className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-gray-900">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <NavButton
            label="Previous month"
            onClick={() => setCursor((c) => addMonths(c, -1))}
          >
            <ChevronLeft size={14} strokeWidth={1.75} />
          </NavButton>
          <NavButton
            label="Next month"
            onClick={() => setCursor((c) => addMonths(c, 1))}
          >
            <ChevronRight size={14} strokeWidth={1.75} />
          </NavButton>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium tracking-wider text-gray-400 uppercase">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {monthGrid.map((day, i) => {
          const inMonth = day.getMonth() === cursor.getMonth();
          const iso = isoDateLocal(day);
          const hasAppt = dotSet.has(iso);
          const isToday = sameYmd(day, today);
          const interactive = hasAppt;

          return (
            <button
              key={i}
              type="button"
              onClick={() => handleDayClick(day)}
              disabled={!interactive}
              aria-label={
                hasAppt
                  ? `${day.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} — has appointment`
                  : day.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
              }
              className={cn(
                'relative flex aspect-square flex-col items-center justify-center rounded-lg text-xs transition-colors',
                interactive
                  ? 'cursor-pointer hover:bg-brand-warm-50'
                  : 'cursor-default',
                !inMonth && 'text-gray-300',
                inMonth && !isToday && 'text-gray-700',
                isToday &&
                  'bg-brand-teal-500 font-semibold text-white hover:bg-brand-teal-600',
              )}
            >
              <span>{day.getDate()}</span>
              {hasAppt && (
                <span
                  className={cn(
                    'absolute bottom-1 h-1 w-1 rounded-full',
                    isToday ? 'bg-white' : 'bg-brand-teal-500',
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="hover:bg-brand-warm-50 inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:text-gray-700"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Build a 6-row × 7-column grid (42 cells) starting on the Monday on or
 * before the 1st of the month. Always 6 rows so the calendar height is
 * stable across months — prevents the layout from shifting when scrubbing.
 */
function buildMonthGrid(monthAnchor: Date): Date[] {
  const firstOfMonth = new Date(
    monthAnchor.getFullYear(),
    monthAnchor.getMonth(),
    1,
  );
  // getDay(): 0 = Sun ... 6 = Sat. For Monday-first, shift so Mon = 0.
  const dayOfWeek = (firstOfMonth.getDay() + 6) % 7;
  const start = new Date(firstOfMonth);
  start.setDate(firstOfMonth.getDate() - dayOfWeek);

  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function startOfDayLocal(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Parse "YYYY-MM-DD" as a *local* date — `new Date(iso)` reads as UTC. */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map((s) => Number.parseInt(s, 10));
  return new Date(y, m - 1, d);
}

/** Format a Date as "YYYY-MM-DD" using local components. */
function isoDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function sameYmd(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
