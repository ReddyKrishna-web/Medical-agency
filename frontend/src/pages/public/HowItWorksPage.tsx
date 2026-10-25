import { SEO } from '@/components/ui/SEO';
import { CtaBand, PageHero, PageSection, SectionLabel } from '@/components/landing/Editorial';

const steps = [
  { title: 'Search', text: 'The customer or assigned salesman finds an active product and checks authorised availability.' },
  { title: 'Order', text: 'Quantities are entered as separate lines. The browser never sets authoritative price or tax.' },
  { title: 'Confirm', text: 'Agency staff review the customer, products and stock before confirming fulfilment.' },
  { title: 'Process', text: 'Valid non-expired batches are allocated by earliest expiry and stock movements are recorded.' },
  { title: 'Dispatch', text: 'Packing and dispatch are recorded against the same order with timestamped status history.' },
  { title: 'Track', text: 'The customer sees the verified status update in the workspace and through the real-time channel.' },
  { title: 'Reorder', text: 'A delivered order can be copied into a new draft. The original order and invoice are never modified.' },
];

const actors = [
  {
    label: 'Medical shop',
    points: ['Search and order', 'Upload requirements', 'Track status', 'View invoices'],
  },
  {
    label: 'Assigned salesman',
    points: ['Manage assigned shops', 'Record follow-ups', 'Create orders', 'Message customers'],
  },
  {
    label: 'Agency team',
    points: ['Manage account status', 'Manage catalogue and batches', 'Process orders', 'Review real reports'],
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <SEO
        title="How Supply Medicals Works"
        description="See how customers, salesmen and a medical agency move from product search to order confirmation, dispatch, tracking and reorder."
      />

      <PageHero
        eyebrow="How it works"
        title={
          <>
            Search, order, confirm, dispatch, <span className="text-brand-700">reorder</span>.
          </>
        }
        intro="Every step updates the same authorised order record. Customers see progress; the agency retains operational control; stock movements remain auditable."
        aside={
          <div className="border-t border-line pt-5 text-sm leading-7 text-muted">
            <p className="font-medium text-charcoal">A single record</p>
            <p className="mt-1.5">
              The catalogue, order, batch allocation, invoice and conversation stay connected from first request to
              final payment.
            </p>
          </div>
        }
      />

      <PageSection tone="white">
        <div className="max-w-2xl">
          <SectionLabel>The process</SectionLabel>
          <h2 className="mt-3 font-display text-[28px] font-semibold leading-[1.2] tracking-[-0.025em] text-charcoal sm:text-[32px]">
            Seven steps, one accountable record.
          </h2>
        </div>

        <ol className="mt-10 divide-y divide-line border-y border-line">
          {steps.map((step, index) => (
            <li key={step.title} className="grid gap-3 py-6 sm:grid-cols-[auto_1fr_1.4fr] sm:items-start sm:gap-8">
              <span className="font-display text-[13px] font-medium text-brand-700">0{index + 1}</span>
              <h3 className="font-display text-[20px] font-semibold tracking-[-0.02em] text-charcoal">{step.title}</h3>
              <p className="max-w-xl text-sm leading-7 text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </PageSection>

      <PageSection tone="parchment">
        <div className="max-w-2xl">
          <SectionLabel>One workflow, three roles</SectionLabel>
          <h2 className="mt-3 font-display text-[28px] font-semibold leading-[1.2] tracking-[-0.025em] text-charcoal sm:text-[32px]">
            Each participant sees the work they are responsible for.
          </h2>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-3 lg:gap-0">
          {actors.map((actor, index) => (
            <div
              key={actor.label}
              className={
                index > 0
                  ? 'border-t border-navy-300/60 pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0'
                  : 'lg:pr-10'
              }
            >
              <p className="text-[11px] font-medium uppercase tracking-[.14em] text-brand-700">{actor.label}</p>
              <ul className="mt-4 space-y-2.5">
                {actor.points.map((point) => (
                  <li key={point} className="flex gap-2.5 text-sm leading-6 text-navy-700">
                    <span aria-hidden className="mt-2.5 h-px w-3 shrink-0 bg-brand-500" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </PageSection>

      <CtaBand
        title="Start with an account."
        description="Shops and sales representatives can create and use their account right away. No public user can create an agency administrator account."
      />
    </>
  );
}
