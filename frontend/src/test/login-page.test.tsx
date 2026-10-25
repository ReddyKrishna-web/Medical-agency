import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '@/pages/auth/LoginPage';
import AuthLayout from '@/components/layout/AuthLayout';
import type { User } from '@/types/api';

const mocks = vi.hoisted(() => ({ login: vi.fn(), showToast: vi.fn() }));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ login: mocks.login }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: mocks.showToast }) }));

const makeUser = (role: User['role']): User => ({
  id: 'u1',
  name: 'Test User',
  email: 'user@example.com',
  role,
  status: 'ACTIVE',
  mustChangePassword: false,
});

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<h1>Register page</h1>} />
          <Route path="/forgot-password" element={<h1>Forgot password page</h1>} />
        </Route>
        <Route path="/" element={<h1>Public home</h1>} />
        <Route path="/admin/dashboard" element={<h1>Admin dashboard</h1>} />
        <Route path="/customer/dashboard" element={<h1>Customer dashboard</h1>} />
        <Route path="/salesman/dashboard" element={<h1>Sales dashboard</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

const fill = (email = 'owner@example.com', password = 'Secret#123') => {
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: password } });
};

describe('login page', () => {
  beforeEach(() => {
    mocks.login.mockReset();
    mocks.showToast.mockReset();
  });

  it('submits the typed credentials and opens the dashboard for the returned role', async () => {
    mocks.login.mockResolvedValue(makeUser('admin'));
    renderLogin();

    fill('admin@example.com', 'Secret#123');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: /admin dashboard/i })).toBeTruthy());
    expect(mocks.login).toHaveBeenCalledWith({ email: 'admin@example.com', password: 'Secret#123' });
  });

  it('routes a customer or salesman to their own workspace, never a shared dashboard', async () => {
    mocks.login.mockResolvedValue(makeUser('salesman'));
    renderLogin();

    fill();
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: /sales dashboard/i })).toBeTruthy());
  });

  it('shows the server message, keeps the email and re-enables the button after a rejected sign-in', async () => {
    mocks.login.mockRejectedValue(new Error('Invalid email or password'));
    renderLogin();

    fill('owner@example.com', 'WrongPassword1!');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Invalid email or password'));
    expect((screen.getByLabelText(/email address/i) as HTMLInputElement).value).toBe('owner@example.com');
    const button = screen.getByRole('button', { name: /sign in/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('validates required fields before calling the API', async () => {
    renderLogin();

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByText('Enter your password')).toBeTruthy());
    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it('sends one request when submit fires twice before the first response', async () => {
    let resolveLogin: (user: User) => void = () => undefined;
    mocks.login.mockImplementation(
      () => new Promise<User>((resolve) => {
        resolveLogin = resolve;
      }),
    );
    renderLogin();

    fill();
    const form = screen.getByRole('button', { name: /sign in/i }).closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(mocks.login).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolveLogin(makeUser('customer'));
    });
    await waitFor(() => expect(screen.getByRole('heading', { name: /customer dashboard/i })).toBeTruthy());
  });

  it('toggles password visibility without clearing the value', () => {
    renderLogin();

    const password = screen.getByLabelText(/^password/i) as HTMLInputElement;
    fireEvent.change(password, { target: { value: 'Secret#123' } });
    expect(password.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(password.type).toBe('text');
    expect(password.value).toBe('Secret#123');
    expect(screen.getByRole('button', { name: /hide password/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /hide password/i }));
    expect(password.type).toBe('password');
    expect(password.value).toBe('Secret#123');
  });

  it('never prefills a password', () => {
    renderLogin();
    expect((screen.getByLabelText(/^password/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/email address/i) as HTMLInputElement).value).toBe('');
  });

  it('navigates to password recovery and registration', async () => {
    renderLogin();

    fireEvent.click(screen.getByRole('link', { name: /forgot password/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /forgot password page/i })).toBeTruthy());
  });

  it('navigates to the public website and to create-account', async () => {
    const { unmount } = renderLogin();
    fireEvent.click(screen.getByRole('link', { name: /back to website/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /public home/i })).toBeTruthy());
    unmount();

    renderLogin();
    fireEvent.click(screen.getByRole('link', { name: /create an account/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /register page/i })).toBeTruthy());
  });
});
