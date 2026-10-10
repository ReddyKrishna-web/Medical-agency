import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Building2,
  ChartNoAxesCombined,
  CheckCircle2,
  FileSearch,
  IndianRupee,
  LockKeyhole,
  MessagesSquare,
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
  Users,
} from 'lucide-react';
import { publicApi } from '@/lib/api';
import { SEO } from '@/components/ui/SEO';

const capabilities = [
  { icon: ShoppingBag, title: 'B2B ordering', text: 'Multi-line baskets with server-confirmed pricing and FEFO batch allocation.' },
  { icon: Boxes, title: 'Batch inventory', text: 'Expiry-aware stock, movement history and zero negative balances.' },
  { icon: Truck, title: 'Dispatch tracking', text: 'A guarded lifecycle from order to delivery, visible to both sides.' },
  { icon: Users, title: 'Salesman CRM', text: 'Assigned shops, follow-ups and visit history for the field team.' },
  { icon: ChartNoAxesCombined, title: 'Live reports', text: 'Dashboards computed from your own database, never invented.' },
  { icon: MessagesSquare, title: 'Realtime chat', text: 'Shops, salesmen and agency staff on the same order conversation.' },
  { icon: FileSearch, title: 'Requirement uploads', text: 'PDF, image or spreadsheet lists converted into reviewable requests.' },
  { icon: IndianRupee, title: 'Invoices & payments', text: 'Automatic invoices on delivery with a clean payment ledger.' },
];

const flow = [
  { step: '01', title: 'Register & pick agency', text: 'One form. Shops and salesmen join an agency; agencies launch their own workspace.', icon: Building2 },
  { step: '02', title: 'Fill the basket', text: 'Search the catalog, set quantities, see live availability before ordering.', icon: ShoppingBag },
  { step: '03', title: 'Confirm & place order', text: 'The basket is placed with the agency in one confirmed step — no price guessing.', icon: PackageCheck },
  { step: '04', title: 'Track to delivery', text: 'Agency processes, salesman mediates, shop follows the same verified timeline.', icon: Truck },
];

const roleCards = [
  {
    icon: Building2,
    role: 'For agencies',
    headline: 'Run the whole distribution operation',
    points: ['Approve nothing manually — accounts arrive ready', 'Manage products, batches and pricing', 'Process orders through a guarded lifecycle'],
    cta: { label: 'Launch your agency', to: '/register' },
    dark: true,
  },
  {
    icon: Users,
    role: 'For salesmen',
    headline: 'A field workspace that actually helps',
    points: ['Assigned shops with full order history', 'Visit follow-ups and notes in one place', 'Order on behalf of any assigned shop'],
    cta: { label: 'Join as salesman', to: '/register' },
    dark: false,
  },
  {
    icon: ShoppingBag,
    role: 'For medical shops',
    headline: 'Ordering that takes minutes, not calls',
    points: ['Pick your agency at registration', 'Reorder any past order in one click', 'Track every box to your counter'],
    cta: { label: 'Register your shop', to: '/register' },
    dark: false,
  },
];

