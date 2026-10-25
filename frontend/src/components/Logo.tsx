import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function Logo({
  light = false,
  compact = false,
  to = '/',
}: {
  light?: boolean;
  compact?: boolean;
  to?: string;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-azure-300"
      aria-label="Supply Medicals home"
    >
      <span
        className={cn(
          'grid h-9 w-9 place-items-center rounded-lg',
          light ? 'bg-white text-forest' : 'bg-forest text-white',
        )}
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
          <path
            d="M12 4.5v15M4.5 12h15"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {!compact && (
        <span
          className={cn(
            'font-display text-[17px] font-semibold tracking-[-0.015em]',
            light ? 'text-white' : 'text-charcoal',
          )}
        >
          Supply <span className={light ? 'text-sage' : 'text-brand-700'}>Medicals</span>
        </span>
      )}
    </Link>
  );
}
