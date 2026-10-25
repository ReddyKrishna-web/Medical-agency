import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import HomePage from '@/pages/public/HomePage';

vi.mock('@/lib/api', () => ({
  publicApi: { agency: vi.fn().mockResolvedValue(null) },
}));

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('homepage workflow', () => {
  it('keeps all four steps and reveals the selected step detail', () => {
    renderHome();

    const allocate = screen.getByRole('button', { name: /Allocate/ });
    expect(allocate.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(allocate);

    expect(allocate.getAttribute('aria-pressed')).toBe('true');
    expect(allocate.textContent).toContain('Each line is tied to a batch');
    expect(screen.getByRole('button', { name: /Order/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: /Fulfil/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: /Invoice/ }).getAttribute('aria-pressed')).toBe('false');
  });
});
