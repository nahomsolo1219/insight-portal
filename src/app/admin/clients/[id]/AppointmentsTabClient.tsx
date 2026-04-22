'use client';

import {
  Briefcase,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  Home,
  Plus,
  Trash2,
  User as UserIcon,
  Wrench,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Field, inputClass, textareaClass } from '@/components/admin/Field';
import { Modal } from '@/components/admin/Modal';
import { cn, formatTime } from '@/lib/utils';
import {
  createAppointment,
  deleteAppointment,
  updateAppointmentStatus,
  type AppointmentStatus,
} from './appointments-actions';
import type {
  AppointmentRow,
  PmOption,
  ProjectOption,
  VendorOption,
} from './queries';

const STATUS_OPTIONS: { id: AppointmentStatus; label: string; badge: string }[] = [
  { id: 'scheduled', label: 'Scheduled', badge: 'bg-gray-100 text-gray-600' },
  { id: 'confirmed', label: 'Confirmed', badge: 'bg-blue-50 text-blue-700' },
  { id: 'completed', label: 'Completed', badge: 'bg-emerald-50 text-emerald-700' },
  { id: 'cancelled', label: 'Cancelled', badge: 'bg-red-50 text-red-700' },
];

function statusMeta(status: string) {
  return STATUS_OPTIONS.find((s) => s.id === status) ?? STATUS_OPTIONS[0];
}

interface AppointmentsTabClientProps {
  clientId: string;
  propertyId: string;
  upcoming: AppointmentRow[];
  past: AppointmentRow[];
  vendors: VendorOption[];
  projects: ProjectOption[];
  pms: PmOption[];
}

