import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Barcode,
  Boxes,
  BriefcaseBusiness,
  Building2,
  ClipboardCheck,
  ClipboardList,
  ListChecks,
  PackageCheck,
  ReceiptText,
  Store,
  Truck,
} from 'lucide-react';
import { publicApi } from '@/lib/api';
import { SEO } from '@/components/ui/SEO';
import { CtaBand, PageSection, SectionLabel } from '@/components/landing/Editorial';
import { Parallax, Reveal, Tilt } from '@/components/motion/Motion';
import { cn } from '@/lib/utils';

const orderRows = [
  { group: 'Wound care and dressings', reference: 'Order 2481', status: 'Confirmed' },
  { group: 'Diagnostic consumables', reference: 'Order 2480', status: 'Packed' },
  { group: 'Cardiology supplies', reference: 'Order 2477', status: 'Dispatched' },
];

const stockAlerts = [
  { group: 'Diagnostic consumables', batch: 'Batch DG-1182', position: 'Low stock', tone: true },
  { group: 'Wound care', batch: 'Batch WC-2409', position: 'Expiring soon', tone: false },
];

const heroBenefits = [
  { icon: PackageCheck, text: 'Batch-aware stock control, received and allocated by expiry.' },
  { icon: ClipboardCheck, text: 'A guarded fulfilment lifecycle with a recorded history.' },
  { icon: ReceiptText, text: 'Invoices and payment records the agency and shop can revisit.' },
];

const workflowSteps = [
  {
    icon: ClipboardList,
    title: 'Order',
    text: 'A shop or its sales representative builds an order from the active catalogue. The browser never sets the authoritative price.',
    detail: 'Pricing, tax and availability are resolved by the service when the order is submitted.',
  },
  {
    icon: Boxes,
    title: 'Allocate',
    text: 'The agency reviews availability and allocates specific batches, earliest expiry first, against each line.',
    detail: 'Each line is tied to a batch, so the stock that leaves is the stock that was recorded.',
  },
  {
    icon: Truck,
    title: 'Fulfil',
    text: 'Packing and dispatch move through a guarded lifecycle, with timestamped status history on every step.',
    detail: 'Every transition is checked against the order state and written to its history.',
  },
  {
    icon: ReceiptText,
    title: 'Invoice',
    text: 'The invoice, payment record and order history remain available to the people who are allowed to see them.',
    detail: 'Payments are recorded against the internal ledger; access stays scoped to the account.',
  },
];

const capabilities = [
  {
    title: 'Catalogue and ordering',
    text: 'Search the active catalogue, build a multi-line order and let the service resolve price, tax and availability.',
  },
  {
    title: 'Batch-aware inventory',
    text: 'Receive stock by batch, allocate the earliest expiry first and keep every movement attributable.',
  },
  {
    title: 'Fulfilment with a record',
    text: 'Review, confirm, pack and dispatch through a guarded lifecycle with timestamped status history.',
  },
  {
    title: 'Invoices and account history',
    text: 'Read issued invoices, record payments against the internal ledger and revisit past orders without guesswork.',
  },
];

const roles = [
  {
    icon: Building2,
    label: 'Agency administrators',
    title: 'Run the operation from one desk.',
    text: 'Approvals, catalogue, stock, sales coverage and payment records, arranged in the order the work arrives.',
    points: ['Customer and salesmen administration', 'Inventory health and expiry signals', 'Reports drawn from real records'],
  },
  {
    icon: BriefcaseBusiness,
    label: 'Sales representatives',
    title: 'Stay close to the shops you serve.',
    text: 'Assigned accounts, follow-ups and order creation sit together so the next conversation is always prepared.',
    points: ['A focused customer portfolio', 'Dated follow-up planning', 'Order entry on behalf of a shop'],
  },
  {
    icon: Store,
    label: 'Medical shops',
    title: 'Order without the back-and-forth.',
    text: 'Find products, check availability, repeat a familiar order and follow it through to invoice.',
    points: ['Catalogue and repeat ordering', 'Requirement document uploads', 'Order progress and invoices'],
  },
];

