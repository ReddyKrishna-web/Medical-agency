import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { roleHome } from '@/lib/status';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState, LoadingState } from '@/components/ui/States';
import type { Role } from '@/types/api';

function GuardFallback({ rows = 6 }: { rows?: number }) {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <LoadingState rows={rows} />
    </div>
  );
}

export function RoleGuard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, isLoading, isPending } = useAuth();
  const location = useLocation();

  if (isLoading) return <GuardFallback />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname, expired: true }} />;
  // A pending account is authenticated but every business route answers 403.
  if (isPending) return <Navigate to="/pending-approval" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/unauthorized" replace state={{ attempted: location.pathname }} />;
  return <>{children}</>;
}

/** Requires a session but no particular role (used by the pending-approval state). */
export function AuthenticatedGuard({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <GuardFallback rows={4} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function PublicOnly({ children }: { children: ReactNode }) {
  const { user, isLoading, isPending } = useAuth();
  if (isLoading) return <GuardFallback rows={4} />;
  if (isPending) return <Navigate to="/pending-approval" replace />;
  if (user) return <Navigate to={roleHome[user.role]} replace />;
  return <>{children}</>;
}

export function RoleRedirect() {
  const { user, isLoading, isPending } = useAuth();
  if (isLoading) return <GuardFallback rows={4} />;
  if (isPending) return <Navigate to="/pending-approval" replace />;
  return <Navigate to={user ? roleHome[user.role] : '/login'} replace />;
}

export function PendingApprovalPage() {
  const { user, isPending, logout } = useAuth();
  const authenticated = Boolean(user);

  if (authenticated && !isPending) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl items-center px-4">
      <Card className="w-full">
        <CardBody className="p-8 text-center">
          <EmptyState
            title="Your account is awaiting agency approval"
            description={`The registration for ${
              user?.customer?.businessName || user?.email || 'your organisation'
            } was received. An agency administrator must approve it before ordering, invoicing and messaging are enabled. You can sign in and check this page at any time.`}
            action={
              <div className="flex flex-col items-center gap-3">
                <Button variant="outline" onClick={() => void logout()}>
                  Sign out
                </Button>
                <p className="text-xs text-slate-500">
                  Account status: <strong>{user?.status}</strong>
                </p>
              </div>
            }
          />
        </CardBody>
      </Card>
    </div>
  );
}

export function UnauthorizedPage() {
  const location = useLocation();
  return (
    <div className="mx-auto max-w-3xl py-10">
      <EmptyState
        icon={ShieldAlert}
        title="You do not have access to this workspace"
        description={`${(location.state as { attempted?: string } | null)?.attempted || 'This area'} is not available for your account role. This UI guard improves navigation, but the API independently enforces authorization.`}
        action={<Button onClick={() => window.history.back()}>Go back</Button>}
      />
    </div>
  );
}
