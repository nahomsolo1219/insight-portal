import { Briefcase, Calendar, CheckCircle2, Clock, MapPin, Wrench } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { cn, formatTime } from '@/lib/utils';
import { AddToCalendarButton } from './AddToCalendarButton';
import { MiniCalendar } from './MiniCalendar';
import {
  getAppointmentDates,
  getClientAppointments,
  type ClientAppointmentRow,
} from './queries';

export default async function PortalAppointmentsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'client' || !user.clientId) redirect('/');

  const clientId = user.clientId;
  const [{ upcoming, past }, dates] = await Promise.all([
    getClientAppointments(clientId),
    getAppointmentDates(clientId),
  ]);

  // Open the calendar on the next visit's month so dots are immediately
  // visible. Falls back to today when nothing is on the books.
  const initialMonth = upcoming[0]?.date;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-brand-teal-500 text-3xl tracking-tight">
          Appointments
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Visits scheduled across your properties.
        </p>
      </header>

      {upcoming.length === 0 && past.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-6 md:grid-cols-[280px_1fr]">
          <div className="md:sticky md:top-24 md:self-start">
            <MiniCalendar appointmentDates={dates} initialMonth={initialMonth} />
          </div>

          <div className="space-y-8">
            <Section title="Upcoming">
              {upcoming.length === 0 ? (
                <InlineEmpty>No upcoming visits scheduled.</InlineEmpty>
              ) : (
                <div className="space-y-3">
                  {upcoming.map((a, i) => (
                    <AppointmentCard
                      key={a.id}
                      appointment={a}
                      tone="upcoming"
                      // Anchor the first card of each date so MiniCalendar
                      // can scroll-into-view by date string.
                      anchor={i === 0 || upcoming[i - 1].date !== a.date}
                    />
                  ))}
                </div>
              )}
            </Section>

            {past.length > 0 && (
              <Section title="Past">
                <div className="space-y-3">
                  {past.map((a, i) => (
                    <AppointmentCard
                      key={a.id}
                      appointment={a}
                      tone="past"
                      anchor={i === 0 || past[i - 1].date !== a.date}
                    />
                  ))}
                </div>
              </Section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections + cards
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

interface AppointmentCardProps {
  appointment: ClientAppointmentRow;
  tone: 'upcoming' | 'past';
  /** Adds the date anchor used by MiniCalendar's scroll-into-view. */
  anchor: boolean;
}

function AppointmentCard({ appointment, tone, anchor }: AppointmentCardProps) {
  const { weekday, monthShort, day } = dateParts(appointment.date);
  const isCompleted = appointment.status === 'completed';
  const muted = tone === 'past';

  return (
    <article
      data-appt-date={anchor ? appointment.date : undefined}
      className={cn(
        'shadow-card rounded-2xl bg-white p-5 transition-opacity',
        muted && 'opacity-80',
      )}
    >
      <div className="flex items-start gap-5">
        <div
          className={cn(
            'flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-xl text-center',
            muted ? 'bg-gray-50 text-gray-500' : 'bg-brand-teal-50 text-brand-teal-500',
          )}
        >
          <span className="text-[10px] font-semibold tracking-wider uppercase">{weekday}</span>
          <span className="text-lg font-light leading-tight">{day}</span>
          <span className="text-[10px] tracking-wider uppercase">{monthShort}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-900">{appointment.title}</h3>
            <StatusBadge status={appointment.status} />
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            {appointment.startTime && (
              <span className="inline-flex items-center gap-1">
                <Clock size={11} strokeWidth={1.5} />
                {formatTime(appointment.startTime)}
                {appointment.endTime && ` – ${formatTime(appointment.endTime)}`}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <MapPin size={11} strokeWidth={1.5} />
              {appointment.propertyName}
            </span>
            {appointment.projectName && (
              <span className="inline-flex items-center gap-1">
                <Briefcase size={11} strokeWidth={1.5} />
                {appointment.projectName}
              </span>
            )}
            {appointment.vendorName && (
              <span className="inline-flex items-center gap-1">
                <Wrench size={11} strokeWidth={1.5} />
                {appointment.vendorName}
              </span>
            )}
          </div>

          {appointment.scopeOfWork && (
            <p className="mt-3 text-xs whitespace-pre-wrap text-gray-600">
              {appointment.scopeOfWork}
            </p>
          )}

          {!isCompleted && appointment.status !== 'cancelled' && (
            <div className="mt-4">
              <AddToCalendarButton appointmentId={appointment.id} />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Status + empty bits
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: ClientAppointmentRow['status'] }) {
  const meta =
    status === 'completed'
      ? {
          label: 'Completed',
          tone: 'bg-emerald-50 text-emerald-700',
          icon: <CheckCircle2 size={11} strokeWidth={2} />,
        }
      : status === 'confirmed'
        ? { label: 'Confirmed', tone: 'bg-blue-50 text-blue-700', icon: null }
        : status === 'cancelled'
          ? { label: 'Cancelled', tone: 'bg-red-50 text-red-600', icon: null }
          : { label: 'Scheduled', tone: 'bg-gray-100 text-gray-600', icon: null };

  return (
    <span
      className={cn(
        'inline-flex flex-shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium',
        meta.tone,
      )}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="shadow-card rounded-2xl bg-white p-12 text-center">
      <span className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
        <Calendar size={24} strokeWidth={1.25} />
      </span>
      <h3 className="text-base font-semibold text-gray-900">No appointments yet</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        Your project manager will add visits here as they&apos;re scheduled.
      </p>
    </div>
  );
}

function InlineEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="shadow-card rounded-2xl bg-white px-5 py-4 text-sm text-gray-500">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Same parse-as-local trick used elsewhere in the portal — see queries.ts. */
function dateParts(iso: string): { weekday: string; monthShort: string; day: string } {
  const [yStr, mStr, dStr] = iso.split('-');
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10);
  const d = Number.parseInt(dStr, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return { weekday: '—', monthShort: '—', day: '—' };
  }
  const localDate = new Date(y, m - 1, d);
  return {
    weekday: localDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    monthShort: localDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: d.toString(),
  };
}
