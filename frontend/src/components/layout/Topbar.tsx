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
import type { AppNotification } from '@/types/api';

export function Topbar({ onMenu, onSearch, onNotifications }: { onMenu: () => void; onSearch: () => void; onNotifications: () => void }) {
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

  const segment = location.pathname.split('/').filter(Boolean).pop() || 'dashboard';
  const title = segment.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase());

  const signout = async () => {
    await logout();
    showToast('success', 'Signed out');
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-18 items-center border-b border-slate-200/80 bg-white/95 px-3 backdrop-blur sm:px-5 lg:px-7">
      <button onClick={onMenu} className="mr-2 rounded-xl p-2.5 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open navigation">
        <Menu className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-medical-700 lg:hidden">{roleLabel[user.role]}</p>
        <h1 className="truncate text-base font-extrabold text-ink sm:text-lg">{title}</h1>
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          onClick={onSearch}
          className="hidden h-10 w-56 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 transition hover:border-brand-200 hover:bg-white md:flex"
        >
          <Search className="h-4 w-4" />
          <span>Search anything</span>
          <kbd className="ml-auto rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">Ctrl K</kbd>
        </button>
        <button onClick={onSearch} className="rounded-xl p-2.5 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Search">
          <Search className="h-5 w-5" />
        </button>
        <button
          onClick={onNotifications}
          className="relative rounded-xl p-2.5 text-slate-600 hover:bg-slate-100"
          aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
        >
          <Bell className="h-5 w-5" />
          {count > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />}
        </button>
        <div className="relative">
          <button onClick={() => setMenu(!menu)} className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-slate-100" aria-expanded={menu}>
            <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-brand-100 text-xs font-bold text-brand-800">
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
            <span className="hidden max-w-32 truncate text-sm font-semibold text-slate-700 xl:block">{user.name}</span>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
          </button>
          {menu && (
            <>
              <button className="fixed inset-0 z-30 cursor-default" onClick={() => setMenu(false)} aria-label="Close account menu" />
              <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-panel">
                <div className="border-b border-slate-100 p-4">
                  <p className="truncate text-sm font-bold text-slate-800">{user.name}</p>
                  <p className="truncate text-xs text-slate-500">{user.email}</p>
                  <span className={cn('mt-2 inline-flex rounded-full bg-medical-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-medical-700')}>
                    {roleLabel[user.role]}
                  </span>
                  {user.mustChangePassword && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">
                      Password change required
                    </p>
                  )}
                </div>
                <Link
                  to={`${roleWorkspace[user.role]}/profile`}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <UserRound className="h-4 w-4" /> Profile and security
                </Link>
                <button
                  onClick={signout}
                  className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50"
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
