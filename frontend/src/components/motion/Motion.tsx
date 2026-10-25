import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** Tracks the OS-level reduced-motion preference and reacts to changes. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(media.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  return reduced;
}

/**
 * Reveals content as it scrolls into view. With reduced motion (or no
 * IntersectionObserver) the content is simply visible.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (reduced) {
      setVisible(true);
      return;
    }
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [reduced]);

  return (
    <div
      ref={ref}
      className={cn('reveal', visible && 'is-visible', className)}
      style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}

/**
 * Moves children a few pixels against the scroll direction. The offset is
 * driven by a single rAF-throttled scroll listener and is disabled entirely
 * for reduced-motion users, so it never blocks reading or navigation.
 */
export function Parallax({
  children,
  speed = 12,
  className,
}: {
  children: ReactNode;
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (reduced) {
      element.style.transform = '';
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      const progress = Math.max(
        -1,
        Math.min(1, (rect.top + rect.height / 2 - viewport / 2) / viewport),
      );
      element.style.transform = `translate3d(0, ${(-progress * speed).toFixed(2)}px, 0)`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reduced, speed]);

  return (
    <div ref={ref} className={className} style={{ willChange: reduced ? undefined : 'transform' }}>
      {children}
    </div>
  );
}

/**
 * A restrained pointer tilt for selected images and panels. Only fine
 * pointers with hover get the effect; touch devices keep a static layout and
 * reduced-motion users are never moved.
 */
export function Tilt({
  children,
  className,
  max = 4,
  scale = 1.01,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
  scale?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (reduced) {
      setEnabled(false);
      return;
    }
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(hover: hover) and (pointer: fine)');
    const sync = () => setEnabled(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, [reduced]);

  const reset = () => {
    if (ref.current) ref.current.style.transform = '';
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = ref.current;
    if (!enabled || !element) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    element.style.transform = `perspective(1100px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) scale(${scale})`;
  };

  return (
    <div
      ref={ref}
      className={cn('tilt', className)}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
      onBlur={reset}
    >
      {children}
    </div>
  );
}

const defaultFormat = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);

/** Smoothly counts a metric up to its value. Reduced motion renders it directly. */
export function AnimatedNumber({
  value,
  format = defaultFormat,
  duration = 900,
  className,
}: {
  value?: number | null;
  format?: (value: number) => string;
  duration?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (value === undefined || value === null || Number.isNaN(Number(value))) return;
    const target = Number(value);
    if (reduced || typeof requestAnimationFrame === 'undefined') {
      fromRef.current = target;
      setDisplay(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) {
      setDisplay(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (target - from) * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced]);

  if (value === undefined || value === null || Number.isNaN(Number(value))) return <span className={className}>—</span>;
  return <span className={className}>{format(display)}</span>;
}

/** Fades/slides each route in without remounting the shell. */
export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-enter">
      {children}
    </div>
  );
}

/** Ambient animated background used by the auth canvas and dashboard heroes. */
export function AuroraBackdrop({ className, variant = 'navy' }: { className?: string; variant?: 'navy' | 'emerald' }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div
        className={cn(
          'aurora-orb -left-24 -top-24 h-72 w-72',
          variant === 'navy' ? 'bg-brand-500/25' : 'bg-brand-400/25',
        )}
      />
      <div className="aurora-orb -right-16 top-1/4 h-80 w-80 bg-medical-400/20" style={{ animationDelay: '-6s' }} />
      <div className="aurora-orb bottom-0 left-1/3 h-64 w-64 bg-sky-400/15" style={{ animationDelay: '-11s' }} />
      <div className="grid-overlay absolute inset-0" />
      <div className="noise-overlay absolute inset-0" />
    </div>
  );
}

/** Small pulsing "live" indicator. */
export function LiveDot({ label = 'Live', className }: { label?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full border border-brand-400/25 bg-brand-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[.14em] text-brand-200', className)}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-brand-300" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-300" />
      </span>
      {label}
    </span>
  );
}