function FulfilmentQueueCard() {
  return (
    <div className="w-[min(92vw,320px)] overflow-hidden rounded-lg border border-line bg-white shadow-lift sm:w-[320px]">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-sage">
            <ListChecks className="h-3.5 w-3.5 text-brand-700" aria-hidden />
          </span>
          <p className="text-[13px] font-semibold text-charcoal">Fulfilment queue</p>
        </div>
        <span className="rounded-md bg-sage px-2 py-0.5 text-[10px] font-medium uppercase tracking-[.1em] text-brand-800">
          Live
        </span>
      </div>

      <div className="divide-y divide-line/70">
        {orderRows.map((row) => (
          <div key={row.reference} className="flex items-center justify-between gap-4 px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-charcoal">{row.group}</p>
              <p className="mt-0.5 text-[11px] text-muted">{row.reference}</p>
            </div>
            <span className="shrink-0 rounded-md border border-line bg-ivory px-2 py-0.5 text-[10px] font-medium text-navy-700">
              {row.status}
            </span>
          </div>
        ))}
      </div>

      <div className="border-t border-line bg-ivory/70 px-4 py-3">
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>Batch-aware stock</span>
          <span>Earliest expiry first</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <span className="h-1 rounded-full bg-brand-600" />
          <span className="h-1 rounded-full bg-brand-300" />
          <span className="h-1 rounded-full bg-line" />
        </div>
      </div>
    </div>
  );
}

