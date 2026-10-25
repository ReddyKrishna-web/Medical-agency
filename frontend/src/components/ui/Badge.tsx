import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { humanize, statusTone, type BadgeTone } from '@/lib/status';

const tones: Record<BadgeTone, string> = {
  blue: 'bg-azure-50 text-azure-700 ring-azure-300/60',
  green: 'bg-medical-50 text-medical-700 ring-medical-700/15',
  amber: 'bg-amber-50 text-amber-800 ring-amber-700/15',
  red: 'bg-red-50 text-red-700 ring-red-700/15',
  slate: 'bg-ivory text-muted ring-navy-400/20',
  purple: 'bg-parchment text-navy-700 ring-navy-400/20',
};

export function Badge({
  value,
  children,
  tone,
  className,
}: {
  value?: string;
  children?: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset',
        tones[tone || statusTone(value)],
        className,
      )}
    >
      {children || humanize(value)}
    </span>
  );
}
