import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { SEO } from '@/components/ui/SEO';
import { CtaBand, PageHero, PageSection, SectionLabel } from '@/components/landing/Editorial';

const audiences = [
  {
    title: 'Healthcare organisations',
    text: 'Create repeat-order drafts, maintain requirement records and keep purchasing history organised.',
  },
  {
    title: 'Clinical practices',
    text: 'Coordinate approved supplies and account communication through a shared operational workflow.',
  },
  {
    title: 'Medical suppliers',
    text: 'Give account teams and administrators a structured view of demand, fulfilment and stock.',
  },
  {
    title: 'Distributors',
    text: 'Support customer ordering, assigned sales coverage and consistent order processing.',
  },
];

const processSteps = [
  { title: 'Request or build an order', text: 'Upload a requirement or search products into a bulk draft.' },
  { title: 'Review and validate', text: 'The service resolves visibility, sellable stock, price and tax.' },
  { title: 'Process and follow', text: 'Agency staff move the order through controlled fulfilment states.' },
  { title: 'Close the loop', text: 'Review delivery details, invoice status and ongoing messages.' },
];

export default function SolutionsPage() {
  return (
    <>
      <SEO
        title="Solutions"
        description="Supply Medicals supports healthcare organisations, clinical practices, suppliers and distributors with a shared medical supply workflow."
      />

      <PageHero
        eyebrow="Solutions"
        title={
          <>
            One operating rhythm across <span className="text-brand-700">procurement and supply</span>.
          </>
        }
        intro="Choose the workspace that matches how your organisation buys, sells and supports medical supplies."
        aside={
          <div className="border-t border-line pt-5 text-sm leading-7 text-muted">
            <p className="font-medium text-charcoal">Three connected workspaces</p>
            <p className="mt-1.5">
              Agency administration, field sales and medical retail share the same order record and the same
              permissions model.
            </p>
          </div>
        }
      />

      <PageSection tone="white">
        <div className="max-w-2xl">
          <SectionLabel>Who it serves</SectionLabel>
          <h2 className="mt-3 font-display text-[28px] font-semibold leading-[1.2] tracking-[-0.025em] text-charcoal sm:text-[32px]">
            A shared record for everyone in the supply chain.
          </h2>
        </div>

        <div className="mt-12 grid gap-x-12 gap-y-9 sm:grid-cols-2">
          {audiences.map((item, index) => (
            <article key={item.title} className="border-t border-line pt-5">
              <span className="text-[11px] font-medium uppercase tracking-[.14em] text-muted">0{index + 1}</span>
              <h3 className="mt-2 font-display text-[21px] font-semibold tracking-[-0.02em] text-charcoal">{item.title}</h3>
              <p className="mt-2 max-w-md text-sm leading-7 text-muted">{item.text}</p>
              <Link
                to="/register"
                className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-700 transition-colors hover:text-brand-800"
              >
                Create account <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </article>
          ))}
        </div>
      </PageSection>

      <PageSection tone="parchment">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <SectionLabel>A connected process</SectionLabel>
            <h2 className="mt-3 font-display text-[28px] font-semibold leading-[1.2] tracking-[-0.025em] text-charcoal sm:text-[32px]">
              From request to delivery.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-7 text-muted">
              Each step uses the API contract to validate the actor, resolve commercial values and record state
              changes.
            </p>
          </div>

          <ol className="divide-y divide-line border-y border-line">
            {processSteps.map((item, index) => (
              <li key={item.title} className="grid gap-3 py-5 sm:grid-cols-[auto_1fr] sm:gap-6">
                <span className="font-display text-[13px] font-medium text-brand-700">0{index + 1}</span>
                <div>
                  <h3 className="text-[15px] font-semibold text-charcoal">{item.title}</h3>
                  <p className="mt-1 text-sm leading-7 text-muted">{item.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </PageSection>

      <CtaBand
        title="Start with an account."
        description="Create a shop or sales account and begin immediately. Agency administrator accounts are provisioned by the platform, not self-registered."
      />
    </>
  );
}
