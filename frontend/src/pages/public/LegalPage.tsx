import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SEO } from '@/components/ui/SEO';

function LegalLayout({
  title,
  updated,
  warning,
  children,
}: {
  title: string;
  updated: string;
  warning: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-ivory">
      <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-[11px] font-medium uppercase tracking-[.14em] text-brand-700">Legal</p>
        <h1 className="mt-3 font-display text-[34px] font-semibold tracking-[-0.03em] text-charcoal sm:text-[42px]">
          {title}
        </h1>
        <p className="mt-3 text-sm text-muted">{updated}</p>

        <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          {warning}
        </p>

        <div className="mt-10 space-y-8 rounded-xl border border-line bg-white p-6 sm:p-10">{children}</div>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[17px] font-semibold text-charcoal">{title}</h2>
      <div className="mt-2.5 text-sm leading-7 text-muted">{children}</div>
    </section>
  );
}

export function PrivacyPage() {
  return (
    <>
      <SEO
        title="Privacy notice"
        description="Privacy notice information for the Supply Medicals service."
        noIndex
      />
      <LegalLayout
        title="Privacy notice"
        updated="Last updated: review before launch"
        warning="Review required: This is an informative privacy notice placeholder and is not legal advice. The deploying agency must review and replace it before production use."
      >
        <Section title="Information this service may process">
          <p>
            Account, organisation, order, invoice, message, notification and uploaded requirement information may be
            processed to provide and secure the service. Access tokens are held in browser memory; the refresh token is
            intended to use an HttpOnly cookie.
          </p>
        </Section>
        <Section title="Purpose and access">
          <p>
            Information should only be used for legitimate service operations, account administration, communication,
            security and legal obligations. Access is limited by authenticated role and account scope.
          </p>
        </Section>
        <Section title="Retention, rights and contacts">
          <p>
            Retention periods, data-subject rights, processors, geographic hosting and the responsible agency contact
            must be completed by the deploying organisation. The configured service email is available on the{' '}
            <Link to="/contact" className="font-medium text-brand-700 underline decoration-line underline-offset-4">
              contact page
            </Link>
            .
          </p>
        </Section>
      </LegalLayout>
    </>
  );
}

export function TermsPage() {
  return (
    <>
      <SEO title="Terms of service" description="Terms of service information for the Supply Medicals platform." noIndex />
      <LegalLayout
        title="Terms of service"
        updated="Last updated: review before launch"
        warning="Review required: These terms are an informative placeholder and have not been approved for production deployment."
      >
        <Section title="Service scope">
          <p>
            Supply Medicals provides procurement, account communication and administrative workflows for medical
            supplies. It does not provide diagnosis, treatment or medical advice.
          </p>
        </Section>
        <Section title="Accounts and acceptable use">
          <p>
            Users must provide accurate account information, protect their sessions and use the service only for
            authorised business purposes. The deploying agency must define commercial terms, liability limitations,
            governing law and dispute procedures.
          </p>
        </Section>
        <Section title="Orders, prices and availability">
          <p>
            The API is authoritative for customer permissions, product pricing, tax, stock validation, payment records
            and allowed order transitions. Final commercial terms must be added before launch.
          </p>
        </Section>
        <Section title="Contact">
          <p>
            Questions can be raised through the{' '}
            <Link to="/contact" className="font-medium text-brand-700 underline decoration-line underline-offset-4">
              contact page
            </Link>
            . A formal legal entity name and address must be inserted by the deploying agency.
          </p>
        </Section>
      </LegalLayout>
    </>
  );
}
