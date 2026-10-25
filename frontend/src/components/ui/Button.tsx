import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-forest text-white hover:bg-brand-800 focus-visible:ring-azure-300 disabled:bg-brand-300',
  secondary:
    'bg-sage text-brand-800 hover:bg-brand-100 focus-visible:ring-azure-300 disabled:bg-parchment disabled:text-muted',
  outline:
    'border border-line bg-white text-charcoal hover:border-brand-300 hover:bg-ivory focus-visible:ring-azure-300 disabled:text-muted',
  ghost:
    'text-muted hover:bg-parchment hover:text-charcoal focus-visible:ring-azure-300 disabled:text-muted/60',
  danger:
    'bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-200 disabled:bg-red-300',
  success:
    'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-azure-300 disabled:bg-brand-300',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 gap-1.5 px-3 text-[13px]',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-11 gap-2 px-5 text-sm',
  icon: 'h-10 w-10',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);

Button.displayName = 'Button';
