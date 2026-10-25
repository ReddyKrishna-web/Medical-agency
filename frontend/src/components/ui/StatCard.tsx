import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card } from './Card';
import { Skeleton } from './States';
import { cn, formatNumber } from '@/lib/utils';

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  trend,
  loading,
  tone = 'blue',
}: {
  label: string;
  value?: number | string;
  icon: LucideIcon;
  hint?: string;
  trend?: number;
  loading?: boolean;
  tone?: 'blue' | 'green' | 'amber' | 'purple';
}) {
  const iconTone = {
    blue: 'bg-sage text-brand-700',
    green: 'bg-sage text-brand-700',
    amber: 'bg-amber-50 text-amber-700',
    purple: 'bg-parchment text-navy-700',
  }[tone];

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase leading-4 tracking-[.12em] text-muted">{label}</p>
        <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-md', iconTone)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-20" />
      ) : (
        <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] text-charcoal">
          {typeof value === 'number' ? formatNumber(value) : value || '—'}
        </p>
      )}
      <div className="mt-2.5 flex items-center gap-2 text-xs">
        {trend !== undefined && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-medium',
              trend >= 0 ? 'text-brand-700' : 'text-red-600',
            )}
          >
            {trend >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(trend)}%
          </span>
        )}
        {hint && <span className="truncate text-muted">{hint}</span>}
      </div>
    </Card>
  );
}
