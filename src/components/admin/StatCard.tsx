import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type TrendColor = 'green' | 'amber' | 'gray';
type ValueColor = 'default' | 'amber';

interface StatCardProps {
  label: string;
  value: string | number;
  /** Small subline beneath the number (e.g. "↑ 3 new this month"). */
  trend?: string;
  trendColor?: TrendColor;
  /** Primary number color. 'amber' signals a value that deserves attention. */
  valueColor?: ValueColor;
  icon?: LucideIcon;
  /** Icon chip background palette. Defaults to teal; 'gold' is reserved for spotlight cards. */
  iconTone?: 'teal' | 'gold';
  className?: string;
}

const trendClasses: Record<TrendColor, string> = {
  green: 'text-emerald-600',
  amber: 'text-amber-600',
  gray: 'text-[#737373]',
};

const valueClasses: Record<ValueColor, string> = {
  default: 'text-ink-900',
  amber: 'text-amber-600',
};

export function StatCard({
  label,
  value,
  trend,
  trendColor = 'gray',
  valueColor = 'default',
  icon: Icon,
  iconTone = 'teal',
  className,
}: StatCardProps) {
  return (
    <div className={cn('shadow-soft-md flex flex-col gap-3 rounded-2xl bg-paper p-6', className)}>
      <div className="flex items-center justify-between text-[13px] text-[#737373]">
        <span>{label}</span>
        {Icon && (
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg',
              iconTone === 'gold'
                ? 'bg-brand-gold-50 text-brand-gold-400'
                : 'bg-brand-teal-50 text-brand-teal-500',
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div
        className={cn(
          'serif text-4xl leading-none font-light tracking-tight',
          valueClasses[valueColor],
        )}
      >
        {value}
      </div>
      {trend && <div className={cn('text-xs', trendClasses[trendColor])}>{trend}</div>}
    </div>
  );
}
