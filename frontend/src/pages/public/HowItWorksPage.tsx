import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ClipboardCheck, FileSearch, MessageSquareText, PackageCheck, Route, ScanSearch, ShieldCheck, Truck, Users } from 'lucide-react';
import { SEO } from '@/components/ui/SEO';

const steps = [
  { icon: ScanSearch, title: 'Search', text: 'The customer or assigned salesman finds an active product and checks authorized availability.' },
  { icon: FileSearch, title: 'Order', text: 'Quantities are entered as separate lines. The browser never sets authoritative price or tax.' },
  { icon: ShieldCheck, title: 'Confirm', text: 'Agency staff review the customer, products and stock before confirming fulfilment.' },
  { icon: PackageCheck, title: 'Process', text: 'Valid non-expired batches are allocated by earliest expiry and stock movements are recorded.' },
  { icon: Truck, title: 'Dispatch', text: 'Packing and dispatch are recorded against the same order with timestamped status history.' },
  { icon: Route, title: 'Track', text: 'The customer sees the verified status update in the workspace and through the real-time channel.' },
  { icon: ClipboardCheck, title: 'Reorder', text: 'A delivered order can be copied into a new draft. The original order and invoice are never modified.' },
];

const actors = [
  { icon: Users, title: 'Medical shop', points: ['Search and order', 'Upload requirements', 'Track status', 'View invoices'] },
  { icon: MessageSquareText, title: 'Assigned salesman', points: ['Manage assigned shops', 'Record follow-ups', 'Create orders', 'Message customers'] },
  { icon: PackageCheck, title: 'Agency team', points: ['Approve accounts', 'Manage catalog and batches', 'Process orders', 'Review real reports'] },
];

export default function HowItWorksPage() {
  return (
    <>
      <SEO title="How Supply Medicals Works" description="See how customers, salesmen and a medical agency move from product search to order confirmation, dispatch, tracking and reorder." />
      <section className="bg-ink py-20 text-white sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-medical-300">How it works</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight sm:text-5xl">Search → Order → Confirm → Process → Dispatch → Track → Reorder</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">Every step updates the same authorized order record. Customers see progress; the agency retains operational control; stock movements remain auditable.</p>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <ol className="space-y-5">
            {steps.map((step, index) => (
              <li key={step.title} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft sm:grid-cols-[auto_1fr] sm:p-6">
                <div className="flex items-center gap-3 sm:block">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-700"><step.icon className="h-5 w-5" /></span>
                  <span className="text-xs font-extrabold uppercase tracking-widest text-slate-400 sm:mt-3 sm:block">Step {index + 1}</span>
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-ink">{step.title}</h2>
                  <p className="mt-2 leading-7 text-slate-600">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-medical-700">One workflow, three roles</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">Each participant sees the work they are responsible for.</h2>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {actors.map((actor) => (
              <article key={actor.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-medical-300"><actor.icon className="h-5 w-5" /></span>
                <h3 className="mt-5 text-lg font-extrabold text-ink">{actor.title}</h3>
                <ul className="mt-4 space-y-3 text-sm text-slate-600">
                  {actor.points.map((point) => <li key={point} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-medical-600" /> {point}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-extrabold tracking-tight text-ink">Start with an account request.</h2>
          <p className="mt-4 text-lg leading-8 text-slate-600">The agency reviews the medical shop before ordering access is enabled. No public user can create an agency administrator account.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-700 px-6 text-sm font-extrabold text-white hover:bg-brand-800">Get Started <ArrowRight className="h-4 w-4" /></Link>
            <Link to="/contact" className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 px-6 text-sm font-extrabold text-ink hover:border-brand-300">Talk to Us</Link>
          </div>
        </div>
      </section>
    </>
  );
}
