import { NavLink } from 'react-router-dom';
import { LogOut, X } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { navigation } from './navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { roleLabel } from '@/lib/status';
import { cn } from '@/lib/utils';

export function Sidebar({ mobile, onClose }: { mobile?: boolean; onClose?: () => void }) {
  const { user, logout } = useAuth();
  const { showToast } = useToast();

  if (!user) return null;

  const doLogout = async () => {
    await logout();
    showToast('success', 'Signed out', 'Your session has ended.');
  };

  return (
    <div
      className={cn(
        'flex h-full flex-col border-r border-line bg-ivory',
        mobile ? 'w-[86vw] max-w-[17rem] shadow-lift' : 'w-[16.5rem]',
      )}
    >
      <div className="flex h-16 items-center justify-between border-b border-line px-5">
        <Logo to={navigation[user.role]?.[0]?.items[0]?.to || '/'} />
        {mobile && (
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-parchment hover:text-charcoal"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav
        aria-label={`${user.role} navigation`}
        className="flex-1 space-y-6 overflow-y-auto px-3 py-5"
      >
        {navigation[user.role].map((group, index) => (
          <div key={group.label || index}>
            <p className="mb-2 px-3 text-[10px] font-medium uppercase tracking-[.14em] text-muted/80">
              {group.label || 'Workspace'}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-3 rounded-md border-l-2 px-3 py-2 text-[13.5px] font-medium transition-colors',
                        isActive
                          ? 'border-brand-700 bg-white text-brand-800 shadow-soft'
                          : 'border-transparent text-navy-700 hover:bg-white/70 hover:text-charcoal',
                      )
                    }
                  >
                    <Icon
                      className="h-[17px] w-[17px] shrink-0 text-navy-500 transition-colors group-hover:text-brand-700"
                      aria-hidden
                    />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <div className="mb-2 px-3 py-2">
          <p className="truncate text-[13px] font-medium text-charcoal">{user.name}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted">{roleLabel[user.role]}</p>
        </div>
        <button
          onClick={doLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13.5px] font-medium text-navy-700 transition-colors hover:bg-white hover:text-charcoal"
        >
          <LogOut className="h-[17px] w-[17px]" /> Sign out
        </button>
      </div>
    </div>
  );
}
