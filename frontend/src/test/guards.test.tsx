import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleGuard, PublicOnly, RoleRedirect } from '@/routes/guards';
import type { Role, User } from '@/types/api';

const authState = { user: null as User | null, isLoading: false, isPending: false };

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authState }));

const makeUser = (role: Role, status: User['status'] = 'ACTIVE'): User => ({
  id: 'u1',
  name: 'Test User',
  email: 'test@example.com',
  role,
  status,
  mustChangePassword: false,
});

function renderRoleGuard(roles: Role[]) {
  return render(
    <MemoryRouter initialEntries={['/admin/dashboard']}>
      <Routes>
        <Route path="/login" element={<h1>Login page</h1>} />
        <Route path="/pending-approval" element={<h1>Pending approval</h1>} />
        <Route path="/unauthorized" element={<h1>Access denied</h1>} />
        <Route
          path="/admin/dashboard"
          element={
            <RoleGuard roles={roles}>
              <h1>Command center</h1>
            </RoleGuard>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('role route guards', () => {
  beforeEach(() => {
    authState.user = null;
    authState.isLoading = false;
    authState.isPending = false;
  });

  it('redirects an unauthenticated visitor to login', () => {
    renderRoleGuard(['admin']);
    expect(screen.getByRole('heading', { name: 'Login page' })).toBeTruthy();
  });

  it('rejects a signed-in user with the wrong role', () => {
    authState.user = makeUser('customer');
    renderRoleGuard(['admin']);
    expect(screen.getByRole('heading', { name: 'Access denied' })).toBeTruthy();
  });

  it('renders the protected workspace for the allowed role', () => {
    authState.user = makeUser('admin');
    renderRoleGuard(['admin']);
    expect(screen.getByRole('heading', { name: 'Command center' })).toBeTruthy();
  });

  it('sends a pending account to the approval state instead of a workspace', () => {
    authState.user = makeUser('customer', 'PENDING');
    authState.isPending = true;
    renderRoleGuard(['customer']);
    expect(screen.getByRole('heading', { name: 'Pending approval' })).toBeTruthy();
  });
});

describe('public-only and root redirects', () => {
  beforeEach(() => {
    authState.user = null;
    authState.isLoading = false;
    authState.isPending = false;
  });

  it('keeps a signed-out visitor on the auth page', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnly>
                <h1>Sign in form</h1>
              </PublicOnly>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Sign in form' })).toBeTruthy();
  });

  it('sends a signed-in user to their role home', () => {
    authState.user = makeUser('salesman');
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnly>
                <h1>Sign in form</h1>
              </PublicOnly>
            }
          />
          <Route path="/salesman/dashboard" element={<h1>Sales overview</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Sales overview' })).toBeTruthy();
  });

  it('routes /app to login when signed out and to the role home otherwise', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/app" element={<RoleRedirect />} />
          <Route path="/login" element={<h1>Login page</h1>} />
          <Route path="/customer/dashboard" element={<h1>Customer overview</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Login page' })).toBeTruthy();
    unmount();

    authState.user = makeUser('customer');
    render(
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/app" element={<RoleRedirect />} />
          <Route path="/login" element={<h1>Login page</h1>} />
          <Route path="/customer/dashboard" element={<h1>Customer overview</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Customer overview' })).toBeTruthy();
  });
});
