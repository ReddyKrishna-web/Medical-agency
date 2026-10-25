import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { publicApi } from '@/lib/api';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/solutions', label: 'Solutions' },
  { to: '/features', label: 'Features' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const agency = useQuery({ queryKey: ['public-agency'], queryFn: publicApi.agency, staleTime: 300_000 }).data;

  return (
    <header className="animate-fade-up sticky top-0 z-50 border-b border-line bg-ivory/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Logo />

        <nav aria-label="Main navigation" className="hidden items-center gap-7 text-[13px] font-medium text-navy-700 lg:flex">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  'relative py-1 transition-colors hover:text-charcoal',
                  isActive &&
                    'text-charcoal after:absolute after:inset-x-0 after:-bottom-2 after:h-px after:bg-forest',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            to="/login"
            className="rounded-lg px-3 py-2 text-[13px] font-medium text-navy-700 transition-colors hover:bg-parchment hover:text-charcoal"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="rounded-lg bg-forest px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-800"
          >
            Create account
          </Link>
        </div>

        <button
          type="button"
          className="rounded-md p-2 text-navy-700 transition-colors hover:bg-parchment lg:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label="Toggle navigation"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="animate-slide-down border-t border-line bg-ivory lg:hidden">
          <nav className="mx-auto flex max-w-[1240px] flex-col gap-0.5 px-4 py-4 sm:px-6">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-sage text-brand-800' : 'text-navy-700 hover:bg-parchment hover:text-charcoal',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-navy-700 hover:bg-parchment"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                onClick={() => setOpen(false)}
                className="rounded-md bg-forest px-3 py-2.5 text-center text-sm font-medium text-white"
              >
                Create account
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
