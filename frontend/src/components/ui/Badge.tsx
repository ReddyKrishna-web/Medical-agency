import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { humanize, statusTone, type BadgeTone } from '@/lib/status';

const tones: Record<BadgeTone, string> = { blue:'bg-brand-50 text-brand-700 ring-brand-600/20', green:'bg-medical-50 text-medical-700 ring-medical-600/20', amber:'bg-amber-50 text-amber-700 ring-amber-600/20', red:'bg-red-50 text-red-700 ring-red-600/20', slate:'bg-slate-100 text-slate-700 ring-slate-500/20', purple:'bg-violet-50 text-violet-700 ring-violet-600/20' };
export function Badge({ value, children, tone, className }: { value?: string; children?: ReactNode; tone?: BadgeTone; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset', tones[tone || statusTone(value)], className)}>{children || humanize(value)}</span>;
}
