import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { SEO } from '@/components/ui/SEO';
import { CtaBand, PageHero, PageSection, SectionLabel } from '@/components/landing/Editorial';

const principles = [
  {
    title: 'Accountability',
    text: 'Order changes, approvals and key actions remain attributable and visible to the people responsible for them.',
  },
  {
    title: 'Partnership',
    text: 'A shared workspace helps customers and sales representatives work from consistent information.',
  },
  {
    title: 'Transparency',
    text: 'Customers can understand order stages, invoice status and next actions without jargon.',
  },
  {
    title: 'Purpose',
    text: 'We focus on operational procurement — not diagnosis, treatment recommendations or clinical advice.',
  },
];

export default function AboutPage() {
  return (
    <>
      <SEO
        title="About"
        description="Learn how Supply Medicals approaches medical supply procurement, customer relationships and accountable digital operations."
      />

      <PageHero
        eyebrow="About Supply Medicals"
        title={
          <>
            Healthcare procurement should feel <span className="text-brand-700">accountable</span> at every step.
          </>
        }
        intro="Supply Medicals is designed for organisations that need a more dependable way to source supplies, coordinate with account representatives and follow order progress."
      />

      <PageSection tone="white">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <SectionLabel>Our approach</SectionLabel>
            <h2 className="mt-3 font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-charcoal sm:text-[36px]">
              Clarity over complexity.
            </h2>
          </div>
          <div className="max-w-2xl space-y-5 border-l border-line pl-6 text-[15px] leading-8 text-muted sm:pl-8">
            <p>
              Supply Medicals is designed around the real handoffs in B2B medical supply: a customer request, an
              approval, a validated order, fulfilment, and an ongoing relationship.
            </p>
            <p>
              We keep the interface direct and the security model explicit. Access is granted by role, sensitive
              actions require clear intent, and the service — not a client-side screen — remains the source of truth.
            </p>
          </div>
        </div>
      </PageSection>

      <PageSection tone="parchment">
        <div className="max-w-2xl">
          <SectionLabel>What guides the service</SectionLabel>
          <h2 className="mt-3 font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-charcoal sm:text-[36px]">
            Principles that shape every screen.
          </h2>
        </div>

        <div className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2">
          {principles.map((item, index) => (
            <article key={item.title} className="border-t border-navy-300/60 pt-5">
              <span className="text-[11px] font-medium uppercase tracking-[.14em] text-muted">0{index + 1}</span>
              <h3 className="mt-2 text-[17px] font-semibold text-charcoal">{item.title}</h3>
              <p className="mt-2 max-w-md text-sm leading-7 text-muted">{item.text}</p>
            </article>
          ))}
        </div>
      </PageSection>

      <PageSection tone="white">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <SectionLabel>The people behind the platform</SectionLabel>
            <h2 className="mt-3 font-display text-[28px] font-semibold leading-[1.2] tracking-[-0.025em] text-charcoal">
              Talk to our supply team.
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted">
              Ask about onboarding, catalogue access or a fit for your organisation.
            </p>
          </div>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 transition-colors hover:text-brand-800"
          >
            Start a conversation <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </PageSection>

      <CtaBand
        title="Built for the work behind the order."
        description="Speak with the team about your distribution operation, or create an account for your organisation."
        primaryLabel="Create account"
        secondaryLabel="Contact the team"
      />
    </>
  );
}
