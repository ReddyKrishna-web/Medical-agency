import type { ReactNode } from 'react';

export function AuthHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-7">
      <p className="text-[11px] font-medium uppercase tracking-[.14em] text-brand-700">{eyebrow}</p>
      <h1 className="mt-2 font-display text-[27px] font-semibold tracking-[-0.02em] text-charcoal">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

export function AuthSuccess({
  icon: Icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-sage text-brand-700">{Icon}</div>
      <h1 className="mt-5 font-display text-[25px] font-semibold tracking-[-0.02em] text-charcoal">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">{message}</p>
      {action && <div className="mt-7">{action}</div>}
    </div>
  );
}
