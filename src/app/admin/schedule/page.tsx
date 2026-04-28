import { requireAdmin } from '@/lib/auth/current-user';
import { ScheduleClient } from './ScheduleClient';
import { getSchedule } from './queries';

// URL-driven date range so the view is shareable. Defaults: today → +6 days
// (a rolling 7-day week). The toggle and prev/next buttons just push new
// search params; this page re-renders server-side each time.

interface PageProps {
  searchParams: Promise<{ start?: string; end?: string; view?: string }>;
}

export default async function SchedulePage({ searchParams }: PageProps) {
  await requireAdmin();
  const { start, end, view } = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const viewMode: 'day' | 'week' = view === 'day' ? 'day' : 'week';

  const startDate = start ?? today;
  const endDate =
    end ??
    (viewMode === 'day'
      ? startDate
      : addDays(startDate, 6));

  const rows = await getSchedule(startDate, endDate);

  return (
    <div className="space-y-6">
      <header>
        <div className="mb-3 flex items-center gap-2">
          <span aria-hidden="true" className="bg-brand-gold-500 inline-block h-px w-8" />
          <span className="text-ink-500 text-[11px] font-medium uppercase tracking-[0.18em]">
            Calendar
          </span>
        </div>
        <h1 className="serif text-ink-900 text-3xl tracking-tight">Schedule</h1>
        <p className="mt-1 text-sm text-[#737373]">
          All appointments across clients. Click a client to drill in.
        </p>
      </header>

      <ScheduleClient
        rows={rows}
        startDate={startDate}
        endDate={endDate}
        viewMode={viewMode}
        today={today}
      />
    </div>
  );
}

/** Add `days` calendar days to a YYYY-MM-DD string. Local-date safe — we
 * build the Date from parts to dodge the UTC-midnight trap. */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map((n) => Number.parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = (dt.getMonth() + 1).toString().padStart(2, '0');
  const dd = dt.getDate().toString().padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
