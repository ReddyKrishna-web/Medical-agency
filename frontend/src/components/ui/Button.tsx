import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg' | 'icon';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: Size; loading?: boolean; }
const variants: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 focus-visible:ring-brand-300 shadow-sm disabled:bg-brand-300',
  secondary: 'bg-medical-600 text-white hover:bg-medical-700 focus-visible:ring-medical-300 shadow-sm disabled:bg-medical-300',
  outline: 'border border-slate-300 bg-white text-slate-800 hover:border-brand-300 hover:bg-brand-50 focus-visible:ring-brand-200 disabled:text-slate-400',
  ghost: 'text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-200 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-200 disabled:bg-red-300',
  success: 'bg-medical-600 text-white hover:bg-medical-700 focus-visible:ring-medical-200 disabled:bg-medical-300',
};
const sizes: Record<Size, string> = { sm: 'h-9 px-3 text-sm gap-1.5', md: 'h-11 px-4 text-sm gap-2', lg: 'h-12 px-5 text-base gap-2', icon: 'h-10 w-10' };
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => (
  <button ref={ref} disabled={disabled || loading} className={cn('inline-flex items-center justify-center rounded-xl font-semibold transition focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed', variants[variant], sizes[size], className)} {...props}>
    {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}{children}
  </button>
));
Button.displayName = 'Button';
