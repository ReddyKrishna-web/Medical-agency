import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Mail, MapPin, Phone } from 'lucide-react';
import { publicApi } from '@/lib/api';
import { mapAgencySummary } from '@/lib/adapters';
import { Logo } from '@/components/Logo';

export function PublicFooter() {
  const agency = useQuery({
    queryKey: ['public-agency'],
    queryFn: async () => mapAgencySummary(await publicApi.agency()),
    staleTime: 300_000,
    retry: false,
  }).data;

  const configuredEmail = import.meta.env.VITE_CONTACT_EMAIL as string | undefined;
  const email = agency?.contact?.email || configuredEmail || '';
  const agencyName = agency?.name || 'Supply Medicals';
  const address = agency?.contact?.address;
  const addressText = address
    ? [
        address.line1,
        address.line2,
        [address.city, address.state, address.postalCode].filter(Boolean).join(', '),
        address.country,
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  return (
    <footer className="border-t border-white/10 bg-charcoal text-white/70">
      <div className="mx-auto max-w-[1240px] px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Logo light />
            <p className="mt-5 max-w-md text-sm leading-7 text-white/55">
              A focused workspace for healthcare organisations to source medical supplies, manage orders and stay
              connected with their account team.
            </p>
          </div>

          <div>
            <h2 className="text-[11px] font-medium uppercase tracking-[.14em] text-white/45">Company</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {[
                ['/about', 'About us'],
                ['/solutions', 'Solutions'],
                ['/features', 'Features'],
                ['/how-it-works', 'How it works'],
                ['/contact', 'Contact'],
              ].map(([to, label]) => (
                <li key={to}>
                  <Link className="transition-colors hover:text-white" to={to}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-[11px] font-medium uppercase tracking-[.14em] text-white/45">Account</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link className="transition-colors hover:text-white" to="/login">
                  Sign in
                </Link>
              </li>
              <li>
                <Link className="transition-colors hover:text-white" to="/register">
                  Create account
                </Link>
              </li>
              {email && (
                <li>
                  <a className="flex items-center gap-2 transition-colors hover:text-white" href={`mailto:${email}`}>
                    <Mail className="h-4 w-4 shrink-0" /> <span className="break-all">{email}</span>
                  </a>
                </li>
              )}
              {agency?.contact?.phone && (
                <li>
                  <a
                    className="flex items-center gap-2 transition-colors hover:text-white"
                    href={`tel:${agency.contact.phone}`}
                  >
                    <Phone className="h-4 w-4 shrink-0" /> {agency.contact.phone}
                  </a>
                </li>
              )}
              {addressText && (
                <li>
                  <span className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="whitespace-pre-line">{addressText}</span>
                  </span>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} {agencyName}. All rights reserved.
          </p>
          <div className="flex flex-wrap gap-5">
            <Link to="/privacy" className="transition-colors hover:text-white">
              Privacy
            </Link>
            <Link to="/terms" className="transition-colors hover:text-white">
              Terms
            </Link>
            <Link to="/contact" className="transition-colors hover:text-white">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
