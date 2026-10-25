import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AnimatedNumber, AuroraBackdrop, LiveDot, Reveal } from '@/components/motion/Motion';
import { cn } from '@/lib/utils';

/** Dark animated hero shared by the agency, salesman and shop workspaces. */
export function DashboardHero({
  eyebrow,
  title,
  description,
  actions,
  metrics,
  aside,
  liveLabel = 'Live workspace',
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
  metrics: ReactNode;
  aside?: ReactNode;
  liveLabel?: string;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'relative isolate overflow-hidden rounded-[2rem] bg-gradient-to-br from-night-900 via-night-950 to-ink p-6 text-white shadow-lift sm:p-8',
        className,
      )}
    >
      <AuroraBackdrop className="opacity-90" />
      <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/60 to-transparent" />

      <div className="relative z-10 grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] xl:items-center">
        <div className="animate-fade-up">
          <div className="flex flex-wrap items-center gap-3">
            <LiveDot label={liveLabel} />
            <span className="text-[11px] font-bold uppercase tracking-[.2em] text-slate-400">{eyebrow}</span>
          </div>
          <h1 className="mt-4 text-balance font-display text-[30px] font-extrabold leading-[1.12] tracking-tight sm:text-[38px]">
            {title}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300/90">{description}</p>
          {actions && <div className="mt-6 flex flex-wrap items-center gap-3">{actions}</div>}
        </div>

        <div className="grid animate-slide-in-right grid-cols-2 gap-3" style={{ animationDelay: '120ms' }}>
          {metrics}
        </div>
        {aside}
      </div>
    </section>
  );
}

export function HeroMetric({
  label,
  value,
  format,
  hint,
  accent = 'emerald',
  className,
}: {
  label: string;
  value?: number | null;
  format?: (value: number) => string;
  hint?: string;
  accent?: 'emerald' | 'sky' | 'amber' | 'violet';
  className?: string;
}) {
  const accents = {
    emerald: 'text-brand-300',
    sky: 'text-sky-300',
    amber: 'text-amber-300',
    violet: 'text-violet-300',
  } as const;

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[.055] p-4 backdrop-blur-md transition-all duration-500 ease-smooth hover:-translate-y-1 hover:border-brand-400/30 hover:bg-white/[.08] hover:shadow-glow',
        className,
      )}
    >
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-brand-400/10 blur-xl transition-transform duration-700 group-hover:scale-150" />
      <p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">{label}</p>
      <p className={cn('mt-2 font-display text-[26px] font-extrabold leading-none tracking-tight', accents[accent])}>
        <AnimatedNumber value={value} format={format} />
      </p>
      {hint && <p className="mt-1.5 truncate text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

/** Animated SVG completion ring (e.g. delivered share of orders). */
export function ProgressRing({
  value,
  max,
  label,
  caption,
  size = 132,
}: {
  value: number;
  max: number;
  label: string;
  caption?: string;
  size?: number;
}) {
  const radius = (size - 14) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeMax = max > 0 ? max : 1;
  const ratio = Math.max(0, Math.min(1, value / safeMax));
  const percent = Math.round(ratio * 100);

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${label}: ${percent}%`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="9" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#ring-gradient)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
            style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)' }}
          />
          <defs>
            <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6ee7b7" />
              <stop offset="55%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="font-display text-2xl font-extrabold text-white">
              <AnimatedNumber value={percent} format={(amount) => `${Math.round(amount)}%`} />
            </p>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[.16em] text-slate-400">{label}</p>
          </div>
        </div>
      </div>
      {caption && <p className="max-w-[150px] text-center text-[11px] leading-4 text-slate-400">{caption}</p>}
    </div>
  );
}

/** Animated horizontal proportion bar for status breakdowns. */
export function BreakdownBar({
  label,
  count,
  total,
  value,
  tone = 'emerald',
}: {
  label: string;
  count: number;
  total: number;
  value?: string;
  tone?: 'emerald' | 'sky' | 'amber' | 'violet' | 'rose';
}) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  const tones = {
    emerald: 'from-brand-400 to-medical-500',
    sky: 'from-sky-400 to-brand-400',
    amber: 'from-amber-400 to-orange-400',
    violet: 'from-violet-400 to-sky-400',
    rose: 'from-rose-400 to-red-400',
  } as const;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold capitalize text-slate-700">{label}</span>
        <span className="flex items-center gap-3">
          <span className="font-display font-bold text-slate-800">{count}</span>
          {value && <span className="w-24 text-right text-xs text-slate-500">{value}</span>}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-1000 ease-smooth', tones[tone])}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}

/** Animated shortcut tile used across the dashboards. */
export function ActionTile({
  to,
  icon: Icon,
  title,
  text,
  delay = 0,
  tone = 'emerald',
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
  delay?: number;
  tone?: 'emerald' | 'sky' | 'amber' | 'violet';
}) {
  const tones = {
    emerald: 'text-brand-700 from-brand-500/20 to-medical-500/10',
    sky: 'text-sky-700 from-sky-400/20 to-brand-400/10',
    amber: 'text-amber-700 from-amber-400/20 to-orange-300/10',
    violet: 'text-violet-700 from-violet-400/20 to-sky-300/10',
  } as const;

  return (
    <Reveal delay={delay}>
      <Link
        to={to}
        className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/85 p-5 shadow-soft backdrop-blur-xl transition-all duration-500 ease-smooth hover-lift hover:border-brand-200/80 hover:shadow-lift"
      >
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-gradient-to-br from-brand-300/20 to-transparent blur-2xl transition-transform duration-700 group-hover:scale-150" />
        <span className={cn('grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br ring-1 ring-white/60 transition-transform duration-500 group-hover:scale-110', tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
        <p className="mt-4 font-display text-[15px] font-extrabold text-ink">{title}</p>
        <p className="mt-1 flex-1 text-sm leading-6 text-slate-500">{text}</p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-700">
          Open <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </span>
      </Link>
    </Reveal>
  );
}
