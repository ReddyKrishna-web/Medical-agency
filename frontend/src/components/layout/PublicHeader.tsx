import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';

const links = [
  { to: '/', label: 'Home' },
  { to: '/solutions', label: 'Solutions' },
  { to: '/features', label: 'Features' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

export function PublicHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Logo />
        <nav aria-label="Main navigation" className="hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) => cn('rounded-lg px-3.5 py-2.5 text-sm font-semibold transition hover:bg-slate-100', isActive ? 'text-brand-700' : 'text-slate-600')}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-2 sm:flex">
          <Link to="/login" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">Login</Link>
          <Link to="/register" className="inline-flex h-11 items-center rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800">Get Started</Link>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="rounded-xl p-2.5 text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 sm:hidden"
          aria-expanded={open}
          aria-controls="public-mobile-menu"
          aria-label="Toggle navigation"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      {open && (
        <div id="public-mobile-menu" className="border-t border-slate-100 bg-white px-4 pb-5 pt-2 shadow-soft sm:hidden">
          <nav className="flex flex-col" aria-label="Mobile navigation">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) => cn('rounded-xl px-3 py-3.5 text-sm font-semibold', isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700')}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
            <Link to="/login" onClick={() => setOpen(false)} className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 text-sm font-semibold text-slate-700">Login</Link>
            <Link to="/register" onClick={() => setOpen(false)} className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-700 text-sm font-semibold text-white">Get Started</Link>
          </div>
        </div>
      )}
    </header>
  );
}
