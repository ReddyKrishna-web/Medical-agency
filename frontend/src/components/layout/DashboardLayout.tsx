import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandMenu } from './CommandMenu';
import { NotificationPanel } from './NotificationPanel';
import { mobileNavigation } from './navigation';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export default function DashboardLayout() {
  const { user } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setDrawer(false);
  }, [location.pathname]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!user) return null;

  const mobile = mobileNavigation[user.role];

  return (
    <div className="min-h-screen bg-ivory">
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">
        <Sidebar />
      </div>

      {drawer && (
        <>
          <button
            className="fixed inset-0 z-40 bg-charcoal/35 lg:hidden"
            onClick={() => setDrawer(false)}
            aria-label="Close navigation"
          />
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
            <Sidebar mobile onClose={() => setDrawer(false)} />
          </div>
        </>
      )}

      <div className="lg:pl-[16.5rem]">
        <Topbar
          onMenu={() => setDrawer(true)}
          onSearch={() => setSearch(true)}
          onNotifications={() => setNotifications(true)}
        />
        <main
          id="main-content"
          className="min-h-[calc(100vh-4rem)] px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10"
        >
          <div className="mx-auto max-w-[1440px]">
            <Outlet />
          </div>
        </main>
      </div>

      <nav
        aria-label="Mobile primary navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white/95 px-1 pb-[max(.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur lg:hidden"
      >
        {mobile.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[10px] font-medium transition-colors',
                  isActive ? 'bg-sage/70 text-brand-800' : 'text-muted hover:text-charcoal',
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <CommandMenu open={search} onClose={() => setSearch(false)} />
      <NotificationPanel open={notifications} onClose={() => setNotifications(false)} />
    </div>
  );
}
