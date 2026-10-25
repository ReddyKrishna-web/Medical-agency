import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-[11px] font-medium uppercase tracking-[.16em] text-brand-700', className)}>
      {children}
    </p>
  );
}

export function PageHero({
  eyebrow,
  title,
  intro,
  actions,
  aside,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  intro: string;
  actions?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('border-b border-line bg-ivory', className)}>
      <div className="mx-auto grid max-w-[1240px] gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <SectionLabel>{eyebrow}</SectionLabel>
          <h1 className="mt-4 font-display text-[36px] font-semibold leading-[1.08] tracking-[-0.03em] text-charcoal sm:text-[46px] lg:text-[52px]">
            {title}
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-7 text-muted sm:text-base">{intro}</p>
          {actions && <div className="mt-8 flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
        {aside && <div className="lg:pb-1">{aside}</div>}
      </div>
    </section>
  );
}

export function CtaBand({
  title,
  description,
  primaryLabel = 'Create account',
  primaryTo = '/register',
  secondaryLabel = 'Talk to our team',
  secondaryTo = '/contact',
}: {
  title: string;
  description: string;
  primaryLabel?: string;
  primaryTo?: string;
  secondaryLabel?: string;
  secondaryTo?: string;
}) {
  return (
    <section className="bg-forest">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:flex-row lg:items-end lg:justify-between lg:px-8">
        <div className="max-w-2xl">
          <h2 className="font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-white sm:text-[38px]">
            {title}
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-white/65 sm:text-[15px]">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={primaryTo}
            className="group inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-medium text-brand-800 transition-colors hover:bg-sage"
          >
            {primaryLabel}
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 ease-smooth group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
          <Link
            to={secondaryTo}
            className="inline-flex h-11 items-center rounded-lg border border-white/25 px-5 text-sm font-medium text-white transition-colors hover:border-white/50 hover:bg-white/5"
          >
            {secondaryLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}

export function PageSection({
  children,
  className,
  tone = 'ivory',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'ivory' | 'white' | 'parchment';
}) {
  const toneClass = tone === 'white' ? 'bg-white' : tone === 'parchment' ? 'bg-parchment' : 'bg-ivory';
  return (
    <section className={cn('border-b border-line', toneClass, className)}>
      <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">{children}</div>
    </section>
  );
}
