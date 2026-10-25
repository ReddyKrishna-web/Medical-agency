import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronDown, LogOut, Menu, Search, UserRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import { useToast } from '@/contexts/ToastContext';
import { apiMeta } from '@/lib/api';
import { initials } from '@/lib/utils';
import { roleLabel, roleWorkspace } from '@/lib/status';
import { cn } from '@/lib/utils';
import { pageNames } from './navigation';
import type { AppNotification } from '@/types/api';

export function Topbar({
  onMenu,
  onSearch,
  onNotifications,
}: {
  onMenu: () => void;
  onSearch: () => void;
  onNotifications: () => void;
}) {
  const { user, logout } = useAuth();
  const socket = useSocket();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [menu, setMenu] = useState(false);

  const notifications = useQuery({
    queryKey: ['notifications', { limit: 1 }],
    queryFn: () => apiMeta<AppNotification[]>('/notifications', { params: { limit: 1 } }),
    refetchInterval: socket === 'connected' ? 60_000 : 120_000,
  });

  const count = Number(notifications.data?.meta?.unreadCount ?? 0);

  useEffect(() => setMenu(false), [location.pathname]);

  if (!user) return null;

  const segments = location.pathname.split('/').filter(Boolean);
  const last = segments.pop() || 'dashboard';
  // Detail routes end in a document id; title them after the collection instead.
  const isId = /^[0-9a-f]{24}$/i.test(last) || /^[0-9a-f-]{36}$/i.test(last);
  const segment = isId ? segments.pop() || 'dashboard' : last;
  const title =
    pageNames[segment] ||
    segment.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase());

  const signout = async () => {
    await logout();
    showToast('success', 'Signed out');
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button
        onClick={onMenu}
        className="rounded-md p-2 text-navy-600 transition-colors hover:bg-parchment hover:text-charcoal lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-[.14em] text-muted lg:hidden">
          {roleLabel[user.role]}
        </p>
        <h1 className="truncate text-[15px] font-semibold text-charcoal sm:text-base">{title}</h1>
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5">
        <button
          onClick={onSearch}
          className="hidden h-9 w-56 items-center gap-2 rounded-md border border-line bg-ivory px-3 text-[13px] text-muted transition-colors hover:bg-parchment hover:text-charcoal md:flex"
        >
          <Search className="h-4 w-4" />
          <span>Search records</span>
          <kbd className="ml-auto rounded border border-line bg-white px-1.5 py-0.5 text-[10px] font-medium text-muted">
            Ctrl K
          </kbd>
        </button>

        <button
          onClick={onSearch}
          className="rounded-md p-2 text-navy-600 transition-colors hover:bg-parchment hover:text-charcoal md:hidden"
          aria-label="Search"
        >
          <Search className="h-5 w-5" />
        </button>

        <button
          onClick={onNotifications}
          className="relative rounded-md p-2 text-navy-600 transition-colors hover:bg-parchment hover:text-charcoal"
          aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
        >
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-red-600" />
          )}
        </button>

        <div className="relative ml-1">
          <button
            onClick={() => setMenu(!menu)}
            className="flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-parchment"
            aria-expanded={menu}
          >
            <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-sage text-[11px] font-semibold text-brand-800">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                initials(user.name || user.email)
              )}
            </span>
            <span className="hidden max-w-32 truncate text-[13px] font-medium text-charcoal xl:block">
              {user.name}
            </span>
            <ChevronDown className="hidden h-4 w-4 text-muted sm:block" />
          </button>

          {menu && (
            <>
              <button className="fixed inset-0 z-30 cursor-default" onClick={() => setMenu(false)} aria-label="Close account menu" />
              <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-lg border border-line bg-white shadow-lift">
                <div className="border-b border-line p-4">
                  <p className="truncate text-[13px] font-semibold text-charcoal">{user.name}</p>
                  <p className="truncate text-xs text-muted">{user.email}</p>
                  <span className={cn('mt-2 inline-flex rounded-md bg-sage px-2 py-0.5 text-[10px] font-medium uppercase tracking-[.1em] text-brand-800')}>
                    {roleLabel[user.role]}
                  </span>
                  {user.mustChangePassword && (
                    <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-800">
                      Password change required
                    </p>
                  )}
                </div>
                <Link
                  to={`${roleWorkspace[user.role]}/profile`}
                  className="flex items-center gap-3 px-4 py-3 text-[13px] font-medium text-navy-700 transition-colors hover:bg-ivory hover:text-charcoal"
                >
                  <UserRound className="h-4 w-4" /> Profile and security
                </Link>
                <button
                  onClick={signout}
                  className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-[13px] font-medium text-red-700 transition-colors hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
