'use client';

import {
  Briefcase,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Home,
  MapPin,
  User as UserIcon,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Dropdown } from '@/components/admin/Dropdown';
import { useToast } from '@/components/admin/ToastProvider';
import { cn, formatTime } from '@/lib/utils';
import {
  updateAppointmentStatus,
  type AppointmentStatus,
} from '../clients/[id]/appointments-actions';
import type { ScheduleRow } from './queries';

const STATUS_OPTIONS: { id: AppointmentStatus; label: string; badge: string }[] = [
  { id: 'scheduled', label: 'Scheduled', badge: 'bg-gray-100 text-gray-600' },
  { id: 'confirmed', label: 'Confirmed', badge: 'bg-blue-50 text-blue-700' },
  { id: 'completed', label: 'Completed', badge: 'bg-emerald-50 text-emerald-700' },
  { id: 'cancelled', label: 'Cancelled', badge: 'bg-red-50 text-red-700' },
];

function statusMeta(status: string) {
  return STATUS_OPTIONS.find((s) => s.id === status) ?? STATUS_OPTIONS[0];
}

interface ScheduleClientProps {
  rows: ScheduleRow[];
  startDate: string;
  endDate: string;
  viewMode: 'day' | 'week';
  today: string;
}

export function ScheduleClient({ rows, startDate, endDate, viewMode, today }: ScheduleClientProps) {
  const [davidOnly, setDavidOnly] = useState(false);

  const filtered = useMemo(
    () => (davidOnly ? rows.filter((r) => r.davidOnSite) : rows),
    [rows, davidOnly],
  );

  // Group by date so each calendar day gets its own header + list.
  const byDate = useMemo(() => {
    const map = new Map<string, ScheduleRow[]>();
    for (const r of filtered) {
      const existing = map.get(r.date);
      if (existing) existing.push(r);
      else map.set(r.date, [r]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div>
      <NavBar
        startDate={startDate}
        endDate={endDate}
        viewMode={viewMode}
        today={today}
        davidOnly={davidOnly}
        onToggleDavidOnly={() => setDavidOnly((v) => !v)}
      />

      {filtered.length === 0 ? (
        <EmptyState davidOnly={davidOnly} />
      ) : (
        <div className="space-y-6">
          {byDate.map(([date, dayRows]) => (
            <section key={date}>
              <DayHeader date={date} today={today} count={dayRows.length} />
              <div className="space-y-3">
                {dayRows.map((row) => (
                  <AppointmentCard key={row.id} row={row} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- nav bar ----------

interface NavBarProps {
  startDate: string;
  endDate: string;
  viewMode: 'day' | 'week';
  today: string;
  davidOnly: boolean;
  onToggleDavidOnly: () => void;
}

function NavBar({
  startDate,
  endDate,
  viewMode,
  today,
  davidOnly,
  onToggleDavidOnly,
}: NavBarProps) {
  const step = viewMode === 'day' ? 1 : 7;
  const prevStart = addDays(startDate, -step);
  const prevEnd = viewMode === 'day' ? prevStart : addDays(prevStart, 6);
  const nextStart = addDays(startDate, step);
  const nextEnd = viewMode === 'day' ? nextStart : addDays(nextStart, 6);

  const rangeLabel =
    viewMode === 'day'
      ? formatFullDate(startDate)
      : `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`;

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-center gap-2">
        <Link
          href={urlFor(prevStart, prevEnd, viewMode)}
          className="hover:text-brand-teal-500 rounded-lg p-2 text-gray-500 transition-all hover:bg-brand-warm-50"
          aria-label="Previous range"
        >
          <ChevronLeft size={16} strokeWidth={1.5} />
        </Link>

        <div className="text-sm font-medium text-gray-900 tabular-nums">{rangeLabel}</div>

        <Link
          href={urlFor(nextStart, nextEnd, viewMode)}
          className="hover:text-brand-teal-500 rounded-lg p-2 text-gray-500 transition-all hover:bg-brand-warm-50"
          aria-label="Next range"
        >
          <ChevronRight size={16} strokeWidth={1.5} />
        </Link>

        <Link
          href={urlFor(today, viewMode === 'day' ? today : addDays(today, 6), viewMode)}
          className="ml-2 rounded-xl px-3 py-1.5 text-xs font-medium text-gray-600 transition-all hover:bg-brand-warm-50"
        >
          Today
        </Link>
      </div>

      <div className="flex items-center gap-2">
        {/* View toggle */}
        <div className="bg-brand-warm-200 inline-flex gap-1 rounded-xl p-1">
          {(['day', 'week'] as const).map((mode) => {
            const isActive = mode === viewMode;
            const modeStart = mode === 'day' ? today : startDate;
            const modeEnd = mode === 'day' ? today : addDays(modeStart, 6);
            return (
              <Link
                key={mode}
                href={urlFor(modeStart, modeEnd, mode)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all',
                  isActive
                    ? 'shadow-soft text-brand-teal-500 bg-white'
                    : 'hover:text-brand-teal-500 text-gray-500',
                )}
              >
                {mode === 'day' ? 'Day' : 'Week'}
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onToggleDavidOnly}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all',
            davidOnly
              ? 'bg-brand-teal-50 text-brand-teal-500'
              : 'hover:text-brand-teal-500 text-gray-500 hover:bg-brand-warm-50',
          )}
        >
          <Home size={12} strokeWidth={1.5} />
          David on site
        </button>
      </div>
    </div>
  );
}

// ---------- day header ----------

function DayHeader({ date, today, count }: { date: string; today: string; count: number }) {
  const isToday = date === today;
  return (
    <div className="mb-3 flex items-center gap-2">
      <h3
        className={cn(
          'text-xs font-semibold tracking-wider uppercase',
          isToday ? 'text-brand-teal-500' : 'text-gray-500',
        )}
      >
        {formatFullDate(date)}
      </h3>
      {isToday && (
        <span className="bg-brand-teal-50 text-brand-teal-500 rounded-full px-2 py-0.5 text-[11px] font-medium">
          Today
        </span>
      )}
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
        {count}
      </span>
    </div>
  );
}

// ---------- appointment card ----------

function AppointmentCard({ row }: { row: ScheduleRow }) {
  const { weekdayShort, day } = dateParts(row.date);

  return (
    <div className="shadow-card rounded-2xl bg-white p-5">
      <div className="flex items-start gap-5">
        {/* Date column */}
        <div className="bg-brand-teal-50 text-brand-teal-500 flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-xl text-center">
          <span className="text-[10px] font-semibold tracking-wider uppercase">{weekdayShort}</span>
          <span className="text-xl font-light tracking-tight">{day}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-gray-900">{row.title}</div>
              <div className="mt-1 inline-flex items-center gap-1.5 text-xs text-gray-500">
                <Clock size={12} strokeWidth={1.5} />
                <span>
                  {formatTime(row.startTime)} – {formatTime(row.endTime)}
                </span>
              </div>
            </div>
            <StatusBadgeButton
              appointmentId={row.id}
              clientId={row.clientId}
              status={row.status}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500">
            <Link
              href={`/admin/clients/${row.clientId}`}
              className="hover:text-brand-teal-500 inline-flex items-center gap-1 font-medium text-gray-700 transition-colors"
            >
              <UserIcon size={12} strokeWidth={1.5} className="text-gray-400" />
              {row.clientName}
            </Link>
            <MetaItem icon={MapPin} label={`${row.propertyName} · ${row.propertyAddress}`} />
            {row.vendorName && <MetaItem icon={Wrench} label={row.vendorName} />}
            {row.pmName && <MetaItem icon={Briefcase} label={`PM: ${row.pmName}`} />}
            {row.davidOnSite && (
              <span
                className="bg-brand-teal-50 text-brand-teal-500 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
                title="David is on site"
              >
                <Home size={12} strokeWidth={1.5} />
                David on site
              </span>
            )}
          </div>

          {row.scopeOfWork && (
            <details className="group mt-3">
              <summary className="hover:text-brand-teal-500 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-gray-500 transition-colors [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  size={12}
                  strokeWidth={2}
                  className="transition-transform group-open:rotate-90"
                />
                Details
              </summary>
              <div className="mt-2 rounded-xl border border-gray-100 bg-brand-warm-50 px-4 py-3">
                <div className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                  <ClipboardList size={12} strokeWidth={1.5} />
                  Scope of work
                </div>
                <p className="text-sm whitespace-pre-wrap text-gray-700">{row.scopeOfWork}</p>
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaItem({ icon: Icon, label }: { icon: typeof Wrench; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon size={12} strokeWidth={1.5} className="text-gray-400" />
      <span className="truncate">{label}</span>
    </span>
  );
}

// ---------- status dropdown (portal-based — escapes card clipping) ----------

function StatusBadgeButton({
  appointmentId,
  clientId,
  status,
}: {
  appointmentId: string;
  clientId: string;
  status: AppointmentStatus;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const meta = statusMeta(status);

  function choose(next: string) {
    if (next === status) return;
    startTransition(async () => {
      const result = await updateAppointmentStatus(
        appointmentId,
        clientId,
        next as AppointmentStatus,
      );
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      showToast(`Appointment marked ${next}`);
      // The action revalidates /admin/clients/{id} + /admin but NOT the
      // schedule route — router.refresh() pulls the new server render here.
      router.refresh();
    });
  }

  return (
    <Dropdown
      value={status}
      onSelect={choose}
      disabled={isPending}
      align="right"
      ariaLabel="Change appointment status"
      className={cn(
        'inline-flex flex-shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
        meta.badge,
        'hover:ring-2 hover:ring-gray-100',
        isPending && 'opacity-60',
      )}
      options={STATUS_OPTIONS.map((opt) => ({
        value: opt.id,
        label: opt.label,
        badge: (
          <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium', opt.badge)}>
            {opt.label}
          </span>
        ),
      }))}
      trigger={
        <>
          {meta.label}
          <ChevronDown size={12} strokeWidth={2} className="opacity-60" />
        </>
      }
    />
  );
}

// ---------- empty state ----------

function EmptyState({ davidOnly }: { davidOnly: boolean }) {
  return (
    <div className="shadow-card rounded-2xl bg-white p-12 text-center">
      <h3 className="text-base font-semibold text-gray-900">
        {davidOnly ? 'No David-on-site appointments' : 'Nothing on the calendar'}
      </h3>
      <p className="mt-2 text-sm text-gray-500">
        {davidOnly
          ? 'Clear the David filter or pick a different date range.'
          : 'Pick a different date range, or schedule a new appointment from a client detail page.'}
      </p>
    </div>
  );
}

// ---------- helpers ----------

function urlFor(start: string, end: string, view: 'day' | 'week'): string {
  return `/admin/schedule?start=${start}&end=${end}&view=${view}`;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map((n) => Number.parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = (dt.getMonth() + 1).toString().padStart(2, '0');
  const dd = dt.getDate().toString().padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function dateParts(iso: string): { weekdayShort: string; day: string } {
  const [y, m, d] = iso.split('-').map((n) => Number.parseInt(n, 10));
  const localDate = new Date(y, m - 1, d);
  return {
    weekdayShort: localDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    day: d.toString(),
  };
}

function formatFullDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((n) => Number.parseInt(n, 10));
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((n) => Number.parseInt(n, 10));
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
