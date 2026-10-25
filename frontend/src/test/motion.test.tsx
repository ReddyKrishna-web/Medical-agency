import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageTransition, Parallax, Reveal, Tilt } from '@/components/motion/Motion';

function mockMedia({ reduced = false, finePointer = true }: { reduced?: boolean; finePointer?: boolean } = {}) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reduced : query.includes('hover: hover') ? finePointer : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function stubRect({ left = 0, top = 0, width = 200, height = 100 } = {}) {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('motion primitives', () => {
  it('reveals content immediately when reduced motion is requested', () => {
    mockMedia({ reduced: true });
    const { container } = render(
      <Reveal>
        <p>Quiet content</p>
      </Reveal>,
    );

    expect(screen.getByText('Quiet content')).toBeTruthy();
    expect(container.firstElementChild?.classList.contains('is-visible')).toBe(true);
  });

  it('does not tilt for reduced-motion users', () => {
    mockMedia({ reduced: true });
    stubRect();
    render(
      <Tilt>
        <span>Static card</span>
      </Tilt>,
    );

    const tilt = screen.getByText('Static card').parentElement as HTMLElement;
    fireEvent(tilt, new MouseEvent('pointermove', { bubbles: true, clientX: 200, clientY: 100 }));

    expect(tilt.style.transform).toBe('');
  });

  it('does not tilt on coarse pointers such as touch screens', () => {
    mockMedia({ reduced: false, finePointer: false });
    stubRect();
    render(
      <Tilt>
        <span>Touch card</span>
      </Tilt>,
    );

    const tilt = screen.getByText('Touch card').parentElement as HTMLElement;
    fireEvent(tilt, new MouseEvent('pointermove', { bubbles: true, clientX: 200, clientY: 100 }));

    expect(tilt.style.transform).toBe('');
  });

  it('tilts toward a fine pointer and resets when it leaves', () => {
    mockMedia({ reduced: false, finePointer: true });
    stubRect();
    render(
      <Tilt max={4} scale={1.01}>
        <span>Tilt card</span>
      </Tilt>,
    );

    const tilt = screen.getByText('Tilt card').parentElement as HTMLElement;
    fireEvent(tilt, new MouseEvent('pointermove', { bubbles: true, clientX: 200, clientY: 100 }));
    expect(tilt.style.transform).toContain('rotateX(-2.00deg)');
    expect(tilt.style.transform).toContain('rotateY(2.00deg)');

    fireEvent.pointerLeave(tilt);
    expect(tilt.style.transform).toBe('');
  });

  it('returns to the top of the document when the route changes', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    render(
      <MemoryRouter initialEntries={['/one']}>
        <Link to="/two">Second route</Link>
        <PageTransition>
          <span>Page content</span>
        </PageTransition>
      </MemoryRouter>,
    );

    scrollTo.mockClear();
    fireEvent.click(screen.getByText('Second route'));

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('parallaxes with motion enabled and stays still with reduced motion', () => {
    vi.stubGlobal('innerHeight', 800);
    mockMedia({ reduced: false });
    stubRect({ top: 0, height: 100 });
    const { container, unmount } = render(
      <Parallax speed={12}>
        <span>Moved layer</span>
      </Parallax>,
    );
    const moving = container.firstElementChild as HTMLElement;
    expect(moving.style.transform).toBe('translate3d(0, 5.25px, 0)');

    unmount();
    mockMedia({ reduced: true });
    const reduced = render(
      <Parallax speed={12}>
        <span>Still layer</span>
      </Parallax>,
    );
    expect((reduced.container.firstElementChild as HTMLElement).style.transform).toBe('');
  });
});
