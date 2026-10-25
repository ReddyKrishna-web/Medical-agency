import { Link, Outlet, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/Logo';

const facts = [
  ['Three roles', 'Agency administrators, sales representatives and medical shops work from one record.'],
  ['Batch aware', 'Earliest-expiry allocation and signed stock movements keep inventory accountable.'],
  ['Tenant isolated', 'Short-lived access tokens and scoped queries protect each organisation.'],
];

const highlights: Record<string, { eyebrow: string; headline: string; accent: string }> = {
  '/login': {
    eyebrow: 'Welcome back',
    headline: 'The medical supply chain,',
    accent: ' finally connected.',
  },
  '/register': {
    eyebrow: 'Create account',
    headline: 'Your distribution workspace,',
    accent: ' ready in minutes.',
  },
};

const fallbackHighlight = {
  eyebrow: 'Account access',
  headline: 'Secure business access.',
  accent: ' In one place.',
};

export default function AuthLayout() {
  const { pathname } = useLocation();
  const highlight = highlights[pathname] ?? fallbackHighlight;

  return (
    <div className="flex min-h-screen bg-ivory">
      <aside className="relative hidden w-[44%] max-w-[560px] overflow-hidden text-white lg:flex lg:flex-col">
        <img
          src="/images/auth-pharmacist.jpg"
          alt="A medical-distribution pharmacist standing in front of organised medicine shelves"
          width={1600}
          height={2400}
          loading="eager"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-[50%_35%]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-charcoal/55 via-brand-950/85 to-brand-950/95"
        />

        <div className="relative flex h-full flex-1 flex-col justify-between p-10 xl:p-14">
          <Logo light />

          <div className="max-w-sm">
            <p className="text-[11px] font-medium uppercase tracking-[.16em] text-sage/80">
              {highlight.eyebrow}
            </p>
            <h1 className="mt-4 font-display text-[34px] font-semibold leading-[1.2] tracking-[-0.02em]">
              {highlight.headline}
              <span className="text-sage">{highlight.accent}</span>
            </h1>
            <p className="mt-5 text-sm leading-7 text-white/70">
              A calm, dependable workspace for medical distribution — from catalogue and stock through to invoice and
              delivery.
            </p>

            <ul className="mt-10 divide-y divide-white/10 border-y border-white/10">
              {facts.map(([title, text]) => (
                <li key={title} className="py-4">
                  <p className="text-[13px] font-medium text-white">{title}</p>
                  <p className="mt-1 text-[13px] leading-6 text-white/60">{text}</p>
                </li>
              ))}
            </ul>
          </div>

          <p className="max-w-xs text-xs leading-5 text-white/50">
            Operational software for medical distribution. It does not provide diagnosis, treatment or clinical advice.
          </p>
        </div>
      </aside>

      <main id="main-content" className="flex min-h-screen flex-1 flex-col bg-ivory">
        <div className="flex items-center justify-between p-5 sm:p-7">
          <div className="lg:hidden">
            <Logo />
          </div>
          <Link
            to="/"
            className="ml-auto inline-flex items-center gap-2 rounded-md px-2 py-1 text-[13px] font-medium text-muted transition-colors hover:text-charcoal"
          >
            <ArrowLeft className="h-4 w-4" /> Back to website
          </Link>
        </div>

        <div className="flex flex-1 items-start justify-center px-4 pb-16 sm:px-8 lg:items-center">
          <div className="w-full max-w-md">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
