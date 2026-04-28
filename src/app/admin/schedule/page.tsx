import { CalendarDays, List as ListIcon } from 'lucide-react';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/current-user';
import { cn } from '@/lib/utils';
import { CalendarView, type CalendarSubView } from './CalendarView';
import { ScheduleClient } from './ScheduleClient';
import { getSchedule } from './queries';

// URL state:
//   view  = 'day' | 'week' | 'calendar'    (default: 'week' = list)
//   start = YYYY-MM-DD anchor               (defaults to today)
//   end   = YYYY-MM-DD                      (list mode only)
//   cv    = 'month' | 'week' | 'day'        (calendar sub-view, default 'month')

interface PageProps {
  searchParams: Promise<{
    start?: string;
    end?: string;
    view?: string;
    cv?: string;
  }>;
}

export default async function SchedulePage({ searchParams }: PageProps) {
  await requireAdmin();
  const { start, end, view, cv } = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const isCalendar = view === 'calendar';

  if (isCalendar) {
    const subView: CalendarSubView =
      cv === 'week' ? 'week' : cv === 'day' ? 'day' : 'month';
    const anchor = start ?? today;
    const window = computeCalendarWindow(anchor, subView);
    const rows = await getSchedule(window.start, window.end);

    return (
      <ScheduleShell>
        <ViewToggle active="calendar" today={today} anchor={anchor} subView={subView} />
        <CalendarView rows={rows} subView={subView} anchor={anchor} today={today} />
      </ScheduleShell>
    );
  }

  // List mode (existing behaviour).
  const viewMode: 'day' | 'week' = view === 'day' ? 'day' : 'week';
  const startDate = start ?? today;
  const endDate = end ?? (viewMode === 'day' ? startDate : addDays(startDate, 6));

  const rows = await getSchedule(startDate, endDate);

  return (
    <ScheduleShell>
      <ViewToggle active="list" today={today} anchor={startDate} subView="month" />
      <ScheduleClient
        rows={rows}
        startDate={startDate}
        endDate={endDate}
        viewMode={viewMode}
        today={today}
      />
    </ScheduleShell>
  );
}

function ScheduleShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span aria-hidden="true" className="bg-brand-gold-500 inline-block h-px w-8" />
            <span className="text-ink-500 text-[11px] font-medium tracking-[0.18em] uppercase">
              Calendar
            </span>
          </div>
          <h1 className="text-ink-900 text-3xl font-light tracking-tight">Schedule</h1>
          <p className="mt-1 text-sm text-[#737373]">
            All appointments across clients. Click a client to drill in.
          </p>
        </div>
      </header>

      {children}
    </div>
  );
}

/** Top-level list ↔ calendar pill toggle. Sits above whichever view is
 *  active. Each option is a `<Link>` pushing new search params. */
function ViewToggle({
  active,
  today,
  anchor,
  subView,
}: {
  active: 'list' | 'calendar';
  today: string;
  anchor: string;
  subView: CalendarSubView;
}) {
  // List mode lands on `view=week` for the week range starting today.
  const listHref = `/admin/schedule?view=week&start=${today}&end=${addDays(today, 6)}`;
  // Calendar mode preserves the current anchor + sub-view if we're already
  // there, otherwise defaults to month-of-today.
  const calAnchor = active === 'calendar' ? anchor : today;
  const calSub = active === 'calendar' ? subView : 'month';
  const calHref = `/admin/schedule?view=calendar&cv=${calSub}&start=${calAnchor}`;

  return (
    <div className="bg-brand-warm-200 inline-flex gap-1 rounded-xl p-1">
      <Link
        href={listHref}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
          active === 'list'
            ? 'shadow-soft text-brand-teal-500 bg-paper'
            : 'text-ink-500 hover:text-ink-900',
        )}
      >
        <ListIcon size={12} strokeWidth={1.75} />
        List
      </Link>
      <Link
        href={calHref}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
          active === 'calendar'
            ? 'shadow-soft text-brand-teal-500 bg-paper'
            : 'text-ink-500 hover:text-ink-900',
        )}
      >
        <CalendarDays size={12} strokeWidth={1.75} />
        Calendar
      </Link>
    </div>
  );
}

/** Window of days to fetch for a given calendar sub-view + anchor. Mirrors
 *  the helper in `CalendarView.tsx` so the server fetch covers exactly
 *  the visible range. */
function computeCalendarWindow(
  anchor: string,
  subView: CalendarSubView,
): { start: string; end: string } {
  if (subView === 'day') return { start: anchor, end: anchor };
  if (subView === 'week') {
    const start = startOfWeek(anchor);
    return { start, end: addDays(start, 6) };
  }
  // Month: fetch the 6-week visible grid (Sunday-anchored).
  const monthStart = startOfMonth(anchor);
  const gridStart = startOfWeek(monthStart);
  return { start: gridStart, end: addDays(gridStart, 41) };
}

/** Add `days` calendar days to a YYYY-MM-DD string. Local-date safe — we
 * build the Date from parts to dodge the UTC-midnight trap. */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map((n) => Number.parseInt(n, 10));
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = (dt.getMonth() + 1).toString().padStart(2, '0');
  const dd = dt.getDate().toString().padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function startOfWeek(iso: string): string {
  const [y, m, d] = iso.split('-').map((n) => Number.parseInt(n, 10));
  const dt = new Date(y!, m! - 1, d!);
  return addDays(iso, -dt.getDay());
}

function startOfMonth(iso: string): string {
  const [y, m] = iso.split('-').map((n) => Number.parseInt(n, 10));
  return `${y}-${m!.toString().padStart(2, '0')}-01`;
}