function StockAlertCard() {
  return (
    <div className="w-[min(92vw,264px)] rounded-lg border border-line bg-white shadow-panel sm:w-[264px]">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-azure-50">
          <Barcode className="h-3 w-3 text-azure-700" aria-hidden />
        </span>
        <p className="text-[10px] font-medium uppercase tracking-[.12em] text-muted">Stock awareness</p>
      </div>
      <div className="divide-y divide-line/70">
        {stockAlerts.map((row) => (
          <div key={row.batch} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium text-charcoal">{row.group}</p>
              <p className="mt-0.5 text-[10px] text-muted">{row.batch}</p>
            </div>
            <span
              className={
                row.tone
                  ? 'shrink-0 rounded-md bg-azure-50 px-2 py-0.5 text-[10px] font-medium text-azure-700 ring-1 ring-inset ring-azure-300/60'
                  : 'shrink-0 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-700/15'
              }
            >
              {row.position}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InventoryPreview() {
  const rows = [
    ['Wound care', 'Batch WC-2409', 'Available'],
    ['Diagnostics', 'Batch DG-1182', 'Low stock'],
    ['Cardiology', 'Batch CD-0917', 'Expiring soon'],
    ['Sterile gloves', 'Batch SG-3320', 'Available'],
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="grid grid-cols-[1.2fr_1fr_auto] gap-3 border-b border-line bg-ivory/70 px-4 py-2.5 text-[10px] font-medium uppercase tracking-[.1em] text-muted">
        <span>Category</span>
        <span>Batch</span>
        <span>Position</span>
      </div>
      <div className="divide-y divide-line/70">
        {rows.map(([category, batch, position]) => (
          <div key={batch} className="grid grid-cols-[1.2fr_1fr_auto] items-center gap-3 px-4 py-3">
            <span className="text-[13px] font-medium text-charcoal">{category}</span>
            <span className="text-[12px] text-muted">{batch}</span>
            <span className="rounded-md border border-line bg-white px-2 py-0.5 text-[10px] font-medium text-navy-700">
              {position}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const agency = useQuery({
    queryKey: ['public-agency'],
    queryFn: publicApi.agency,
    staleTime: 300_000,
  }).data;
  const agencyName = agency?.name || 'Supply Medicals';
  const [activeStep, setActiveStep] = useState(0);

  return (
    <>
      <SEO
        title="Medical supply distribution, considered | Supply Medicals"
        description={`${agencyName} connects medical distribution agencies, sales representatives and medical shops through calm, accountable ordering, inventory, fulfilment and invoicing.`}
      />

      <section className="border-b border-line bg-ivory">
        <div className="mx-auto grid max-w-[1240px] gap-14 px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-16 lg:px-8 lg:pb-28 lg:pt-24">
          <div>
            <Reveal>
              <SectionLabel>Medical distribution, considered</SectionLabel>
            </Reveal>
            <Reveal delay={90}>
              <h1 className="mt-5 max-w-xl font-display text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] text-charcoal sm:text-[52px] lg:text-[58px]">
                Medical supply, quietly under control.
              </h1>
            </Reveal>
            <Reveal delay={180}>
              <p className="mt-6 max-w-lg text-[15px] leading-7 text-muted sm:text-base">
                {agencyName} brings ordering, batch-aware inventory, fulfilment and invoicing into one composed workspace
                for agencies, sales representatives and the medical shops they serve.
              </p>
            </Reveal>

            <Reveal delay={260}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/register"
                  className="group inline-flex h-11 items-center gap-2 rounded-lg bg-forest px-5 text-sm font-medium text-white transition-colors hover:bg-brand-800"
                >
                  Create account
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-smooth group-hover:translate-x-0.5" aria-hidden />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-5 text-sm font-medium text-charcoal transition-colors hover:border-brand-300 hover:bg-white"
                >
                  Sign in
                </Link>
              </div>
            </Reveal>

            <Reveal delay={340}>
              <ul className="mt-9 max-w-lg space-y-3">
                {heroBenefits.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-3 border-t border-line/80 pt-3 first:border-t-0 first:pt-0">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sage">
                      <Icon className="h-3.5 w-3.5 text-brand-700" aria-hidden />
                    </span>
                    <span className="text-[13px] leading-6 text-navy-700">{text}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <p className="mt-8 text-[11px] uppercase tracking-[.14em] text-muted">
              Agency administration · Field sales · Medical retail
            </p>
          </div>

          <div className="pb-6 lg:pb-2">
            <Reveal delay={160}>
              <Parallax speed={10} className="relative">
                <Tilt max={3.5} scale={1.005} className="relative">
                  <figure className="group aspect-[4/5] overflow-hidden rounded-xl border border-line bg-white shadow-lift">
                    <img
                      src="/images/hero-pharmacist.jpg"
                      alt="A pharmacist working at the dispensing counter with a barcode scanner, organised medicine shelves behind him"
                      width={1600}
                      height={2400}
                      loading="eager"
                      decoding="async"
                      className="reveal-scale h-full w-full object-cover object-[38%_22%] transition-transform duration-[900ms] ease-smooth group-hover:scale-[1.03]"
                    />
                  </figure>
                </Tilt>

                <Reveal delay={480} className="relative mt-4 lg:absolute lg:-bottom-6 lg:-left-6 lg:mt-0">
                  <FulfilmentQueueCard />
                </Reveal>

                <Reveal delay={620} className="hidden sm:block sm:absolute sm:right-4 sm:top-3 lg:-top-5 lg:right-8">
                  <StockAlertCard />
                </Reveal>
              </Parallax>
            </Reveal>

            <p className="mt-6 flex items-center gap-2 text-[11px] leading-5 text-muted lg:justify-end">
              <Barcode className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />
              Illustrative preview · live figures always come from authorised records
            </p>
          </div>
        </div>
      </section>

      <div className="border-b border-line bg-sage/70">
        <div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-8 sm:grid-cols-3 sm:gap-6 sm:px-6 lg:px-8">
          {[
            { icon: ClipboardCheck, title: 'Accurate inventory', text: 'Stock verified by batch and expiry date.', blue: false },
            { icon: PackageCheck, title: 'Reliable fulfilment', text: 'Orders confirmed, packed and dispatched in sequence.', blue: true },
            { icon: ReceiptText, title: 'Clear accounts', text: 'Invoices and payments kept on the record.', blue: false },
          ].map(({ icon: Icon, title, text, blue }) => (
            <div key={title} className="flex items-start gap-3.5">
              <span
                className={
                  blue
                    ? 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-azure-50 text-azure-700 ring-1 ring-inset ring-azure-300/50'
                    : 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700 ring-1 ring-inset ring-line'
                }
              >
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-charcoal">{title}</h3>
                <p className="mt-1 text-[13px] leading-6 text-muted">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <PageSection tone="white">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div>
            <SectionLabel>Why it exists</SectionLabel>
            <h2 className="mt-3 max-w-sm font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-charcoal sm:text-[36px]">
              Less administration. More certainty.
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-7 text-muted">
              Medical distribution depends on small details being right: the batch, the expiry, the price, the
              acknowledgement. The interface is arranged to keep those details visible.
            </p>
          </div>

          <div className="space-y-7">
            {[
              ['A single operational record', 'The customer, order, allocation, invoice and conversation stay connected as the work moves.'],
              ['Clarity at the point of action', 'Each screen shows the next decision, not a wall of decorative metrics.'],
              ['Accountability by design', 'Tenant-scoped access, guarded transitions and recorded stock movements are part of the product.'],
            ].map(([title, text], index) => (
              <div key={title} className="grid gap-4 border-t border-line pt-6 sm:grid-cols-[auto_1fr] sm:gap-6">
                <span className="font-display text-[13px] font-medium text-brand-700">
                  0{index + 1}
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold text-charcoal">{title}</h3>
                  <p className="mt-1.5 max-w-xl text-sm leading-7 text-muted">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </PageSection>

      <PageSection tone="parchment">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <SectionLabel>The workflow</SectionLabel>
            <h2 className="mt-3 font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-charcoal sm:text-[36px]">
              From catalogue to confirmed delivery.
            </h2>
          </div>
          <Link
            to="/how-it-works"
            className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 transition-colors hover:text-brand-800"
          >
            See the full process <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-12">
          <div className="mb-4 flex items-center gap-4">
            <p className="shrink-0 text-[11px] font-medium uppercase tracking-[.14em] text-muted">
              Step {activeStep + 1} of {workflowSteps.length}
            </p>
            <div className="flex flex-1 items-center gap-1.5 sm:max-w-xs" aria-hidden>
              {workflowSteps.map((step, index) => (
                <span
                  key={step.title}
                  className={cn(
                    'h-1 flex-1 rounded-full transition-colors duration-300 ease-smooth',
                    index <= activeStep ? 'bg-brand-600' : 'bg-line',
                  )}
                />
              ))}
            </div>
          </div>

          <ol className="grid gap-4 md:grid-cols-4 md:gap-6">
            {workflowSteps.map(({ icon: Icon, title, text, detail }, index) => {
              const active = index === activeStep;
              return (
                <li key={title} className="relative h-full">
                  {index < workflowSteps.length - 1 && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -right-6 top-1/2 z-10 hidden w-6 -translate-y-1/2 items-center justify-center md:flex"
                    >
                      <span
                        className={cn(
                          'h-px w-2 transition-colors duration-300',
                          index < activeStep ? 'bg-brand-500' : 'bg-line',
                        )}
                      />
                      <ArrowRight
                        className={cn(
                          'h-3 w-3 shrink-0 transition-colors duration-300',
                          index < activeStep ? 'text-brand-600' : 'text-navy-300',
                        )}
                      />
                    </span>
                  )}
                  <Reveal delay={index * 70} className="h-full">
                    <button
                      type="button"
                      onClick={() => setActiveStep(index)}
                      onMouseEnter={() => setActiveStep(index)}
                      onFocus={() => setActiveStep(index)}
                      aria-pressed={active}
                      className={cn(
                        'group flex h-full w-full flex-col rounded-xl border p-5 text-left transition-all duration-300 ease-smooth',
                        active
                          ? 'border-brand-300 bg-white shadow-soft md:-translate-y-1'
                          : 'border-line bg-white/50 hover:border-brand-200 hover:bg-white',
                      )}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span
                          className={cn(
                            'inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-300',
                            active ? 'bg-forest text-white' : 'bg-sage text-brand-700',
                          )}
                        >
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="font-display text-[12px] font-medium tracking-[.12em] text-brand-700">
                          0{index + 1}
                        </span>
                      </span>
                      <span className="mt-4 font-display text-[21px] font-semibold tracking-[-0.02em] text-charcoal">
                        {title}
                      </span>
                      <span className="mt-2.5 block text-sm leading-7 text-muted">{text}</span>
                      <span
                        className={cn(
                          'block overflow-hidden text-[12px] leading-6 text-brand-800 transition-all duration-300 ease-smooth',
                          active ? 'mt-3 max-h-24 opacity-100' : 'mt-0 max-h-0 opacity-0',
                        )}
                      >
                        {detail}
                      </span>
                      <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-[11px] font-medium uppercase tracking-[.12em] text-brand-700">
                        {active ? 'In view' : 'Inspect step'}
                        <ArrowRight
                          className={cn(
                            'h-3 w-3 transition-transform duration-200 ease-smooth group-hover:translate-x-0.5',
                            active && 'translate-x-0.5',
                          )}
                          aria-hidden
                        />
                      </span>
                    </button>
                  </Reveal>
                </li>
              );
            })}
          </ol>
        </div>
      </PageSection>

      <PageSection tone="white">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
          <div>
            <SectionLabel>Inventory, in plain sight</SectionLabel>
            <h2 className="mt-3 font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-charcoal sm:text-[36px]">
              Stock you can account for.
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-7 text-muted">
              Batches, expiry windows and stock positions are presented as operational facts. Alerts stay concise so
              they help rather than compete for attention.
            </p>

            <dl className="mt-8 space-y-5">
              {capabilities.map((item) => (
                <div key={item.title} className="border-t border-line pt-5">
                  <dt className="text-[15px] font-semibold text-charcoal">{item.title}</dt>
                  <dd className="mt-1.5 text-sm leading-7 text-muted">{item.text}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="lg:pl-6">
            <InventoryPreview />
            <p className="mt-3 text-[11px] leading-5 text-muted">
              Illustrative interface preview. Expiry and availability are always evaluated by the service.
            </p>
          </div>
        </div>
      </PageSection>

      <PageSection tone="ivory">
        <div className="max-w-2xl">
          <SectionLabel>Three points of view</SectionLabel>
          <h2 className="mt-3 font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-charcoal sm:text-[36px]">
            One platform. Each role sees the work that belongs to them.
          </h2>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-3 lg:gap-6">
          {roles.map(({ icon: Icon, label, title, text, points }, index) => (
            <Reveal key={label} delay={index * 80} className="h-full">
              <article className="group flex h-full flex-col rounded-xl border border-line bg-white/60 p-6 transition-all duration-300 ease-smooth hover:-translate-y-1 hover:border-brand-200 hover:bg-white hover:shadow-panel">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-sage text-brand-700 transition-colors duration-300 group-hover:bg-forest group-hover:text-white">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <p className="mt-5 text-[11px] font-medium uppercase tracking-[.14em] text-brand-700">{label}</p>
                <h3 className="mt-3 font-display text-[22px] font-semibold leading-[1.25] tracking-[-0.02em] text-charcoal">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted">{text}</p>
                <ul className="mt-5 space-y-2">
                  {points.map((point) => (
                    <li key={point} className="flex gap-2.5 text-[13px] leading-6 text-navy-700">
                      <span aria-hidden className="mt-2.5 h-px w-3 shrink-0 bg-brand-500" />
                      {point}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/login"
                  className="mt-auto inline-flex items-center gap-1.5 pt-6 text-[13px] font-medium text-brand-700 transition-colors hover:text-brand-800"
                >
                  Open this workspace
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 ease-smooth group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </article>
            </Reveal>
          ))}
        </div>
      </PageSection>

      <CtaBand
        title="A quieter way to run medical distribution."
        description="Create an account for your organisation, or speak with the team about catalogue access and onboarding."
      />
    </>
  );
}
