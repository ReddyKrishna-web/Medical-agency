import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card } from './Card';
import { Skeleton } from './States';
import { cn, formatNumber } from '@/lib/utils';
export function StatCard({ label, value, icon: Icon, hint, trend, loading, tone = 'blue' }: { label: string; value?: number | string; icon: LucideIcon; hint?: string; trend?: number; loading?: boolean; tone?: 'blue' | 'green' | 'amber' | 'purple' }) {
  const iconTone = { blue:'bg-brand-50 text-brand-700',green:'bg-medical-50 text-medical-700',amber:'bg-amber-50 text-amber-700',purple:'bg-violet-50 text-violet-700' }[tone];
  return <Card className="p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-sm font-medium text-slate-500">{label}</p>{loading ? <Skeleton className="mt-3 h-8 w-24" /> : <p className="mt-2 text-2xl font-extrabold tracking-tight text-ink">{typeof value === 'number' ? formatNumber(value) : value || '—'}</p>}</div><span className={cn('shrink-0 rounded-xl p-2.5',iconTone)}><Icon className="h-5 w-5" aria-hidden /></span></div><div className="mt-3 flex items-center gap-2 text-xs">{trend !== undefined && <span className={cn('inline-flex items-center font-semibold',trend >= 0 ? 'text-medical-700' : 'text-red-600')}>{trend >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{Math.abs(trend)}%</span>}{hint && <span className="truncate text-slate-400">{hint}</span>}</div></Card>;
}
