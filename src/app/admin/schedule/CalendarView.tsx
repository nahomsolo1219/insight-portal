'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { cn, formatTime } from '@/lib/utils';
import type { ScheduleRow } from './queries';

export type CalendarSubView = 'month' | 'week' | 'day';

interface CalendarViewProps {
  rows: ScheduleRow[];
  /** Calendar sub-view. Server-resolved from the `cv` URL param. */
  subView: CalendarSubView;
  /** Anchor date — month view picks any date in the month; week view picks
   *  any date in the week; day view is exactly that day. */
  anchor: string;
  /** Today's date in YYYY-MM-DD; used to highlight the current cell. */
  today: string;
}

const STATUS_CHIP: Record<ScheduleRow['status'], string> = {
  // "Tentative" in the user-facing label maps to schema's `scheduled` —
  // the appointment hasn't been confirmed yet.
  scheduled: 'bg-amber-100 text-amber-900',
  confirmed: 'bg-teal-100 text-teal-900',
  // Completed kept on the same emerald rail the list view uses so the two
  // views read consistently.
  completed: 'bg-emerald-100 text-emerald-900',
  cancelled: 'bg-rose-100 text-rose-900 line-through',
};

/**
 * Hand-built calendar with three sub-views (month / week / day).
 *
 *   Month: 7-col × 6-row Sunday-anchored grid. Each cell holds up to 3
 *     appointment chips; the 4th+ collapses into a "+N more" link that
 *     navigates to that day's day-view.
 *   Week: 7 day-columns, hourly 7am-7pm gutter on the left, time-positioned
 *     blocks for appointments with startTime; appointments without a time
 *     stack in an all-day band at the top.
 *   Day: single column, same hourly gutter, same block treatment.
 *
 * URL is the source of truth for `subView` and `anchor`; navigation
 * controls (prev / next / today / sub-view toggle) are all `<Link>`s
 * pushing new search params. No client-side state.
 */
