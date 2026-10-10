import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Field({ id, label, error, hint, required, children, className }: { id: string; label: string; error?: string; hint?: string; required?: boolean; children: ReactNode; className?: string }) {
  return <div className={cn('space-y-1.5', className)}><label htmlFor={id} className="block text-sm font-semibold text-slate-800">{label}{required && <span className="ml-1 text-red-600" aria-hidden>*</span>}</label>{children}{hint && !error && <p id={`${id}-hint`} className="text-xs leading-5 text-slate-500">{hint}</p>}{error && <p id={`${id}-error`} className="text-xs font-medium text-red-600">{error}</p>}</div>;
}
const base = 'block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-red-400 aria-[invalid=true]:ring-red-100';
export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(({ className, invalid, ...props }, ref) => <input ref={ref} aria-invalid={invalid} className={cn(base, className)} {...props} />);
TextInput.displayName = 'TextInput';
export const SelectInput = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(({ className, invalid, children, ...props }, ref) => <select ref={ref} aria-invalid={invalid} className={cn(base, 'appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 24 24%27 stroke-width=%271.5%27 stroke=%27%2364748b%27%3E%3Cpath stroke-linecap=%27round%27 stroke-linejoin=%27round%27 d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] bg-[length:18px] bg-[right_0.75rem_center] bg-no-repeat pr-10', className)} {...props}>{children}</select>);
SelectInput.displayName = 'SelectInput';
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(({ className, invalid, ...props }, ref) => <textarea ref={ref} aria-invalid={invalid} className={cn(base, 'min-h-28 resize-y', className)} {...props} />);
Textarea.displayName = 'Textarea';
/**
 * forwardRef so react-hook-form's `register()` can attach its ref to the
 * underlying input; without it, RHF cannot read the checked state on submit
 * and validation silently blocks the form.
 */
export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }>(({ label, description, ...props }, ref) => <label className="flex cursor-pointer items-start gap-3"><input ref={ref} type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" {...props} /><span><span className="block text-sm font-medium text-slate-800">{label}</span>{description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}</span></label>);
Checkbox.displayName = 'Checkbox';
