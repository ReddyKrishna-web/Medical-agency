import { Link, Outlet } from 'react-router-dom';
import { Activity, ArrowLeft, ShieldCheck, Star, Truck, UserCheck } from 'lucide-react';
import { Logo } from '@/components/Logo';

const trust = [
  {
    icon: Truck,
    title: 'Order to delivery in one flow',
    text: 'Fill the basket, confirm your agency and follow every step through dispatch.',
  },
  {
    icon: UserCheck,
    title: 'Built for three roles',
    text: 'Agencies administer, salesmen mediate, and medical shops order in minutes.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure by default',
    text: 'HttpOnly refresh sessions, short-lived access tokens and tenant-isolated data.',
  },
];

const stats = [
  { value: '3', label: 'connected roles' },
  { value: 'FEFO', label: 'batch-aware stock' },
  { value: '24/7', label: 'order tracking' },
];

/**
 * Shared shell for the auth pages. The brand panel rotates its highlight
 * statement per route via the pathname, giving login and register distinct
 * messaging without duplicating layout markup.
 */
export default function AuthLayout() {
  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Brand panel */}
      <aside className="relative hidden w-[46%] max-w-2xl flex-col justify-between overflow-hidden bg-ink p-10 text-white xl:p-14 lg:flex">
        <div className="absolute -right-40 -top-40 h-[30rem] w-[30rem] rounded-full bg-medical-500/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-32 h-[26rem] w-[26rem] rounded-full bg-brand-500/20 blur-3xl" />
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              'radial-gradient(circle at 15% 20%, rgba(34,173,120,.4), transparent 26%), radial-gradient(circle at 85% 80%, rgba(31,130,245,.35), transparent 24%)',
          }}
        />

        <div className="relative">
          <Logo light />
        </div>

        <div className="relative max-w-md">
          <span className="mb-6 inline-flex rounded-full border border-medical-400/30 bg-medical-400/10 p-3 text-medical-300">
            <Activity className="h-6 w-6" />
          </span>
          <h1 className="text-4xl font-extrabold leading-[1.15] tracking-tight">
            The medical supply chain,
            <span className="text-medical-300"> finally connected.</span>
          </h1>
          <ul className="mt-9 space-y-5">
            {trust.map((item) => (
              <li key={item.title} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[.08] text-medical-300 ring-1 ring-white/10">
                  <item.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-extrabold">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <dl className="flex gap-8 border-t border-white/10 pt-6">
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt className="order-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{stat.label}</dt>
                <dd className="order-1 text-2xl font-extrabold text-medical-300">{stat.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 flex items-center gap-1.5 text-xs text-slate-500">
            <Star className="h-3.5 w-3.5 text-medical-400" /> Trusted by medical distributors and neighbourhood pharmacies
          </p>
        </div>
      </aside>

      {/* Form panel */}
      <main id="main-content" className="relative flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between p-5 sm:p-7">
          <div className="lg:hidden">
            <Logo />
          </div>
          <Link
            to="/"
            className="ml-auto inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 transition hover:text-brand-700"
          >
            <ArrowLeft className="h-4 w-4" /> Back to website
          </Link>
        </header>
        <div className="flex flex-1 items-start justify-center px-4 pb-16 sm:px-8 lg:items-center">
          <div className="w-full max-w-lg">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
