import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  change?: string;
  icon?: LucideIcon;
  tone?: 'default' | 'gold';
  className?: string;
}

export function StatCard({
  label,
  value,
  change,
  icon: Icon,
  tone = 'default',
  className,
}: StatCardProps) {
  return (
    <div className={cn('shadow-card flex flex-col gap-3 rounded-2xl bg-white p-6', className)}>
      <div className="flex items-center justify-between text-[13px] text-[#737373]">
        <span>{label}</span>
        {Icon && (
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg',
              tone === 'gold'
                ? 'bg-brand-gold-50 text-brand-gold-400'
                : 'bg-brand-teal-50 text-brand-teal-500',
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="text-brand-teal-500 text-4xl leading-none font-light tracking-tight">
        {value}
      </div>
      {change && <div className="text-xs text-[#737373]">{change}</div>}
    </div>
  );
}
