import {
  ArrowRight,
  Briefcase,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  Hammer,
  Home,
  ImageOff,
  MapPin,
  Receipt,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FeaturedDecisionCard } from '@/components/portal/FeaturedDecisionCard';
import { getCurrentUser } from '@/lib/auth/current-user';
import { cn, formatDate, formatTime, initialsFrom } from '@/lib/utils';
import {
  getClientActiveProjects,
  getClientDashboardStats,
  getClientRecentActivity,
  getClientRecentPhotos,
  getClientUpcomingAppointments,
  getMyClientProfile,
  type ActivityItem,
  type ClientProfile,
  type ClientProjectRow,
  type RecentPhotoRow,
  type UpcomingAppointmentRow,
} from '../../../queries';
import { selectDashboardHeroCopy } from './heroCopy';
import { getPropertyDashboardData } from './queries';

export default async function PortalDashboardPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  // Layout already gates by role + property ownership; we re-fetch the
  // user here to read `clientId` (the layout's user object isn't passed
  // down) and read the URL's `propertyId` so we can build property-scoped
  // hrefs without relying on the Link component knowing the route shape.
  const { propertyId } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== 'client' || !user.clientId) redirect('/');

  const clientId = user.clientId;
  const [profile, stats, upcoming, activeProjects, activity, recentPhotos, propertyData] =
    await Promise.all([
      getMyClientProfile(clientId),
      getClientDashboardStats(clientId),
      getClientUpcomingAppointments(clientId, 3),
      getClientActiveProjects(clientId),
      getClientRecentActivity(clientId, 8),
      getClientRecentPhotos(clientId, 6),
      getPropertyDashboardData(clientId, propertyId),
    ]);

  const firstName = pickFirstName(user.fullName, profile?.name);
  const now = new Date();
  const todayLabel = now
    .toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    .toUpperCase();
  const greeting = pickGreeting(now);
  const todayIso = now.toISOString().slice(0, 10);

  const heroCopy = selectDashboardHeroCopy({
    statusTone: propertyData.statusTone,
    statusLabel: propertyData.statusLabel,
    pendingDecisionCount: propertyData.pendingDecisionCount,
    pendingDecision: propertyData.featuredDecision
      ? { projectName: propertyData.featuredDecision.projectName }
      : null,
    mostRecentCompletedVisit: propertyData.mostRecentCompletedVisit
      ? {
          date: propertyData.mostRecentCompletedVisit.date,
          visitorFirstName: propertyData.mostRecentCompletedVisit.visitorFirstName,
        }
      : null,
    nextScheduledVisit: propertyData.nextScheduledVisit
      ? {
          date: propertyData.nextScheduledVisit.date,
          visitorFirstName: propertyData.nextScheduledVisit.visitorFirstName,
        }
      : null,
    activeProjectCount: propertyData.activeProjectCount,
    todayIso,
  });

  return (
    <div className="space-y-10">
      <EditorialHero
        firstName={firstName}
        greeting={greeting}
        dateLabel={todayLabel}
        subtitle={heroCopy.text}
      />

      {propertyData.featuredDecision && (
        <FeaturedDecisionCard
          decision={propertyData.featuredDecision}
          pendingDecisionCount={propertyData.pendingDecisionCount}
        />
      )}

      <StatCards
        propertyId={propertyId}
        activeProjects={stats.activeProjects}
        pendingDecisions={stats.pendingDecisions}
        upcomingAppointments={stats.upcomingAppointments}
        nextAppointment={upcoming[0] ?? null}
      />

      <ActiveProjectsSection propertyId={propertyId} projects={activeProjects} />

      <UpcomingVisitsSection appointments={upcoming} />

      <RecentPhotosSection propertyId={propertyId} photos={recentPhotos} />

      <RecentActivitySection propertyId={propertyId} items={activity} />

      {profile && <ProjectManagerCard profile={profile} />}
    </div>
  );
}

/** Branch on local hour: morning before noon, afternoon 12-5, evening
 *  after 5. Server timezone is the implicit reference (matches the rest
 *  of the portal — no timezone helper exists). */
