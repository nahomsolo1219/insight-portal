import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number; // 0-100
  tone?: 'teal' | 'gold';
  className?: string;
  showLabel?: boolean;
}

export function ProgressBar({
  value,
  tone = 'teal',
  className,
  showLabel = false,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="bg-brand-warm-200 h-1.5 flex-1 overflow-hidden rounded-full">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            tone === 'gold' ? 'bg-brand-gold-400' : 'bg-brand-teal-500',
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="min-w-[2.5rem] text-right text-xs text-[#737373] tabular-nums">
          {clamped}%
        </span>
      )}
    </div>
  );
}