export function CalendarView({ rows, subView, anchor, today }: CalendarViewProps) {
  const window = useMemo(() => calendarWindow(anchor, subView), [anchor, subView]);
  // Group rows by day for the month grid + day/week views.
  const rowsByDate = useMemo(() => groupByDate(rows), [rows]);

  return (
    <div>
      <CalendarHeader subView={subView} anchor={anchor} today={today} />
      {subView === 'month' && (
        <MonthGrid window={window} rowsByDate={rowsByDate} today={today} anchor={anchor} />
      )}
      {subView === 'week' && (
        <TimeGrid days={daysInRange(window.start, window.end)} rowsByDate={rowsByDate} today={today} />
      )}
      {subView === 'day' && (
        <TimeGrid days={[anchor]} rowsByDate={rowsByDate} today={today} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar header — prev / today / next + month label + sub-view toggle.
// ---------------------------------------------------------------------------

function CalendarHeader({
  subView,
  anchor,
  today,
}: {
  subView: CalendarSubView;
  anchor: string;
  today: string;
}) {
  const prev = stepAnchor(anchor, subView, -1);
  const next = stepAnchor(anchor, subView, 1);
  const label = headerLabel(anchor, subView);

  return (
    <div className="bg-paper shadow-soft-md mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <Link
          href={hrefFor({ subView, anchor: prev })}
          className="hover:bg-cream text-ink-500 hover:text-ink-900 rounded-lg p-2 transition-colors"
          aria-label="Previous"
        >
          <ChevronLeft size={16} strokeWidth={1.5} />
        </Link>

        <div className="text-ink-900 text-sm font-medium tabular-nums">{label}</div>

        <Link
          href={hrefFor({ subView, anchor: next })}
          className="hover:bg-cream text-ink-500 hover:text-ink-900 rounded-lg p-2 transition-colors"
          aria-label="Next"
        >
          <ChevronRight size={16} strokeWidth={1.5} />
        </Link>

        <Link
          href={hrefFor({ subView, anchor: today })}
          className="text-ink-700 hover:bg-cream ml-2 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors"
        >
          Today
        </Link>
      </div>

      <div className="bg-brand-warm-200 inline-flex gap-1 rounded-xl p-1">
        {(['month', 'week', 'day'] as const).map((mode) => {
          const isActive = mode === subView;
          return (
            <Link
              key={mode}
              href={hrefFor({ subView: mode, anchor })}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all capitalize',
                isActive
                  ? 'shadow-soft text-brand-teal-500 bg-paper'
                  : 'text-ink-500 hover:text-ink-900',
              )}
            >
              {mode}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Month grid — 7×6 Sunday-anchored cells.
// ---------------------------------------------------------------------------

function MonthGrid({
  window,
  rowsByDate,
  today,
  anchor,
}: {
  window: { start: string; end: string };
  rowsByDate: Map<string, ScheduleRow[]>;
  today: string;
  anchor: string;
}) {
  const days = daysInRange(window.start, window.end);
  const anchorMonth = monthOf(anchor);
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="bg-paper border-line shadow-soft-md overflow-hidden rounded-2xl border">
      <div className="grid grid-cols-7 border-line-2 border-b">
        {dayLabels.map((label) => (
          <div
            key={label}
            className="text-ink-500 px-3 py-2 text-[10px] font-semibold tracking-wider uppercase"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((iso) => {
          const dayRows = rowsByDate.get(iso) ?? [];
          const isToday = iso === today;
          const inMonth = monthOf(iso) === anchorMonth;
          const visible = dayRows.slice(0, 3);
          const overflow = dayRows.length - visible.length;

          return (
            <div
              key={iso}
              className={cn(
                'border-line-2 min-h-[110px] border-t border-l first:border-l-0 [&:nth-child(7n+1)]:border-l-0',
                'flex flex-col gap-1 p-1.5',
                isToday && 'bg-amber-50',
                !inMonth && 'bg-cream/40',
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-between text-xs',
                  inMonth ? 'text-ink-700' : 'text-ink-400',
                  isToday && 'text-ink-900 font-semibold',
                )}
              >
                <span className="tabular-nums">{dayOfMonth(iso)}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                {visible.map((row) => (
                  <CalendarChip key={row.id} row={row} />
                ))}
                {overflow > 0 && (
                  <Link
                    href={hrefFor({ subView: 'day', anchor: iso })}
                    className="text-ink-500 hover:bg-cream hover:text-ink-900 truncate rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors"
                  >
                    + {overflow} more
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time grid — week (7 cols) and day (1 col). Hourly rows from 7am to 7pm.
// ---------------------------------------------------------------------------

const HOUR_START = 7;
const HOUR_END = 19; // 7pm
const HOUR_ROW_PX = 56;

function TimeGrid({
  days,
  rowsByDate,
  today,
}: {
  days: string[];
  rowsByDate: Map<string, ScheduleRow[]>;
  today: string;
}) {
  const totalHours = HOUR_END - HOUR_START;

  return (
    <div className="bg-paper border-line shadow-soft-md overflow-hidden rounded-2xl border">
      {/* Header row — day labels. */}
      <div
        className="border-line-2 grid border-b"
        style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <div />
        {days.map((iso) => {
          const isToday = iso === today;
          return (
            <div
              key={iso}
              className={cn(
                'border-line-2 px-3 py-2 text-center text-xs font-medium tracking-wide border-l first:border-l-0',
                isToday ? 'text-ink-900 bg-amber-50' : 'text-ink-700',
              )}
            >
              <div className="text-[10px] font-semibold tracking-wider uppercase text-ink-500">
                {weekdayShort(iso)}
              </div>
              <div className="tabular-nums">{dayOfMonth(iso)}</div>
            </div>
          );
        })}
      </div>

      {/* Body — relative container for absolutely-positioned event blocks. */}
      <div
        className="relative grid"
        style={{
          gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))`,
          height: `${totalHours * HOUR_ROW_PX}px`,
        }}
      >
        {/* Hour gutter labels. */}
        <div className="relative">
          {Array.from({ length: totalHours }, (_, i) => HOUR_START + i).map((hour, i) => (
            <div
              key={hour}
              className="text-ink-400 absolute right-2 text-[10px] tabular-nums"
              style={{ top: `${i * HOUR_ROW_PX - 6}px` }}
            >
              {formatHour(hour)}
            </div>
          ))}
        </div>

        {/* Per-day columns. */}
        {days.map((iso) => {
          const dayRows = rowsByDate.get(iso) ?? [];
          const isToday = iso === today;
          return (
            <div
              key={iso}
              className={cn(
                'border-line-2 relative border-l',
                isToday && 'bg-amber-50/40',
              )}
            >
              {/* Hour grid lines. */}
              {Array.from({ length: totalHours }).map((_, i) => (
                <div
                  key={i}
                  className="border-line-2 absolute right-0 left-0 border-t"
                  style={{ top: `${i * HOUR_ROW_PX}px` }}
                />
              ))}
              {/* Events. */}
              {dayRows.map((row) => (
                <PositionedEvent key={row.id} row={row} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PositionedEvent({ row }: { row: ScheduleRow }) {
  const startMin = row.startTime ? minutesFromTime(row.startTime) : null;
  const endMin = row.endTime ? minutesFromTime(row.endTime) : null;

  if (startMin === null) {
    // No start time — render as a small chip pinned to the top of the
    // column. (Rare in practice; the schema allows null but admin almost
    // always sets one.) Stacked vertically by the natural sort order.
    return (
      <div className="absolute right-1 left-1 top-1">
        <CalendarChip row={row} />
      </div>
    );
  }

  const startHour = startMin / 60;
  const endHour = (endMin ?? startMin + 30) / 60;
  const top = (startHour - HOUR_START) * HOUR_ROW_PX;
  const height = Math.max(20, (endHour - startHour) * HOUR_ROW_PX - 2);

  // Clip events that fall outside the rendered window.
  if (startHour >= HOUR_END || endHour <= HOUR_START) return null;

  return (
    <Link
      href={`/admin/clients/${row.clientId}`}
      className={cn(
        'absolute right-1 left-1 overflow-hidden rounded-md px-1.5 py-1 text-[11px] font-medium leading-tight transition-opacity hover:opacity-90',
        STATUS_CHIP[row.status],
      )}
      style={{ top, height }}
      title={`${row.title} · ${row.clientName}`}
    >
      <div className="truncate">{row.title}</div>
      {row.startTime && (
        <div className="truncate opacity-75">
          {formatTime(row.startTime)}
          {row.endTime && ` – ${formatTime(row.endTime)}`}
        </div>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Shared chip — used in month cells and as the all-day fallback.
// ---------------------------------------------------------------------------

function CalendarChip({ row }: { row: ScheduleRow }) {
  return (
    <Link
      href={`/admin/clients/${row.clientId}`}
      className={cn(
        'block truncate rounded px-1.5 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-90',
        STATUS_CHIP[row.status],
      )}
      title={`${row.title} · ${row.clientName}${row.startTime ? ` · ${formatTime(row.startTime)}` : ''}`}
    >
      {row.startTime && (
        <span className="mr-1 opacity-75 tabular-nums">
          {formatTimeCompact(row.startTime)}
        </span>
      )}
      {row.title}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Helpers — date math (no library), time math, URL building.
// ---------------------------------------------------------------------------

/** YYYY-MM-DD → { y, m, d }, all 1-indexed for month. */
function partsOf(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map((n) => Number.parseInt(n, 10));
  return { y: y!, m: m!, d: d! };
}

function isoOf(y: number, m: number, d: number): string {
  const dt = new Date(y, m - 1, d);
  const yy = dt.getFullYear();
  const mm = (dt.getMonth() + 1).toString().padStart(2, '0');
  const dd = dt.getDate().toString().padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function addDaysIso(iso: string, days: number): string {
  const { y, m, d } = partsOf(iso);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return isoOf(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

/** Day-of-week for a YYYY-MM-DD, 0=Sun..6=Sat. Local-date safe. */
function dayOfWeek(iso: string): number {
  const { y, m, d } = partsOf(iso);
  return new Date(y, m - 1, d).getDay();
}

function startOfWeek(iso: string): string {
  return addDaysIso(iso, -dayOfWeek(iso));
}

function startOfMonth(iso: string): string {
  const { y, m } = partsOf(iso);
  return isoOf(y, m, 1);
}

function monthOf(iso: string): string {
  const { y, m } = partsOf(iso);
  return `${y}-${m.toString().padStart(2, '0')}`;
}

function dayOfMonth(iso: string): number {
  return partsOf(iso).d;
}

function daysInRange(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let cursor = startIso;
  while (cursor <= endIso) {
    out.push(cursor);
    cursor = addDaysIso(cursor, 1);
  }
  return out;
}

function weekdayShort(iso: string): string {
  const { y, m, d } = partsOf(iso);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
}

function calendarWindow(
  anchor: string,
  subView: CalendarSubView,
): { start: string; end: string } {
  if (subView === 'day') return { start: anchor, end: anchor };
  if (subView === 'week') {
    const start = startOfWeek(anchor);
    return { start, end: addDaysIso(start, 6) };
  }
  // Month: visible grid is the 6-week Sunday-anchored window covering the
  // anchor's month. 6 rows × 7 cols = 42 cells.
  const monthStart = startOfMonth(anchor);
  const gridStart = startOfWeek(monthStart);
  return { start: gridStart, end: addDaysIso(gridStart, 41) };
}

function stepAnchor(anchor: string, subView: CalendarSubView, direction: 1 | -1): string {
  if (subView === 'day') return addDaysIso(anchor, direction);
  if (subView === 'week') return addDaysIso(anchor, 7 * direction);
  // Month: jump to the same day-of-month in the prev/next month, clamped.
  const { y, m } = partsOf(anchor);
  const dt = new Date(y, m - 1 + direction, 1);
  return isoOf(dt.getFullYear(), dt.getMonth() + 1, 1);
}

function headerLabel(anchor: string, subView: CalendarSubView): string {
  const { y, m, d } = partsOf(anchor);
  if (subView === 'day') {
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }
  if (subView === 'week') {
    const start = startOfWeek(anchor);
    const end = addDaysIso(start, 6);
    const startLabel = formatShortMonthDay(start);
    const endLabel = formatShortMonthDay(end);
    return `${startLabel} – ${endLabel}`;
  }
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function formatShortMonthDay(iso: string): string {
  const { y, m, d } = partsOf(iso);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function minutesFromTime(hms: string): number {
  const [h, m] = hms.split(':').map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h! * 60 + m!;
}

function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

/** "9:30 AM" → "9:30". Drops period for the inline chip prefix. */
function formatTimeCompact(hms: string): string {
  const [hStr, mStr] = hms.split(':');
  const h = Number.parseInt(hStr ?? '', 10);
  const m = Number.parseInt(mStr ?? '0', 10);
  if (!Number.isFinite(h)) return '';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hh}` : `${hh}:${m.toString().padStart(2, '0')}`;
}

function groupByDate(rows: ScheduleRow[]): Map<string, ScheduleRow[]> {
  const map = new Map<string, ScheduleRow[]>();
  for (const r of rows) {
    const existing = map.get(r.date);
    if (existing) existing.push(r);
    else map.set(r.date, [r]);
  }
  return map;
}

function hrefFor({
  subView,
  anchor,
}: {
  subView: CalendarSubView;
  anchor: string;
}): string {
  return `/admin/schedule?view=calendar&cv=${subView}&start=${anchor}`;
}
