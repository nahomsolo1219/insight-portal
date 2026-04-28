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
  ImageOff,
  MapPin,
  MessageCircle,
  Phone,
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
  getMyClientProfile,
  type ActivityItem,
  type ClientProfile,
  type ClientProjectRow,
} from '../../../queries';
import { selectDashboardHeroCopy } from './heroCopy';
import {
  getPropertyDashboardData,
  type RecentPhotoTile,
  type VisitSummary,
} from './queries';

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
  // Five parallel reads. The property-scoped one (`propertyData`) returns
  // hero data + featured decision + visit details + recent photos in a
  // single round-trip — fewer network hops than fanning out the photo +
  // visit reads separately. The client-wide rollups still come from the
  // legacy /portal queries module.
  const [profile, stats, activeProjects, activity, propertyData] = await Promise.all([
    getMyClientProfile(clientId),
    getClientDashboardStats(clientId),
    getClientActiveProjects(clientId),
    getClientRecentActivity(clientId, 8),
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
    // Centered 1100px max — keeps the two-column body from sprawling on
    // wide displays while still giving the right rail enough breathing
    // room. Below 1100px the container flows full-width naturally.
    <div className="mx-auto w-full max-w-[1100px] space-y-6">
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
        nextScheduledVisit={propertyData.nextScheduledVisit}
      />

      {/* Two-column body: main column ~2/3, right rail ~1/3. Stacks
          single-column below lg (1024px). */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="space-y-8 lg:col-span-2">
          <ActiveProjectsSection propertyId={propertyId} projects={activeProjects} />
          <RecentActivitySection propertyId={propertyId} items={activity} />
        </div>

        <aside className="space-y-6">
          <NextVisitCard
            visit={propertyData.nextScheduledVisit}
          />
          {profile && <RailProjectManagerCard profile={profile} />}
          <RailRecentPhotosCard
            propertyId={propertyId}
            photos={propertyData.recentPhotos}
          />
        </aside>
      </div>
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

/** Editorial greeting hero. */
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
      <h1 className="text-ink-900 mt-3 text-4xl font-light tracking-tighter leading-tight md:text-5xl">
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
// Stat cards — three side-by-side. The third diverges from the count-style
// of the first two: it inlines the next visit's date into the title and
// links to the appointments page rather than showing a numeric count.
// ---------------------------------------------------------------------------

interface StatCardsProps {
  propertyId: string;
  activeProjects: number;
  pendingDecisions: number;
  nextScheduledVisit: VisitSummary | null;
}

function StatCards({
  propertyId,
  activeProjects,
  pendingDecisions,
  nextScheduledVisit,
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
      <UpcomingVisitStatCard
        href={portalHref(propertyId, '/appointments')}
        nextScheduledVisit={nextScheduledVisit}
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
        'shadow-soft-md group flex h-full flex-col rounded-2xl bg-paper p-6 transition-all',
        href && 'hover:shadow-elevated',
        accent === 'gold' && 'ring-brand-gold-200 ring-1',
      )}
    >
      <div
        className={cn(
          'mb-4 inline-flex h-8 w-8 items-center justify-center rounded-lg',
          accent === 'gold'
            ? 'bg-brand-gold-50 text-brand-gold-500'
            : 'bg-cream text-ink-700',
        )}
      >
        {icon}
      </div>
      <div className="text-ink-900 text-3xl font-light tracking-tight">{value}</div>
      <div className="text-ink-700 mt-1 text-sm font-medium">{label}</div>
      <div
        className={cn(
          'mt-3 inline-flex items-center gap-1 text-xs',
          accent === 'gold' ? 'text-brand-gold-500 font-medium' : 'text-ink-400',
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

/** "Upcoming visit · Apr 30" style card — diverges from the count-style
 *  StatCard since the data is a single date, not a number. Renders
 *  as a no-op static card when no upcoming visit is scheduled. */
function UpcomingVisitStatCard({
  href,
  nextScheduledVisit,
}: {
  href: string;
  nextScheduledVisit: VisitSummary | null;
}) {
  const dateLabel = nextScheduledVisit
    ? formatShortMonthDay(nextScheduledVisit.date)
    : null;

  const inner = (
    <div
      className={cn(
        'shadow-soft-md group flex h-full flex-col rounded-2xl bg-paper p-6 transition-all',
        nextScheduledVisit && 'hover:shadow-elevated',
      )}
    >
      <div className="bg-cream text-ink-700 mb-4 inline-flex h-8 w-8 items-center justify-center rounded-lg">
        <Calendar size={16} strokeWidth={1.5} />
      </div>
      <div className="text-ink-900 text-base font-medium tracking-tight">
        {dateLabel ? `Upcoming visit · ${dateLabel}` : 'No upcoming visit'}
      </div>
      <div className="text-ink-400 mt-3 inline-flex items-center gap-1 text-xs">
        {nextScheduledVisit ? (
          <>
            View details
            <ArrowRight
              size={11}
              strokeWidth={2}
              className="-translate-x-0.5 transition-transform group-hover:translate-x-0"
            />
          </>
        ) : (
          <span>Nothing scheduled yet</span>
        )}
      </div>
    </div>
  );

  // Only render as a link when there's something to view.
  return nextScheduledVisit ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

// ---------------------------------------------------------------------------
// Active projects — main column.
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
      className="shadow-soft-md hover:shadow-elevated group flex items-center gap-5 rounded-2xl bg-paper p-5 transition-all"
    >
      <div className="bg-brand-teal-50 text-brand-teal-500 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl">
        <Icon size={18} strokeWidth={1.5} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <h3 className="text-ink-900 truncate text-base font-semibold">{project.name}</h3>
          <span className="text-ink-500 flex-shrink-0 text-xs font-medium tabular-nums">
            {project.progress}%
          </span>
        </div>
        <div className="bg-cream mt-2 h-1.5 overflow-hidden rounded-full">
          <div
            className="bg-brand-teal-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${project.progress}%` }}
          />
        </div>
        <p className="text-ink-500 mt-2 text-xs">{subtitleParts.join(' · ')}</p>
      </div>

      <ArrowRight
        size={14}
        strokeWidth={1.5}
        className="text-ink-400 transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Recent activity — main column. Visually unchanged from the prior
// dashboard render; just lives in the new grid column.
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
      <div className="shadow-soft-md overflow-hidden rounded-2xl bg-paper">
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
        'group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-cream',
        !isLast && 'border-line-2 border-b',
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
        <div className="text-ink-900 truncate text-sm font-medium">{item.title}</div>
        <div className="text-ink-500 mt-0.5 truncate text-xs">
          {item.subtitle && <span>{item.subtitle} · </span>}
          <span>{relativeDate(item.date)}</span>
        </div>
      </div>
      <ChevronRight
        size={16}
        strokeWidth={1.5}
        className="text-ink-300 group-hover:text-ink-500 mt-1 flex-shrink-0 transition-colors"
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
// Right rail — Next visit card.
// ---------------------------------------------------------------------------

function NextVisitCard({ visit }: { visit: VisitSummary | null }) {
  return (
    <section className="shadow-soft-md rounded-2xl bg-paper p-5">
      <RailEyebrow>Next visit</RailEyebrow>
      {!visit ? (
        <p className="text-ink-500 text-sm">No upcoming visits scheduled.</p>
      ) : (
        <NextVisitBody visit={visit} />
      )}
    </section>
  );
}

function NextVisitBody({ visit }: { visit: VisitSummary }) {
  const { weekday, day } = dateParts(visit.date);
  return (
    <div className="flex items-start gap-4">
      <div className="bg-brand-teal-50 text-brand-teal-500 flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center rounded-xl text-center">
        <span className="text-[10px] font-semibold tracking-wider uppercase">{weekday}</span>
        <span className="text-base font-light">{day}</span>
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="text-ink-900 truncate text-sm font-semibold">
          {visit.title?.trim() || 'Visit'}
        </h4>
        <div className="text-ink-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          {visit.startTime && (
            <span className="inline-flex items-center gap-1">
              <Clock size={11} strokeWidth={1.5} />
              {formatTime(visit.startTime)}
              {visit.endTime && ` – ${formatTime(visit.endTime)}`}
            </span>
          )}
          {visit.visitorFirstName && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={11} strokeWidth={1.5} />
              {visit.visitorFirstName}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right rail — Project manager card with Message + Call buttons.
// ---------------------------------------------------------------------------

function RailProjectManagerCard({ profile }: { profile: ClientProfile }) {
  if (!profile.assignedPmName) return null;
  const initials = initialsFrom(profile.assignedPmName);
  const hasEmail = Boolean(profile.assignedPmEmail);
  const hasPhone = Boolean(profile.assignedPmPhone);

  return (
    <section className="shadow-soft-md rounded-2xl bg-paper p-5">
      <RailEyebrow>Your project manager</RailEyebrow>
      <div className="flex items-center gap-3">
        <span
          className="text-paper flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold"
          style={{ backgroundColor: 'var(--teal-700)' }}
        >
          {initials || 'PM'}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-ink-900 truncate text-sm font-semibold">
            {profile.assignedPmName}
          </h4>
          <p className="text-ink-500 mt-0.5 text-xs">Mon–Fri, 8 AM – 5 PM</p>
        </div>
      </div>

      {(hasEmail || hasPhone) && (
        <div className="mt-4 flex gap-2">
          {hasEmail && (
            <a
              href={`mailto:${profile.assignedPmEmail}`}
              className="text-paper hover:bg-[color:var(--teal-800)] flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--teal-900)' }}
            >
              <MessageCircle size={14} strokeWidth={1.75} />
              Message
            </a>
          )}
          {hasPhone && (
            <a
              href={`tel:${profile.assignedPmPhone}`}
              className="bg-cream border-line text-ink-900 hover:bg-ivory flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors"
            >
              <Phone size={14} strokeWidth={1.75} />
              Call
            </a>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Right rail — Recent photos card (4-up grid).
// ---------------------------------------------------------------------------

function RailRecentPhotosCard({
  propertyId,
  photos,
}: {
  propertyId: string;
  photos: RecentPhotoTile[];
}) {
  return (
    <section className="shadow-soft-md rounded-2xl bg-paper p-5">
      <RailEyebrow>Recent photos</RailEyebrow>
      {photos.length === 0 ? (
        <p className="text-ink-500 text-sm">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((p) => (
            <RailPhotoTile key={p.id} propertyId={propertyId} photo={p} />
          ))}
        </div>
      )}
    </section>
  );
}

function RailPhotoTile({
  propertyId,
  photo,
}: {
  propertyId: string;
  photo: RecentPhotoTile;
}) {
  const href = photo.projectId
    ? portalHref(propertyId, `/projects/${photo.projectId}`)
    : portalHref(propertyId, '/projects');
  return (
    <Link
      href={href}
      className="bg-cream group relative block aspect-square overflow-hidden rounded-lg"
      aria-label={photo.caption ?? 'Project photo'}
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
        <div className="text-ink-300 flex h-full w-full items-center justify-center">
          <ImageOff size={20} strokeWidth={1.25} />
        </div>
      )}
      {photo.tag && (
        <span className="bg-paper/90 text-ink-700 absolute top-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-wider uppercase backdrop-blur-sm">
          {photo.tag}
        </span>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function RailEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span
        aria-hidden="true"
        className="inline-block h-px w-6 flex-shrink-0"
        style={{ backgroundColor: 'var(--amber-500)' }}
      />
      <span className="text-ink-500 text-[11px] font-medium tracking-[0.18em] uppercase">
        {children}
      </span>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-ink-500 mb-3 text-[11px] font-semibold tracking-wider uppercase">
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
    <div className="shadow-soft-md text-ink-500 flex items-center gap-3 rounded-2xl bg-paper px-5 py-4 text-sm">
      <span className="bg-cream text-ink-400 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg">
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
  const y = Number.parseInt(yStr ?? '', 10);
  const m = Number.parseInt(mStr ?? '', 10);
  const d = Number.parseInt(dStr ?? '', 10);
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

/** "Apr 30" — used by the third stat card's inline date format. Same
 *  parse-as-local trick as `dateParts` so a YYYY-MM-DD string doesn't
 *  shift to the previous day in West Coast timezones. */
function formatShortMonthDay(iso: string): string {
  const [yStr, mStr, dStr] = iso.split('-');
  const y = Number.parseInt(yStr ?? '', 10);
  const m = Number.parseInt(mStr ?? '', 10);
  const d = Number.parseInt(dStr ?? '', 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return iso;
  }
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
