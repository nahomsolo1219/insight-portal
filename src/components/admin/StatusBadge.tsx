import { cn } from '@/lib/utils';

type Tone = 'teal' | 'gold' | 'green' | 'amber' | 'red' | 'neutral' | 'blue';

const toneStyles: Record<Tone, string> = {
  teal: 'bg-brand-teal-50 text-brand-teal-500',
  gold: 'bg-brand-gold-50 text-brand-gold-500',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-rose-50 text-rose-700',
  neutral: 'bg-brand-warm-200 text-[#555]',
  blue: 'bg-sky-50 text-sky-700',
};

/**
 * Central map from raw DB status strings (appointment_status, invoice_status,
 * milestone_status, etc.) to human labels + tones. Extend as new statuses
 * land — any unknown status falls back to neutral with a title-cased label.
 */
const statusDefaults: Record<string, { label: string; tone: Tone }> = {
  // appointments
  scheduled: { label: 'Scheduled', tone: 'blue' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  completed: { label: 'Completed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'red' },
  // invoices
  paid: { label: 'Paid', tone: 'green' },
  unpaid: { label: 'Unpaid', tone: 'red' },
  partial: { label: 'Partial', tone: 'amber' },
  // milestones
  complete: { label: 'Complete', tone: 'green' },
  in_progress: { label: 'In progress', tone: 'blue' },
  upcoming: { label: 'Upcoming', tone: 'neutral' },
  pending: { label: 'Pending', tone: 'amber' },
  awaiting_client: { label: 'Awaiting client', tone: 'gold' },
  // projects
  active: { label: 'Active', tone: 'green' },
  on_hold: { label: 'On hold', tone: 'amber' },
};

function prettifyStatus(status: string): string {
  return status
    .split(/[_-]/)
    .map((part, i) => (i === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

interface StatusBadgeProps {
  /** Pre-resolved label. Mutually exclusive with `status`. */
  label?: string;
  /** Raw DB status string. Looked up in the status map to derive label + tone. */
  status?: string;
  /** Override the tone derived from `status`, or set the tone when using `label`. */
  tone?: Tone;
  className?: string;
}

export function StatusBadge({ label, status, tone, className }: StatusBadgeProps) {
  const resolved = (() => {
    if (label) return { label, tone: tone ?? 'neutral' };
    if (status) {
      const def = statusDefaults[status] ?? { label: prettifyStatus(status), tone: 'neutral' };
      return { label: def.label, tone: tone ?? def.tone };
    }
    return { label: '', tone: tone ?? 'neutral' };
  })();

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide',
        toneStyles[resolved.tone],
        className,
      )}
    >
      {resolved.label}
    </span>
  );
}
