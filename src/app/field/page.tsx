import {
  Camera,
  ChevronRight,
  Clock,
  ImageOff,
  MapPin,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { cn, formatTime } from '@/lib/utils';
import {
  getMyRecentUploads,
  getTodaysFieldSchedule,
  type FieldRecentUpload,
  type FieldScheduleRow,
} from './queries';

export default async function FieldHomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [schedule, recent] = await Promise.all([
    getTodaysFieldSchedule(user.id),
    getMyRecentUploads(user.id, 12),
  ]);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const firstName = pickFirstName(user.fullName, user.email);
  const greeting = greetingFor(new Date());

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-5">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">
          {greeting}, {firstName}
        </h1>
        <p className="text-sm text-gray-500">{today}</p>
      </header>

      <ScheduleSection schedule={schedule} />

      <Link
        href="/field/upload"
        // 56px tall — well above the 48px touch-target minimum the plan
        // calls out and tall enough that wet/gloved fingers hit it.
        className="bg-brand-warm-200 hover:bg-brand-warm-300 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-gray-700 transition-colors"
      >
        <Camera size={18} strokeWidth={1.75} />
        Upload to any property
      </Link>

      <RecentUploadsSection uploads={recent} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today's schedule
// ---------------------------------------------------------------------------

function ScheduleSection({ schedule }: { schedule: FieldScheduleRow[] }) {
  return (
    <section>
      <SectionLabel>Today&apos;s schedule</SectionLabel>
      {schedule.length === 0 ? (
        <div className="shadow-card flex items-center gap-3 rounded-2xl bg-white p-4 text-sm text-gray-500">
          <span className="bg-brand-warm-200 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-gray-400">
            <Sparkles size={16} strokeWidth={1.5} />
          </span>
          No appointments scheduled today.
        </div>
      ) : (
        <ul className="space-y-3">
          {schedule.map((appt) => (
            <li key={appt.id}>
              <ScheduleCard appt={appt} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ScheduleCard({ appt }: { appt: FieldScheduleRow }) {
  const uploadHref = buildUploadHref(appt.propertyId, appt.projectId);
  return (
    <div className="shadow-card overflow-hidden rounded-2xl bg-white">
      <div className="space-y-2 p-4">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-brand-teal-500 uppercase">
          <Clock size={12} strokeWidth={1.75} />
          {appt.startTime ? formatTime(appt.startTime) : 'Time TBD'}
          {appt.endTime && (
            <>
              <span className="text-gray-300">–</span>
              {formatTime(appt.endTime)}
            </>
          )}
        </div>
        <h3 className="text-base font-semibold text-gray-900">{appt.title}</h3>
        <div className="space-y-1 text-xs text-gray-500">
          <div className="inline-flex items-center gap-1.5">
            <MapPin size={11} strokeWidth={1.5} />
            {appt.propertyAddress}
          </div>
          <div>
            {appt.clientName} · {appt.propertyName}
            {appt.projectName && ` · ${appt.projectName}`}
          </div>
        </div>
      </div>
      {/* Upload CTA spans the bottom of the card so the tap target is
          the entire bar, not a small button inside. */}
      <Link
        href={uploadHref}
        className="bg-brand-gold-400 hover:bg-brand-gold-500 flex h-12 w-full items-center justify-center gap-2 text-sm font-semibold text-white transition-colors"
      >
        <Camera size={16} strokeWidth={1.75} />
        Upload photos
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent uploads — thumbnails + status dot
// ---------------------------------------------------------------------------

function RecentUploadsSection({ uploads }: { uploads: FieldRecentUpload[] }) {
  if (uploads.length === 0) {
    return (
      <section>
        <SectionLabel>My recent uploads</SectionLabel>
        <div className="shadow-card flex items-center gap-3 rounded-2xl bg-white p-4 text-sm text-gray-500">
          <span className="bg-brand-warm-200 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-gray-400">
            <ImageOff size={16} strokeWidth={1.5} />
          </span>
          You haven&apos;t uploaded any photos yet.
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionLabel>My recent uploads</SectionLabel>
      <ul className="shadow-card divide-y divide-gray-50 overflow-hidden rounded-2xl bg-white">
        {uploads.map((u) => (
          <li key={u.id} className="flex items-center gap-3 p-3">
            <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
              {u.signedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={u.signedUrl}
                  alt={u.caption ?? 'Upload'}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-300">
                  <ImageOff size={16} strokeWidth={1.5} />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-gray-900">
                {u.caption || 'Untitled photo'}
              </div>
              <div className="truncate text-[11px] text-gray-500">
                {u.clientName} · {u.propertyName}
              </div>
            </div>
            <StatusDot status={u.status} />
            <ChevronRight size={14} strokeWidth={1.5} className="text-gray-300" />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusDot({ status }: { status: FieldRecentUpload['status'] }) {
  // Color-only signal — colorblind-safe pairing isn't critical for
  // technicians (they're skimming for "did mine land?") but the label
  // tooltip helps anyone hovering on desktop.
  const meta =
    status === 'categorized'
      ? { dot: 'bg-emerald-500', label: 'Approved' }
      : status === 'rejected'
        ? { dot: 'bg-red-500', label: 'Rejected' }
        : { dot: 'bg-amber-400', label: 'Pending review' };
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] text-gray-500"
      title={meta.label}
    >
      <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
      {children}
    </h2>
  );
}

function pickFirstName(fullName: string | null, fallback: string): string {
  const source = (fullName || fallback || '').trim();
  if (!source) return 'there';
  const first = source.split(/\s+/)[0];
  return first ?? 'there';
}

function greetingFor(d: Date): string {
  const hour = d.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function buildUploadHref(propertyId: string, projectId: string | null): string {
  const params = new URLSearchParams({ propertyId });
  if (projectId) params.set('projectId', projectId);
  return `/field/upload?${params.toString()}`;
}
