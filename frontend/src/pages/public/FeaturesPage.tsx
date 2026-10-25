import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { SEO } from '@/components/ui/SEO';
import { CtaBand, PageHero, PageSection, SectionLabel } from '@/components/landing/Editorial';

const groups = [
  {
    title: 'For customers',
    items: [
      {
        title: 'Searchable catalogue',
        text: 'Find products and build a multi-line draft with server-resolved commercial values.',
      },
      {
        title: 'Fast repeat ordering',
        text: 'Create a new draft from historical orders without changing the original record.',
      },
      {
        title: 'Invoices and history',
        text: 'Review account-scoped documents and use print-friendly invoice views.',
      },
      {
        title: 'Requirement uploads',
        text: 'Attach procurement documents and follow their review status.',
      },
    ],
  },
  {
    title: 'For sales teams',
    items: [
      {
        title: 'Assigned accounts',
        text: 'Work from a focused customer list with direct call and message actions.',
      },
      {
        title: 'Account messaging',
        text: 'Keep order-linked conversations available to authorised participants.',
      },
      {
        title: 'Follow-up planning',
        text: 'Create dated tasks and update their working status.',
      },
    ],
  },
  {
    title: 'For agency teams',
    items: [
      {
        title: 'Controlled onboarding',
        text: 'Review customer access, manage sales coverage and keep role boundaries visible.',
      },
      {
        title: 'Inventory operations',
        text: 'Receive batch stock, record signed adjustments and monitor expiry and low-stock views.',
      },
      {
        title: 'Real reporting',
        text: 'Use service aggregates and real exports rather than decorative sample metrics.',
      },
      {
        title: 'Live updates',
        text: 'Socket events refresh orders, messages and notifications when available.',
      },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <SEO
        title="Features"
        description="Explore customer, salesman and agency administration features in the Supply Medicals medical supply workspace."
      />

      <PageHero
        eyebrow="Features"
        title={
          <>
            Purposeful tools for <span className="text-brand-700">every role</span>.
          </>
        }
        intro="No one-size-fits-all dashboard. Each workspace keeps the most important operational actions close at hand."
        aside={
          <div className="border-t border-line pt-5 text-sm leading-7 text-muted">
            <p className="font-medium text-charcoal">Designed around real work</p>
            <p className="mt-1.5">
              Ordering, stock, fulfilment and reconciliation each have a clear place — and nothing is added merely to
              fill space.
            </p>
          </div>
        }
      />

      <PageSection tone="white">
        <div className="space-y-14">
          {groups.map((group) => (
            <div key={group.title}>
              <div className="flex items-end justify-between gap-4 border-b border-line pb-4">
                <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-charcoal">
                  {group.title}
                </h2>
                <span className="text-[11px] font-medium uppercase tracking-[.14em] text-muted">
                  {group.items.length} capabilities
                </span>
              </div>
              <div className="grid gap-x-10 gap-y-8 pt-8 sm:grid-cols-2 lg:grid-cols-4">
                {group.items.map((item) => (
                  <article key={item.title}>
                    <h3 className="text-[15px] font-semibold text-charcoal">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-muted">{item.text}</p>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection tone="parchment">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <SectionLabel>Security</SectionLabel>
            <h2 className="mt-3 font-display text-[28px] font-semibold leading-[1.2] tracking-[-0.025em] text-charcoal sm:text-[32px]">
              Security is a workflow, not a label.
            </h2>
          </div>
          <div className="max-w-xl space-y-5 border-l border-navy-300/60 pl-6 text-sm leading-7 text-muted sm:pl-8">
            <p>
              The frontend never decides authorisation. Role guards improve navigation, while the API remains
              responsible for access, validation and state transitions.
            </p>
            <p>
              Data is scoped to the authenticated agency and account. Sensitive actions are explicit, and every stock
              change leaves an attributable record.
            </p>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 transition-colors hover:text-brand-800"
            >
              Request organisation access <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </PageSection>

      <CtaBand
        title="See how the workspace fits your operation."
        description="Request an account for your organisation or speak with the team about catalogue access and onboarding."
      />
    </>
  );
}