export default function HomePage() {
  const agency = useQuery({
    queryKey: ['public-agency'],
    queryFn: publicApi.agency,
    staleTime: 300_000,
  }).data;
  const agencyName = agency?.name || 'Supply Medicals';

  return (
    <>
      <SEO
        title="Smart B2B Medical Distribution Platform"
        description={`${agencyName} connects medical agencies, salesmen and medical shops in one realtime distribution platform.`}
      />

      {/* ------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 12% 20%, rgba(34,173,120,.4), transparent 30%), radial-gradient(circle at 88% 12%, rgba(31,130,245,.32), transparent 26%), radial-gradient(circle at 50% 100%, rgba(34,173,120,.18), transparent 40%)',
          }}
        />
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24 lg:px-8 lg:pb-24 lg:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-medical-400/25 bg-medical-400/10 px-3 py-1.5 text-xs font-semibold text-medical-200">
              <Sparkles className="h-3.5 w-3.5" /> No approvals. No waiting. Register and start ordering.
            </div>
            <h1 className="text-4xl font-extrabold leading-[1.06] tracking-[-.03em] sm:text-5xl lg:text-[3.4rem]">
              Medical distribution,
              <br />
              <span className="text-medical-300">without the friction.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              {agencyName} connects your agency, your field salesmen and every medical shop on one platform — from the
              first basket to the delivered box.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/register"
                className="group inline-flex h-13 items-center justify-center gap-2 rounded-2xl bg-medical-500 px-7 py-3.5 text-sm font-extrabold text-white shadow-xl shadow-medical-900/30 transition hover:-translate-y-0.5 hover:bg-medical-400"
              >
                Create free account
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
              >
                Sign in
              </Link>
            </div>
            <p className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5" /> Tenant-isolated data · HttpOnly sessions · role-based workspaces
            </p>
          </div>

          {/* Flow rail */}
          <ol className="mx-auto mt-16 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {flow.map((item) => (
              <li key={item.step} className="rounded-2xl border border-white/10 bg-white/[.06] p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold tracking-widest text-medical-300">{item.step}</span>
                  <item.icon className="h-4.5 w-4.5 text-slate-400" />
                </div>
                <p className="mt-3 text-sm font-extrabold">{item.title}</p>
                <p className="mt-1.5 text-xs leading-5 text-slate-400">{item.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------- role cards */}
      <section className="bg-canvas py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-medical-700">One platform · three workspaces</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Built around the people who move medicals.
            </h2>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {roleCards.map((card) => (
              <article
                key={card.role}
                className={
                  card.dark
                    ? 'relative overflow-hidden rounded-3xl bg-ink p-7 text-white shadow-panel sm:p-8'
                    : 'relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-7 shadow-soft sm:p-8'
                }
              >
                {card.dark && (
                  <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-medical-500/25 blur-3xl" />
                )}
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <span
                      className={
                        card.dark
                          ? 'grid h-11 w-11 place-items-center rounded-xl bg-medical-500 text-white'
                          : 'grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700'
                      }
                    >
                      <card.icon className="h-5 w-5" />
                    </span>
                    <span
                      className={
                        card.dark
                          ? 'text-[11px] font-extrabold uppercase tracking-widest text-medical-300'
                          : 'text-[11px] font-extrabold uppercase tracking-widest text-slate-400'
                      }
                    >
                      {card.role}
                    </span>
                  </div>
                  <h3 className={card.dark ? 'mt-5 text-xl font-extrabold' : 'mt-5 text-xl font-extrabold text-ink'}>
                    {card.headline}
                  </h3>
                  <ul className={card.dark ? 'mt-5 space-y-3 text-sm text-slate-300' : 'mt-5 space-y-3 text-sm text-slate-600'}>
                    {card.points.map((point) => (
                      <li key={point} className="flex gap-2.5">
                        <CheckCircle2 className={card.dark ? 'mt-0.5 h-4.5 w-4.5 shrink-0 text-medical-400' : 'mt-0.5 h-4.5 w-4.5 shrink-0 text-medical-600'} />
                        {point}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={card.cta.to}
                    className={
                      card.dark
                        ? 'mt-7 inline-flex items-center gap-1.5 text-sm font-extrabold text-medical-300 transition hover:text-white'
                        : 'mt-7 inline-flex items-center gap-1.5 text-sm font-extrabold text-brand-700 transition hover:text-brand-900'
                    }
                  >
                    {card.cta.label} <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- capabilities */}
      <section className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[.18em] text-brand-700">Everything included</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
                Serious operations tooling under a simple surface.
              </h2>
            </div>
            <Link to="/features" className="inline-flex items-center gap-2 text-sm font-bold text-brand-700 hover:text-brand-900">
              Explore all features <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            {capabilities.map((item) => (
              <article key={item.title} className="group bg-white p-6 transition hover:bg-slate-50">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-canvas text-brand-700 ring-1 ring-slate-200 transition group-hover:bg-brand-50 group-hover:ring-brand-200">
                  <item.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-extrabold text-ink">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- trust bar */}
      <section className="border-y border-slate-200 bg-canvas py-14">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 text-center sm:grid-cols-3 sm:px-6 lg:px-8">
          {[
            { value: 'Zero', label: 'approval waiting time', sub: 'Accounts are active the moment registration completes.' },
            { value: 'FEFO', label: 'batch-safe allocation', sub: 'Earliest-expiry stock ships first, automatically.' },
            { value: '100%', label: 'audited stock moves', sub: 'Every quantity change writes a movement and an audit event.' },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-4xl font-extrabold tracking-tight text-ink">{stat.value}</p>
              <p className="mt-1 text-sm font-extrabold text-medical-700">{stat.label}</p>
              <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-slate-500">{stat.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------- final CTA */}
      <section className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[2rem] bg-ink px-6 py-14 text-center text-white sm:px-12 sm:py-16">
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 20% 30%, rgba(34,173,120,.35), transparent 32%), radial-gradient(circle at 80% 70%, rgba(31,130,245,.3), transparent 30%)',
              }}
            />
            <div className="relative mx-auto max-w-2xl">
              <LockKeyhole className="mx-auto h-8 w-8 text-medical-300" />
              <h2 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">
                Your supply chain, one connected workspace.
              </h2>
              <p className="mx-auto mt-4 max-w-xl leading-7 text-slate-300">
                Create an account in three steps and start ordering today — or launch your own agency and bring your
                shops and salesmen online.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-medical-500 px-7 py-3.5 text-sm font-extrabold text-white transition hover:bg-medical-400"
                >
                  Get started free <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/contact"
                  className="inline-flex items-center justify-center rounded-2xl border border-white/20 px-7 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
                >
                  Talk to us
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