export function AppointmentsTabClient({
  clientId,
  propertyId,
  upcoming,
  past,
  vendors,
  projects,
  pms,
}: AppointmentsTabClientProps) {
  const [newOpen, setNewOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AppointmentRow | null>(null);
  const [pastExpanded, setPastExpanded] = useState(false);

  const total = upcoming.length + past.length;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {total} {total === 1 ? 'appointment' : 'appointments'}
        </div>
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all duration-150"
        >
          <Plus size={16} strokeWidth={2} />
          New appointment
        </button>
      </div>

      {total === 0 ? (
        <EmptyState onNewClick={() => setNewOpen(true)} />
      ) : (
        <div className="space-y-6">
          <section>
            <SectionHeader label="Upcoming" count={upcoming.length} />
            {upcoming.length === 0 ? (
              <div className="shadow-card rounded-2xl bg-white p-6 text-center text-sm text-gray-400">
                Nothing scheduled ahead
              </div>
            ) : (
              <div className="space-y-3">
                {upcoming.map((appt) => (
                  <AppointmentCard
                    key={appt.id}
                    appointment={appt}
                    clientId={clientId}
                    tone="upcoming"
                    onDelete={() => setDeleteTarget(appt)}
                  />
                ))}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setPastExpanded((v) => !v)}
                className="hover:text-brand-teal-500 mb-3 flex w-full items-center justify-between rounded-xl py-2 text-left transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <ChevronRight
                    size={14}
                    strokeWidth={2}
                    className={cn(
                      'text-gray-400 transition-transform',
                      pastExpanded && 'rotate-90',
                    )}
                  />
                  <span className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
                    Past
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                    {past.length}
                  </span>
                </span>
              </button>

              {pastExpanded && (
                <div className="space-y-3">
                  {past.map((appt) => (
                    <AppointmentCard
                      key={appt.id}
                      appointment={appt}
                      clientId={clientId}
                      tone="past"
                      onDelete={() => setDeleteTarget(appt)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {newOpen && (
        <NewAppointmentModal
          onClose={() => setNewOpen(false)}
          clientId={clientId}
          propertyId={propertyId}
          vendors={vendors}
          projects={projects}
          pms={pms}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          appointment={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          clientId={clientId}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h3 className="text-xs font-semibold tracking-wider text-gray-500 uppercase">{label}</h3>
      <span className="bg-brand-teal-50 text-brand-teal-500 rounded-full px-2 py-0.5 text-[11px] font-medium">
        {count}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appointment card
// ---------------------------------------------------------------------------

interface AppointmentCardProps {
  appointment: AppointmentRow;
  clientId: string;
  tone: 'upcoming' | 'past';
  onDelete: () => void;
}

function AppointmentCard({ appointment, clientId, tone, onDelete }: AppointmentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { weekdayShort, day } = dateParts(appointment.date);
  const isPast = tone === 'past';
  const hasScope = Boolean(appointment.scopeOfWork && appointment.scopeOfWork.trim());

  return (
    <div
      className={cn(
        'shadow-card overflow-hidden rounded-2xl bg-white transition-opacity',
        isPast && 'opacity-80',
      )}
    >
      <div className="flex items-start gap-5 p-5">
        {/* Date column */}
        <div
          className={cn(
            'flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-xl text-center',
            isPast
              ? 'bg-gray-50 text-gray-500'
              : 'bg-brand-teal-50 text-brand-teal-500',
          )}
        >
          <span className="text-[10px] font-semibold tracking-wider uppercase">
            {weekdayShort}
          </span>
          <span className="text-xl font-light tracking-tight">{day}</span>
        </div>

        {/* Title + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-gray-900">
                {appointment.title}
              </div>
              <div className="mt-1 inline-flex items-center gap-1.5 text-xs text-gray-500">
                <Clock size={12} strokeWidth={1.5} />
                <span>
                  {formatTime(appointment.startTime)} – {formatTime(appointment.endTime)}
                </span>
              </div>
            </div>
            <StatusBadgeButton
              appointmentId={appointment.id}
              clientId={clientId}
              status={appointment.status}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500">
            {appointment.vendorName && (
              <MetaItem icon={Wrench} label={appointment.vendorName} />
            )}
            {appointment.projectName && (
              <MetaItem icon={Briefcase} label={appointment.projectName} />
            )}
            {appointment.pmName && <MetaItem icon={UserIcon} label={`PM: ${appointment.pmName}`} />}
            {appointment.davidOnSite && (
              <span
                className="bg-brand-teal-50 text-brand-teal-500 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
                title="David is on site for this appointment"
              >
                <Home size={12} strokeWidth={1.5} />
                David on site
              </span>
            )}
          </div>

          {hasScope && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="hover:text-brand-teal-500 mt-3 inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors"
            >
              <ChevronRight
                size={12}
                strokeWidth={2}
                className={cn('transition-transform', expanded && 'rotate-90')}
              />
              {expanded ? 'Hide details' : 'Show details'}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${appointment.title}`}
          className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 size={16} strokeWidth={1.5} />
        </button>
      </div>

      {hasScope && expanded && (
        <div className="border-t border-gray-100 bg-brand-warm-50 px-5 py-4">
          <div className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
            <ClipboardList size={12} strokeWidth={1.5} />
            Scope of work
          </div>
          <p className="text-sm whitespace-pre-wrap text-gray-700">{appointment.scopeOfWork}</p>
        </div>
      )}
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

// ---------------------------------------------------------------------------
// Inline status dropdown
// ---------------------------------------------------------------------------

interface StatusBadgeButtonProps {
  appointmentId: string;
  clientId: string;
  status: AppointmentStatus;
}

function StatusBadgeButton({ appointmentId, clientId, status }: StatusBadgeButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const meta = statusMeta(status);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function choose(next: AppointmentStatus) {
    setOpen(false);
    if (next === status) return;
    startTransition(async () => {
      const result = await updateAppointmentStatus(appointmentId, clientId, next);
      if (!result.success) {
        console.error('[updateAppointmentStatus]', result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div ref={wrapperRef} className="relative inline-block flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
          meta.badge,
          'hover:ring-2 hover:ring-gray-100',
          isPending && 'opacity-60',
        )}
      >
        {meta.label}
        <ChevronDown size={12} strokeWidth={2} className="opacity-60" />
      </button>

      {open && (
        <div
          role="menu"
          className="shadow-modal absolute top-full right-0 z-10 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-gray-100 bg-white py-1"
        >
          {STATUS_OPTIONS.map((opt) => {
            const isCurrent = opt.id === status;
            return (
              <button
                key={opt.id}
                type="button"
                role="menuitemradio"
                aria-checked={isCurrent}
                onClick={() => choose(opt.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium', opt.badge)}>
                  {opt.label}
                </span>
                {isCurrent && (
                  <Check size={14} strokeWidth={2} className="text-brand-teal-500" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onNewClick }: { onNewClick: () => void }) {
  return (
    <div className="shadow-card rounded-2xl bg-white p-12 text-center">
      <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
        <Calendar size={24} strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">No appointments yet</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        No appointments scheduled for this property. Add a visit for a vendor, an inspection, or
        your own site walk.
      </p>
      <button
        type="button"
        onClick={onNewClick}
        className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all"
      >
        <Plus size={16} />
        New appointment
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New appointment modal
// ---------------------------------------------------------------------------

interface NewAppointmentModalProps {
  onClose: () => void;
  clientId: string;
  propertyId: string;
  vendors: VendorOption[];
  projects: ProjectOption[];
  pms: PmOption[];
}

function NewAppointmentModal({
  onClose,
  clientId,
  propertyId,
  vendors,
  projects,
  pms,
}: NewAppointmentModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [vendorId, setVendorId] = useState('');
  const [pmId, setPmId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [davidOnSite, setDavidOnSite] = useState(false);
  const [scopeOfWork, setScopeOfWork] = useState('');

  function submit() {
    setError(null);
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!date) {
      setError('Date is required.');
      return;
    }
    if (!startTime || !endTime) {
      setError('Start and end time are required.');
      return;
    }
    if (startTime >= endTime) {
      setError('End time must be after start time.');
      return;
    }

    startTransition(async () => {
      const result = await createAppointment(clientId, propertyId, {
        title: title.trim(),
        date,
        startTime,
        endTime,
        vendorId: vendorId || null,
        projectId: projectId || null,
        assignedPmId: pmId || null,
        davidOnSite,
        scopeOfWork: scopeOfWork.trim() || undefined,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New appointment"
      size="lg"
      locked={isPending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl px-5 py-2.5 font-medium text-gray-700 transition-all hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-5 py-2.5 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Creating...' : 'Create appointment'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Title" required>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. HVAC filter replacement"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Date" required>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Start" required>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="End" required>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Vendor" hint="Optional">
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className={inputClass}
            >
              <option value="">— None —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Assigned PM" hint="Optional">
            <select
              value={pmId}
              onChange={(e) => setPmId(e.target.value)}
              className={inputClass}
            >
              <option value="">— None —</option>
              {pms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Project"
          hint={projects.length === 0 ? 'No projects on this property' : 'Optional'}
        >
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={projects.length === 0}
            className={inputClass}
          >
            <option value="">— None —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 px-4 py-3 transition-colors hover:bg-brand-warm-50">
          <input
            type="checkbox"
            checked={davidOnSite}
            onChange={(e) => setDavidOnSite(e.target.checked)}
            className="text-brand-teal-500 focus:ring-brand-teal-200 mt-0.5 h-4 w-4 rounded border-gray-300"
          />
          <div>
            <div className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900">
              <Home size={14} strokeWidth={1.5} className="text-brand-teal-500" />
              David on site
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              Mark this if David is attending the appointment personally.
            </p>
          </div>
        </label>

        <Field label="Scope of work" hint="Optional notes visible on the appointment card.">
          <textarea
            value={scopeOfWork}
            onChange={(e) => setScopeOfWork(e.target.value)}
            rows={4}
            placeholder="What's being done, which areas, any access considerations…"
            className={textareaClass}
          />
        </Field>

        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation
// ---------------------------------------------------------------------------

interface DeleteConfirmModalProps {
  appointment: AppointmentRow;
  onClose: () => void;
  clientId: string;
}

function DeleteConfirmModal({ appointment, onClose, clientId }: DeleteConfirmModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAppointment(appointment.id, clientId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Delete appointment?"
      size="sm"
      locked={isPending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl px-5 py-2.5 font-medium text-gray-700 transition-all hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="shadow-soft rounded-xl bg-red-500 px-5 py-2.5 font-medium text-white transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Deleting...' : 'Delete'}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-gray-700">
        You&apos;re about to delete{' '}
        <strong className="font-semibold">{appointment.title}</strong>.
      </p>
      <p className="text-sm text-gray-500">
        If the visit happened but was skipped, set its status to Cancelled instead so it stays
        in the history.
      </p>
      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Break a "YYYY-MM-DD" string into its weekday abbreviation + day-of-month.
 * We parse the parts manually instead of `new Date(iso)` — the latter
 * interprets bare ISO dates as UTC midnight, which shifts the weekday
 * backwards in timezones west of UTC (a "Tue" appointment shows up as
 * "Mon" in SF).
 */
function dateParts(iso: string): { weekdayShort: string; day: string } {
  const [yStr, mStr, dStr] = iso.split('-');
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10);
  const d = Number.parseInt(dStr, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return { weekdayShort: '—', day: '—' };
  }
  const localDate = new Date(y, m - 1, d);
  return {
    weekdayShort: localDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    day: d.toString(),
  };
}
