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
    <footer className="bg-ink text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Logo light />
            <p className="mt-5 max-w-md text-sm leading-7 text-slate-400">
              A focused digital workspace for healthcare organisations to source medical supplies, manage orders and stay
              connected with their account team.
            </p>
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Company</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <Link className="hover:text-medical-300" to="/about">
                  About us
                </Link>
              </li>
              <li>
                <Link className="hover:text-medical-300" to="/solutions">
                  Solutions
                </Link>
              </li>
              <li>
                <Link className="hover:text-medical-300" to="/features">
                  Features
                </Link>
              </li>
              <li>
                <Link className="hover:text-medical-300" to="/how-it-works">
                  How it works
                </Link>
              </li>
              <li>
                <Link className="hover:text-medical-300" to="/contact">
                  Contact
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Account</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <Link className="hover:text-medical-300" to="/login">
                  Login
                </Link>
              </li>
              <li>
                <Link className="hover:text-medical-300" to="/register">
                  Register
                </Link>
              </li>
              {email && (
                <li>
                  <a className="flex items-center gap-2 hover:text-medical-300" href={`mailto:${email}`}>
                    <Mail className="h-4 w-4" /> <span className="break-all">{email}</span>
                  </a>
                </li>
              )}
              {agency?.contact?.phone && (
                <li>
                  <a className="flex items-center gap-2 hover:text-medical-300" href={`tel:${agency.contact.phone}`}>
                    <Phone className="h-4 w-4" /> {agency.contact.phone}
                  </a>
                </li>
              )}
              {addressText && (
                <li>
                  <span className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4" /> <span className="whitespace-pre-line">{addressText}</span>
                  </span>
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} {agencyName}. All rights reserved.
          </p>
          <div className="flex flex-wrap gap-5">
            <Link to="/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-white">
              Terms
            </Link>
            <Link to="/contact" className="hover:text-white">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