function pickGreeting(now: Date): 'morning' | 'afternoon' | 'evening' {
  const h = now.getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

/** Editorial greeting hero. Replaces the older `Welcome` strip with the
 *  cream/Fraunces voice established by Phase 2A's landing page. */
function EditorialHero({
  firstName,
  greeting,
  dateLabel,
  subtitle,
}: {
  firstName: string;
  greeting: 'morning' | 'afternoon' | 'evening';
  dateLabel: string;
  subtitle: string;
}) {
  return (
    <header className="max-w-2xl">
      <p className="eyebrow">{dateLabel}</p>
      <h1 className="serif text-ink-900 mt-3 text-4xl leading-tight md:text-5xl">
        Good {greeting}, {firstName}.
      </h1>
      <p className="text-ink-500 mt-4 text-base italic leading-relaxed md:text-lg">
        {subtitle}
      </p>
    </header>
  );
}

/** Build property-scoped URLs from a propertyId. Centralised so a future
 *  rename of the route shape is one-line. */
function portalHref(propertyId: string, segment: string): string {
  return `/portal/p/${propertyId}${segment}`;
}

// ---------------------------------------------------------------------------
// Recent photos
// ---------------------------------------------------------------------------

function RecentPhotosSection({
  propertyId,
  photos,
}: {
  propertyId: string;
  photos: RecentPhotoRow[];
}) {
  if (photos.length === 0) return null;
  return (
    <section>
      <SectionHeader title="Recent photos" />
      <div className="shadow-card rounded-2xl bg-white p-4">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden md:grid-cols-6">
          {photos.map((p) => (
            <RecentPhotoTile key={p.id} propertyId={propertyId} photo={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

function RecentPhotoTile({
  propertyId,
  photo,
}: {
  propertyId: string;
  photo: RecentPhotoRow;
}) {
  // Photos with a project link land on that project's timeline (where the
  // full-screen lightbox lives); orphans fall through to the projects list
  // since we don't have a property-only landing page.
  const href = photo.projectId
    ? portalHref(propertyId, `/projects/${photo.projectId}`)
    : portalHref(propertyId, '/projects');
  return (
    <Link
      href={href}
      className="group relative block aspect-square h-24 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100 sm:h-auto sm:w-auto"
      aria-label={photo.caption ?? `Photo at ${photo.propertyName}`}
    >
      {photo.signedUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.signedUrl}
          alt={photo.caption ?? photo.tag ?? 'Project photo'}
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-gray-300">
          <ImageOff size={20} strokeWidth={1.25} />
        </div>
      )}
      {photo.tag && (
        <span className="absolute top-1.5 left-1.5 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-gray-700 uppercase backdrop-blur-sm">
          {photo.tag}
        </span>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Recent activity
// ---------------------------------------------------------------------------

function RecentActivitySection({
  propertyId,
  items,
}: {
  propertyId: string;
  items: ActivityItem[];
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <SectionHeader title="Recent activity" />
      <div className="shadow-card overflow-hidden rounded-2xl bg-white">
        {items.map((item, i) => (
          <ActivityRow
            key={i}
            propertyId={propertyId}
            item={item}
            isLast={i === items.length - 1}
          />
        ))}
      </div>
    </section>
  );
}

function ActivityRow({
  propertyId,
  item,
  isLast,
}: {
  propertyId: string;
  item: ActivityItem;
  isLast: boolean;
}) {
  const meta = ACTIVITY_META[item.type];
  return (
    <Link
      href={getActivityHref(propertyId, item)}
      className={cn(
        'group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-brand-warm-50',
        !isLast && 'border-b border-gray-50',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl',
          meta.tone,
        )}
      >
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900">{item.title}</div>
        <div className="mt-0.5 truncate text-xs text-gray-500">
          {item.subtitle && <span>{item.subtitle} · </span>}
          <span>{relativeDate(item.date)}</span>
        </div>
      </div>
      <ChevronRight
        size={16}
        strokeWidth={1.5}
        className="mt-1 flex-shrink-0 text-gray-300 transition-colors group-hover:text-gray-500"
      />
    </Link>
  );
}

function getActivityHref(propertyId: string, item: ActivityItem): string {
  switch (item.type) {
    case 'milestone':
    case 'photo':
      return item.projectId
        ? portalHref(propertyId, `/projects/${item.projectId}`)
        : portalHref(propertyId, '/projects');
    case 'report':
      return portalHref(propertyId, '/documents');
    case 'invoice':
      return portalHref(propertyId, '/invoices');
    default:
      return portalHref(propertyId, '/dashboard');
  }
}

const ACTIVITY_META: Record<
  ActivityItem['type'],
  { icon: React.ReactNode; tone: string }
> = {
  milestone: {
    icon: <CheckCircle2 size={16} strokeWidth={1.75} />,
    tone: 'bg-emerald-50 text-emerald-600',
  },
  photo: {
    icon: <Camera size={16} strokeWidth={1.75} />,
    tone: 'bg-brand-teal-50 text-brand-teal-500',
  },
  report: {
    icon: <FileText size={16} strokeWidth={1.75} />,
    tone: 'bg-blue-50 text-blue-600',
  },
  invoice: {
    icon: <Receipt size={16} strokeWidth={1.75} />,
    tone: 'bg-brand-gold-50 text-brand-gold-500',
  },
};

/** "2h ago" / "3 days ago" / "Apr 22". Switches to absolute after a week. */
function relativeDate(iso: string): string {
  const then = new Date(iso);
  const diffMs = Date.now() - then.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return formatDate(iso.slice(0, 10));
}

// ---------------------------------------------------------------------------
// Stat cards
// ---------------------------------------------------------------------------

interface StatCardsProps {
  propertyId: string;
  activeProjects: number;
  pendingDecisions: number;
  upcomingAppointments: number;
  nextAppointment: UpcomingAppointmentRow | null;
}

function StatCards({
  propertyId,
  activeProjects,
  pendingDecisions,
  upcomingAppointments,
  nextAppointment,
}: StatCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        href={portalHref(propertyId, '/projects')}
        icon={<Briefcase size={16} strokeWidth={1.5} />}
        value={activeProjects}
        label={activeProjects === 1 ? 'Active project' : 'Active projects'}
        hint={activeProjects === 0 ? 'Nothing in flight' : 'See progress'}
      />
      <StatCard
        href={portalHref(propertyId, '/projects')}
        icon={<ClipboardList size={16} strokeWidth={1.5} />}
        value={pendingDecisions}
        label={pendingDecisions === 1 ? 'Decision needs your input' : 'Decisions need your input'}
        hint={pendingDecisions === 0 ? 'All caught up' : 'Review now'}
        // Gold tint when there's something to do — drawing the eye matters
        // here because pending decisions are the only thing the client
        // *must* act on; everything else is informational.
        accent={pendingDecisions > 0 ? 'gold' : 'default'}
      />
      <StatCard
        href={upcomingAppointments > 0 ? portalHref(propertyId, '/projects') : undefined}
        icon={<Calendar size={16} strokeWidth={1.5} />}
        value={upcomingAppointments}
        label={upcomingAppointments === 1 ? 'Upcoming visit' : 'Upcoming visits'}
        hint={
          nextAppointment
            ? `Next: ${formatDate(nextAppointment.date)}`
            : 'No visits scheduled'
        }
      />
    </div>
  );
}

interface StatCardProps {
  href?: string;
  icon: React.ReactNode;
  value: number;
  label: string;
  hint: string;
  accent?: 'default' | 'gold';
}

function StatCard({ href, icon, value, label, hint, accent = 'default' }: StatCardProps) {
  const inner = (
    <div
      className={cn(
        'shadow-card group flex h-full flex-col rounded-2xl bg-white p-6 transition-all',
        href && 'hover:shadow-elevated',
        accent === 'gold' && 'ring-brand-gold-200 ring-1',
      )}
    >
      <div
        className={cn(
          'mb-4 inline-flex h-8 w-8 items-center justify-center rounded-lg',
          accent === 'gold'
            ? 'bg-brand-gold-50 text-brand-gold-500'
            : 'bg-brand-warm-200 text-brand-teal-500',
        )}
      >
        {icon}
      </div>
      <div className="text-3xl font-light tracking-tight text-gray-900">{value}</div>
      <div className="mt-1 text-sm font-medium text-gray-700">{label}</div>
      <div
        className={cn(
          'mt-3 inline-flex items-center gap-1 text-xs',
          accent === 'gold' ? 'text-brand-gold-500 font-medium' : 'text-gray-400',
        )}
      >
        {hint}
        {href && (
          <ArrowRight
            size={11}
            strokeWidth={2}
            className="-translate-x-0.5 transition-transform group-hover:translate-x-0"
          />
        )}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

// ---------------------------------------------------------------------------
// Active projects
// ---------------------------------------------------------------------------

function ActiveProjectsSection({
  propertyId,
  projects,
}: {
  propertyId: string;
  projects: ClientProjectRow[];
}) {
  return (
    <section>
      <SectionHeader title="Your projects" />
      {projects.length === 0 ? (
        <EmptyCard icon={<Sparkles size={20} strokeWidth={1.25} />}>
          No active projects. Anything we&apos;re scheduling will show up here.
        </EmptyCard>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <ProjectRow key={p.id} propertyId={propertyId} project={p} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectRow({
  propertyId,
  project,
}: {
  propertyId: string;
  project: ClientProjectRow;
}) {
  const Icon = project.type === 'remodel' ? Hammer : Briefcase;
  const subtitleParts: string[] = [project.propertyName];
  if (project.endDate) subtitleParts.push(`Est. ${formatDate(project.endDate)}`);

  return (
    <Link
      href={portalHref(propertyId, `/projects/${project.id}`)}
      className="shadow-card hover:shadow-elevated group flex items-center gap-5 rounded-2xl bg-white p-5 transition-all"
    >
      <div className="bg-brand-teal-50 text-brand-teal-500 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl">
        <Icon size={18} strokeWidth={1.5} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <h3 className="truncate text-base font-semibold text-gray-900">{project.name}</h3>
          <span className="flex-shrink-0 text-xs font-medium tabular-nums text-gray-500">
            {project.progress}%
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div
            className="bg-brand-teal-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${project.progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">{subtitleParts.join(' · ')}</p>
      </div>

      <ArrowRight
        size={14}
        strokeWidth={1.5}
        className="text-gray-400 transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Upcoming visits
// ---------------------------------------------------------------------------

function UpcomingVisitsSection({ appointments }: { appointments: UpcomingAppointmentRow[] }) {
  return (
    <section>
      <SectionHeader title="Upcoming visits" />
      {appointments.length === 0 ? (
        <EmptyCard icon={<Calendar size={20} strokeWidth={1.25} />}>
          No visits scheduled. Your project manager will add appointments as needed.
        </EmptyCard>
      ) : (
        <div className="shadow-card overflow-hidden rounded-2xl bg-white">
          {appointments.map((appt, i) => (
            <AppointmentRow key={appt.id} appointment={appt} isLast={i === appointments.length - 1} />
          ))}
        </div>
      )}
    </section>
  );
}

function AppointmentRow({
  appointment,
  isLast,
}: {
  appointment: UpcomingAppointmentRow;
  isLast: boolean;
}) {
  const { weekday, day } = dateParts(appointment.date);

  return (
    <div
      className={cn(
        'flex items-start gap-5 px-5 py-4',
        !isLast && 'border-b border-gray-50',
      )}
    >
      <div className="bg-brand-teal-50 text-brand-teal-500 flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center rounded-xl text-center">
        <span className="text-[10px] font-semibold tracking-wider uppercase">{weekday}</span>
        <span className="text-base font-light">{day}</span>
      </div>

      <div className="min-w-0 flex-1">
        <h4 className="truncate text-sm font-semibold text-gray-900">{appointment.title}</h4>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
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
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project manager
// ---------------------------------------------------------------------------

function ProjectManagerCard({ profile }: { profile: ClientProfile }) {
  if (!profile.assignedPmName) return null;
  const initials = initialsFrom(profile.assignedPmName);

  return (
    <section>
      <SectionHeader title="Your project manager" muted />
      <div className="shadow-card flex items-center gap-4 rounded-2xl bg-white p-5">
        <span className="bg-brand-teal-500 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white">
          {initials || 'PM'}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold text-gray-900">
            {profile.assignedPmName}
          </h4>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500">
            {profile.assignedPmEmail && (
              <a
                href={`mailto:${profile.assignedPmEmail}`}
                className="hover:text-brand-teal-500 transition-colors"
              >
                {profile.assignedPmEmail}
              </a>
            )}
            {profile.assignedPmPhone && (
              <a
                href={`tel:${profile.assignedPmPhone}`}
                className="hover:text-brand-teal-500 transition-colors"
              >
                {profile.assignedPmPhone}
              </a>
            )}
          </div>
          <p className="mt-1 text-[11px] text-gray-400">Available Mon–Fri, 8 AM – 5 PM</p>
        </div>
        <Home size={16} strokeWidth={1.25} className="hidden text-gray-300 sm:block" />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function SectionHeader({ title, muted = false }: { title: string; muted?: boolean }) {
  return (
    <h2
      className={cn(
        'mb-3 text-[11px] font-semibold tracking-wider uppercase',
        muted ? 'text-gray-400' : 'text-gray-500',
      )}
    >
      {title}
    </h2>
  );
}

function EmptyCard({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="shadow-card flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm text-gray-500">
      <span className="bg-brand-warm-200 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400">
        {icon}
      </span>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pick a friendly first name to greet the client. Prefers the profile's
 * `full_name` (set by David at invite time), falling back to splitting the
 * client record's name on whitespace. For "James and Sarah Anderson" this
 * lands on "James" — we'd rather have a slightly imperfect greeting than
 * write the household-formatting logic.
 */
function pickFirstName(fullName: string | null, clientName: string | undefined): string {
  const source = (fullName || clientName || '').trim();
  if (!source) return 'there';
  return source.split(/\s+/)[0] ?? 'there';
}

/**
 * Same parse-as-local-date trick used elsewhere — `new Date(iso)` reads
 * "YYYY-MM-DD" as UTC midnight, which can shift the weekday backward in
 * West Coast timezones. We split manually to keep the date row honest.
 */
function dateParts(iso: string): { weekday: string; day: string } {
  const [yStr, mStr, dStr] = iso.split('-');
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10);
  const d = Number.parseInt(dStr, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return { weekday: '—', day: '—' };
  }
  const localDate = new Date(y, m - 1, d);
  return {
    weekday: localDate
      .toLocaleDateString('en-US', { weekday: 'short' })
      .toUpperCase(),
    day: d.toString(),
  };
}
