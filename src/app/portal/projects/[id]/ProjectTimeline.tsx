'use client';

import {
  AlertCircle,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hammer,
  Home,
  Mail,
  MapPin,
  Phone,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { useToast } from '@/components/admin/ToastProvider';
import { cn, formatDate, formatTime, initialsFrom } from '@/lib/utils';
import { respondToDecision } from './actions';
import type {
  PortalDecisionOption,
  TimelineMilestone,
  TimelinePayload,
  TimelinePhoto,
} from './queries';

interface Props {
  payload: TimelinePayload;
}

/**
 * Premium vertical project timeline. The whole page is one client component
 * so the photo lightbox + decision response state stays cohesive — there's
 * no advantage to splitting it server/client because every interactive
 * piece needs `'use client'` anyway.
 *
 * Layout strategy:
 * - Mobile (default): full-bleed hero, single-column phase cards, photos
 *   in a horizontal snap-carousel.
 * - md+: contained hero with rounded corners, photos as a 3-up grid.
 * - The portal's max-width is 900px so "desktop" is really "tablet"; we
 *   skip a separate breakpoint for ≥1280px because the layout doesn't
 *   need more space.
 */
export function ProjectTimeline({ payload }: Props) {
  const { project, property, pmName, pmEmail, pmPhone, milestones, nextAppointment } = payload;

  // Aggregate every photo on the project for the lightbox carousel — the
  // user expects swipe to walk across all photos, not just the ones in
  // the current phase. Order: phase order first, then unattached.
  const allPhotos = useMemo(() => {
    const list: TimelinePhoto[] = [];
    for (const m of milestones) list.push(...m.photos);
    list.push(...payload.unattachedPhotos);
    return list;
  }, [milestones, payload.unattachedPhotos]);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const openLightbox = useCallback(
    (photoId: string) => {
      const idx = allPhotos.findIndex((p) => p.id === photoId);
      if (idx >= 0) setLightboxIndex(idx);
    },
    [allPhotos],
  );

  return (
    <div className="space-y-8">
      <Hero
        type={project.type}
        name={project.name}
        property={property}
        progress={project.progress}
        endDate={project.endDate}
        pmName={pmName}
        totalMilestones={payload.stats.totalMilestones}
      />

      <Timeline milestones={milestones} onPhotoClick={openLightbox} />

      {nextAppointment && (
        <NextVisitCard
          appointment={nextAppointment}
          propertyName={property?.name ?? null}
        />
      )}

      <PMCard name={pmName} email={pmEmail} phone={pmPhone} />

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={allPhotos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndex={setLightboxIndex}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero({
  type,
  name,
  property,
  progress,
  endDate,
  pmName,
  totalMilestones,
}: {
  type: 'maintenance' | 'remodel';
  name: string;
  property: TimelinePayload['property'];
  progress: number;
  endDate: string | null;
  pmName: string | null;
  totalMilestones: number;
}) {
  const Icon = type === 'remodel' ? Hammer : Home;
  return (
    <header
      className={cn(
        // -mx-6 escapes the layout's 24px padding so mobile gets a full-
        // bleed hero. md: pulls it back inside the column with rounded
        // corners so it reads as a card on tablet/desktop.
        '-mx-6 md:mx-0',
        'bg-gradient-to-br from-brand-teal-500 to-brand-teal-600 px-6 py-8 text-white md:rounded-2xl md:px-8 md:py-10',
      )}
    >
      <div className="text-[10px] font-semibold tracking-[0.18em] text-white/60 uppercase">
        {property?.name ?? 'Your home'}
      </div>
      <div className="mt-2 flex items-start gap-3">
        <Icon size={20} strokeWidth={1.5} className="mt-1 hidden text-white/80 md:block" />
        <h1 className="font-display text-2xl tracking-tight md:text-3xl">{name}</h1>
      </div>
      {pmName && (
        <p className="mt-1 text-sm text-white/70">Managed by {pmName}</p>
      )}

      <div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-3">
        <Stat value={`${progress}%`} label="Progress" emphasis />
        <Stat value={String(totalMilestones)} label={totalMilestones === 1 ? 'Milestone' : 'Milestones'} />
        <Stat value={endDate ? shortDate(endDate) : 'TBD'} label="Est. completion" />
      </div>

      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/15">
        <div
          className="bg-brand-gold-400 h-full rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </header>
  );
}

function Stat({ value, label, emphasis }: { value: string; label: string; emphasis?: boolean }) {
  return (
    <div>
      <div
        className={cn(
          'text-2xl font-light tracking-tight md:text-3xl',
          emphasis ? 'text-brand-gold-300' : 'text-white',
        )}
      >
        {value}
      </div>
      <div className="text-[10px] font-medium tracking-wider text-white/60 uppercase">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function Timeline({
  milestones,
  onPhotoClick,
}: {
  milestones: TimelineMilestone[];
  onPhotoClick: (id: string) => void;
}) {
  if (milestones.length === 0) {
    return (
      <div className="shadow-card rounded-2xl bg-white p-8 text-center text-sm text-gray-500">
        No milestones have been added yet. Your project manager will lay out the plan
        soon.
      </div>
    );
  }
  return (
    <section>
      <SectionLabel>Project timeline</SectionLabel>
      <div className="relative pl-7 md:pl-8">
        {/* Vertical guideline running the full height of the timeline. We
            draw it once on the parent so individual cards don't have to
            stitch their own borders. */}
        <div className="bg-brand-teal-100 absolute top-2 bottom-2 left-2.5 w-px md:left-3" />
        <div className="space-y-4">
          {milestones.map((m, i) => (
            <PhaseCard
              key={m.id}
              milestone={m}
              number={i + 1}
              onPhotoClick={onPhotoClick}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Phase card — handles every status branch in one component
// ---------------------------------------------------------------------------

function PhaseCard({
  milestone,
  number,
  onPhotoClick,
}: {
  milestone: TimelineMilestone;
  number: number;
  onPhotoClick: (id: string) => void;
}) {
  const isDecision = milestone.status === 'awaiting_client';
  const hasResponse = Boolean(milestone.clientResponse);
  const isComplete = milestone.status === 'complete';
  const isInProgress = milestone.status === 'in_progress';
  const isUpcoming = milestone.status === 'upcoming' || milestone.status === 'pending';

  return (
    <div className="relative">
      <PhaseDot
        status={
          isDecision
            ? hasResponse
              ? 'responded'
              : 'decision'
            : isComplete
              ? 'complete'
              : isInProgress
                ? 'in_progress'
                : 'upcoming'
        }
      />

      <div
        className={cn(
          'shadow-card rounded-2xl bg-white p-5',
          isUpcoming && 'opacity-70',
          isDecision && !hasResponse && 'border-brand-gold-300 border',
          isDecision && hasResponse && 'border border-emerald-200',
        )}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-[10px] font-semibold tracking-wider text-gray-400 uppercase">
            {isDecision ? 'Decision' : `Phase ${number}`}
            {milestone.dueDate && (
              <span className="ml-2 text-gray-400">· Due {shortDate(milestone.dueDate)}</span>
            )}
          </div>
          <StatusBadge
            status={
              isDecision
                ? hasResponse
                  ? 'responded'
                  : 'decision'
                : isComplete
                  ? 'complete'
                  : isInProgress
                    ? 'in_progress'
                    : 'upcoming'
            }
          />
        </div>
        <h3 className="mt-1 text-base font-semibold text-gray-900 md:text-lg">
          {isDecision ? milestone.questionBody || milestone.title : milestone.title}
        </h3>
        {milestone.notes && (
          <p className="mt-1 text-sm text-gray-600">{milestone.notes}</p>
        )}
        {milestone.vendorName && !isDecision && (
          <p className="mt-1 text-xs text-gray-500">By {milestone.vendorName}</p>
        )}

        {isDecision && !hasResponse && (
          <DecisionResponder milestone={milestone} />
        )}

        {isDecision && hasResponse && milestone.clientResponse && (
          <RespondedSummary
            response={milestone.clientResponse}
            respondedAt={milestone.respondedAt}
            options={milestone.options}
          />
        )}

        {milestone.photos.length > 0 && (
          <PhotoStrip photos={milestone.photos} onPhotoClick={onPhotoClick} />
        )}
      </div>
    </div>
  );
}

type PhaseStatus = 'complete' | 'in_progress' | 'upcoming' | 'decision' | 'responded';

function PhaseDot({ status }: { status: PhaseStatus }) {
  // The dot sits on the timeline guideline. Sizing chosen so the white
  // ring fully covers the underlying line.
  const base =
    'absolute -left-7 top-4 flex h-5 w-5 items-center justify-center rounded-full md:-left-8 md:h-6 md:w-6';
  if (status === 'complete') {
    return (
      <div className={cn(base, 'bg-brand-teal-500')}>
        <Check size={11} strokeWidth={3} className="text-white" />
      </div>
    );
  }
  if (status === 'in_progress') {
    return (
      <div className={cn(base, 'border-brand-gold-400 bg-brand-gold-50 border-2')}>
        <span className="bg-brand-gold-500 h-1.5 w-1.5 rounded-full" />
      </div>
    );
  }
  if (status === 'decision') {
    return (
      <div className={cn(base, 'bg-brand-gold-500 ring-2 ring-brand-gold-100')}>
        <AlertCircle size={11} strokeWidth={2.5} className="text-white" />
      </div>
    );
  }
  if (status === 'responded') {
    return (
      <div className={cn(base, 'bg-emerald-500')}>
        <Check size={11} strokeWidth={3} className="text-white" />
      </div>
    );
  }
  return (
    <div className={cn(base, 'bg-brand-warm-100 border-brand-teal-100 border-2')} />
  );
}

function StatusBadge({ status }: { status: PhaseStatus }) {
  if (status === 'complete') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
        <Check size={10} strokeWidth={2.5} />
        Complete
      </span>
    );
  }
  if (status === 'in_progress') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-gold-50 px-2 py-0.5 text-[11px] font-medium text-brand-gold-700">
        <Clock size={10} strokeWidth={2} />
        In progress
      </span>
    );
  }
  if (status === 'decision') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-gold-100 px-2 py-0.5 text-[11px] font-medium text-brand-gold-800">
        <AlertCircle size={10} strokeWidth={2.5} />
        Your input needed
      </span>
    );
  }
  if (status === 'responded') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
        <Check size={10} strokeWidth={2.5} />
        Responded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
      Upcoming
    </span>
  );
}

// ---------------------------------------------------------------------------
// Decision responder
// ---------------------------------------------------------------------------

function DecisionResponder({ milestone }: { milestone: TimelineMilestone }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);
  const [openText, setOpenText] = useState('');

  const type = milestone.questionType;

  function submit(response: string) {
    startTransition(async () => {
      const result = await respondToDecision(milestone.id, response);
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      showToast('Response sent');
      router.refresh();
    });
  }

  // Acknowledge: single button.
  if (type === 'acknowledge') {
    return (
      <button
        type="button"
        onClick={() => submit('Acknowledged')}
        disabled={isPending}
        className="bg-brand-teal-500 hover:bg-brand-teal-600 mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-6 text-sm font-medium text-white shadow-soft transition-all disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <>
            Sending
            <LoadingDots />
          </>
        ) : (
          "I've read this"
        )}
      </button>
    );
  }

  // Approval: two buttons (Approve / Request changes).
  if (type === 'approval') {
    return (
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => submit('Approved')}
          disabled={isPending}
          className="bg-brand-teal-500 hover:bg-brand-teal-600 inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium text-white shadow-soft transition-all disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? <LoadingDots /> : 'Approve'}
        </button>
        <button
          type="button"
          onClick={() => submit('Request changes')}
          disabled={isPending}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Request changes
        </button>
      </div>
    );
  }

  // Open-text: textarea + submit.
  if (type === 'open') {
    return (
      <div className="mt-4 space-y-2">
        <textarea
          value={openText}
          onChange={(e) => setOpenText(e.target.value)}
          rows={3}
          placeholder="Type your response..."
          className="focus:ring-brand-teal-200 focus:border-brand-teal-300 w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:ring-2 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => submit(openText)}
          disabled={isPending || !openText.trim()}
          className="bg-brand-teal-500 hover:bg-brand-teal-600 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium text-white shadow-soft transition-all disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? (
            <>
              Sending
              <LoadingDots />
            </>
          ) : (
            'Submit'
          )}
        </button>
      </div>
    );
  }

  // Single / multi (or fallback): tile grid. Selecting an option promotes
  // it to a "Confirm" state — guards against an accidental tap on the
  // wrong tile being a permanent answer.
  const options = milestone.options;
  if (options.length === 0) {
    return (
      <p className="mt-3 text-sm text-gray-500 italic">
        Your project manager hasn&apos;t finalised the options yet — check back soon.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div
        className={cn(
          'grid gap-3',
          // Mobile: 2 columns so thumbnails stay legible. Desktop: 3 across
          // since the portal's 900px column doesn't justify 4.
          'grid-cols-2 md:grid-cols-3',
        )}
      >
        {options.map((opt, i) => {
          const isSelected = selected === opt.label;
          return (
            <button
              key={`${opt.label}-${i}`}
              type="button"
              onClick={() => setSelected(opt.label)}
              disabled={isPending}
              className={cn(
                'group flex min-h-[44px] flex-col overflow-hidden rounded-xl border bg-white text-left transition-all',
                isSelected
                  ? 'border-brand-teal-500 ring-2 ring-brand-teal-200'
                  : 'border-gray-200 hover:border-brand-teal-300',
                isPending && 'opacity-60',
              )}
            >
              {opt.imageUrl && (
                <div className="aspect-[4/3] w-full overflow-hidden bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={opt.imageUrl}
                    alt={opt.label}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              )}
              <div className="flex-1 p-3">
                <div className="text-sm font-medium text-gray-900">
                  {opt.label || 'Option'}
                </div>
                {opt.description && (
                  <div className="mt-0.5 text-xs text-gray-500">{opt.description}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="flex flex-col gap-2 rounded-xl bg-brand-warm-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-700">
            You selected <strong className="font-semibold">{selected}</strong>. Confirm?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(null)}
              disabled={isPending}
              className="rounded-lg px-3 py-2 text-xs font-medium text-gray-500 transition-all hover:bg-white"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => submit(selected)}
              disabled={isPending}
              className="bg-brand-teal-500 hover:bg-brand-teal-600 inline-flex items-center gap-1 rounded-lg px-4 py-2 text-xs font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (
                <>
                  Sending
                  <LoadingDots />
                </>
              ) : (
                'Confirm'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RespondedSummary({
  response,
  respondedAt,
  options,
}: {
  response: string;
  respondedAt: Date | null;
  options: PortalDecisionOption[];
}) {
  // If the response matches one of the option labels, highlight that
  // option specifically — gives the client a visual confirmation of which
  // tile they picked rather than just plain text.
  const matched = options.find((o) => o.label === response);

  return (
    <div className="mt-4 space-y-2">
      <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        <Check size={14} strokeWidth={2.5} />
        <span>
          You chose <strong className="font-semibold">{response}</strong>
        </span>
      </div>
      {matched?.imageUrl && (
        <div className="border-emerald-200 bg-white inline-block overflow-hidden rounded-xl border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={matched.imageUrl}
            alt={matched.label}
            className="h-32 w-32 object-cover"
            loading="lazy"
          />
        </div>
      )}
      {respondedAt && (
        <p className="text-[11px] text-gray-400">
          Responded {formatDate(respondedAt.toISOString().slice(0, 10))}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photo strip
// ---------------------------------------------------------------------------

function PhotoStrip({
  photos,
  onPhotoClick,
}: {
  photos: TimelinePhoto[];
  onPhotoClick: (id: string) => void;
}) {
  return (
    <div className="mt-4">
      {/* Mobile: horizontal snap-carousel. Desktop: 3-up grid. The classes
          flip at md so you don't get a half-finished carousel showing on
          tablet. */}
      <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:grid md:grid-cols-3 md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden">
        {photos.map((photo) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => onPhotoClick(photo.id)}
            className="group relative aspect-[4/3] w-[200px] flex-shrink-0 snap-start overflow-hidden rounded-xl bg-gray-100 md:w-auto"
            aria-label={photo.caption ?? 'View photo'}
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
                <Camera size={20} strokeWidth={1.25} />
              </div>
            )}
            {photo.tag && (
              <span className="absolute top-1.5 left-1.5 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-gray-700 uppercase backdrop-blur-sm">
                {photo.tag}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------------------

function PhotoLightbox({
  photos,
  index,
  onClose,
  onIndex,
}: {
  photos: TimelinePhoto[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const photo = photos[index];

  const prev = useCallback(() => {
    onIndex((index - 1 + photos.length) % photos.length);
  }, [index, photos.length, onIndex]);
  const next = useCallback(() => {
    onIndex((index + 1) % photos.length);
  }, [index, photos.length, onIndex]);

  // Keyboard nav — escape closes, arrows walk. Body scroll-lock while open
  // so the page doesn't scroll behind the overlay on mobile.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, prev, next]);

  if (!photo) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      // Click on the backdrop closes; clicks inside the image / controls
      // stop propagation so they don't accidentally dismiss.
      onClick={onClose}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
        className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 text-white transition-all hover:bg-white/20"
      >
        <X size={20} strokeWidth={1.5} />
      </button>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            aria-label="Previous photo"
            className="absolute top-1/2 left-3 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-all hover:bg-white/20"
          >
            <ChevronLeft size={20} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            aria-label="Next photo"
            className="absolute top-1/2 right-3 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-all hover:bg-white/20"
          >
            <ChevronRight size={20} strokeWidth={1.5} />
          </button>
        </>
      )}

      <div className="flex flex-1 items-center justify-center p-6" onClick={(e) => e.stopPropagation()}>
        {photo.signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.signedUrl}
            alt={photo.caption ?? 'Photo'}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="text-white/40">Image unavailable</div>
        )}
      </div>

      <div className="space-y-1 p-4 pb-6 text-center text-white" onClick={(e) => e.stopPropagation()}>
        {photo.caption && <div className="text-sm font-medium">{photo.caption}</div>}
        <div className="text-xs text-white/60">
          {photo.tag && <span className="uppercase tracking-wider">{photo.tag} · </span>}
          {index + 1} of {photos.length}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar bits
// ---------------------------------------------------------------------------

function NextVisitCard({
  appointment,
  propertyName,
}: {
  appointment: NonNullable<TimelinePayload['nextAppointment']>;
  propertyName: string | null;
}) {
  const { weekday, day } = parseDateParts(appointment.date);
  return (
    <section>
      <SectionLabel>Upcoming visit</SectionLabel>
      <div className="shadow-card flex items-start gap-4 rounded-2xl bg-white p-5">
        <div className="bg-brand-teal-50 text-brand-teal-500 flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-xl text-center">
          <span className="text-[10px] font-semibold tracking-wider uppercase">{weekday}</span>
          <span className="text-xl font-light">{day}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">{appointment.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
            {appointment.startTime && (
              <span className="inline-flex items-center gap-1">
                <Clock size={11} strokeWidth={1.5} />
                {formatTime(appointment.startTime)}
                {appointment.endTime && ` – ${formatTime(appointment.endTime)}`}
              </span>
            )}
            {propertyName && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={11} strokeWidth={1.5} />
                {propertyName}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PMCard({
  name,
  email,
  phone,
}: {
  name: string | null;
  email: string | null;
  phone: string | null;
}) {
  if (!name) return null;
  return (
    <section>
      <SectionLabel muted>Your project manager</SectionLabel>
      <div className="shadow-card flex flex-col gap-3 rounded-2xl bg-white p-5 sm:flex-row sm:items-center">
        <span className="bg-brand-teal-500 inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white">
          {initialsFrom(name) || 'PM'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900">{name}</div>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
            {email && (
              <a
                href={`mailto:${email}`}
                className="hover:text-brand-teal-500 inline-flex items-center gap-1"
              >
                <Mail size={11} strokeWidth={1.5} />
                {email}
              </a>
            )}
            {phone && (
              <a
                href={`tel:${phone}`}
                className="hover:text-brand-teal-500 inline-flex items-center gap-1"
              >
                <Phone size={11} strokeWidth={1.5} />
                {phone}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SectionLabel({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <h2
      className={cn(
        'mb-3 text-[11px] font-semibold tracking-wider uppercase',
        muted ? 'text-gray-400' : 'text-gray-500',
      )}
    >
      {children}
    </h2>
  );
}

function shortDate(iso: string): string {
  const [yStr, mStr, dStr] = iso.split('-');
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10);
  const d = Number.parseInt(dStr, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function parseDateParts(iso: string): { weekday: string; day: string } {
  const [yStr, mStr, dStr] = iso.split('-');
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10);
  const d = Number.parseInt(dStr, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return { weekday: '—', day: '—' };
  }
  const localDate = new Date(y, m - 1, d);
  return {
    weekday: localDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    day: d.toString(),
  };
}

