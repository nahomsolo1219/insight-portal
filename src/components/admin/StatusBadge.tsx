import { cn } from '@/lib/utils';

type Tone = 'teal' | 'gold' | 'green' | 'amber' | 'red' | 'neutral' | 'blue';

interface StatusBadgeProps {
  label: string;
  tone?: Tone;
  className?: string;
}

const toneStyles: Record<Tone, string> = {
  teal: 'bg-brand-teal-50 text-brand-teal-500',
  gold: 'bg-brand-gold-50 text-brand-gold-500',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-rose-50 text-rose-700',
  neutral: 'bg-brand-warm-200 text-[#555]',
  blue: 'bg-sky-50 text-sky-700',
};

export function StatusBadge({ label, tone = 'neutral', className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide',
        toneStyles[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
