import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { roleHome } from '@/lib/status';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Form';
import { InlineError } from '@/components/ui/States';
import { SEO } from '@/components/ui/SEO';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
type Values = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const expired = Boolean((location.state as { expired?: boolean } | null)?.expired);
  const [show, setShow] = useState(false);
  const [formError, setFormError] = useState('');
  // react-hook-form exposes `isSubmitting`, but a second submit event can fire
  // before React re-renders with the disabled button. This lock closes that gap
  // so double-clicking or double-pressing Enter cannot send two sign-in requests.
  const submitLock = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const submit = async (values: Values) => {
    if (submitLock.current) return;
    submitLock.current = true;
    setFormError('');
    try {
      const user = await login(values);
      showToast('success', 'Welcome back');
      navigate(roleHome[user.role] || '/customer/dashboard', { replace: true });
    } catch (error) {
      // Keep the entered email so a transient failure can be retried directly.
      setFormError(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      submitLock.current = false;
    }
  };

  return (
    <>
      <SEO title="Sign in" description="Sign in to your Supply Medicals workspace." noIndex />

      <div className="mb-7">
        <p className="text-[11px] font-medium uppercase tracking-[.14em] text-brand-700">Sign in</p>
        <h1 className="mt-2 font-display text-[27px] font-semibold tracking-[-0.02em] text-charcoal">
          Good to see you again
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Sign in with the credentials you registered. Your session is protected with rotating refresh cookies.
        </p>
      </div>

      {expired && (
        <div
          role="status"
          className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"
        >
          Your session expired or could not be renewed. Sign in again to continue.
        </div>
      )}

      <div className="rounded-xl border border-line bg-white p-6 shadow-soft sm:p-8">
        <form onSubmit={handleSubmit(submit)} noValidate aria-busy={isSubmitting} className="space-y-5">
          <Field id="email" label="Email address" error={errors.email?.message} required>
            <TextInput
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              invalid={Boolean(errors.email)}
              placeholder="you@business.com"
              {...register('email')}
            />
          </Field>

          <Field id="password" label="Password" error={errors.password?.message} required>
            <div className="relative">
              <TextInput
                id="password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                className="pr-11"
                invalid={Boolean(errors.password)}
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShow((value) => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted transition-colors hover:bg-parchment hover:text-charcoal"
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-[13px] font-medium text-brand-700 transition-colors hover:text-brand-800">
              Forgot password?
            </Link>
          </div>

          <InlineError message={formError} />

          <Button type="submit" size="lg" className="w-full" loading={isSubmitting} disabled={isSubmitting}>
            <LogIn className="h-4 w-4" aria-hidden /> {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>

      <div className="mt-5 rounded-xl border border-line bg-white p-4 text-center">
        <p className="text-sm text-muted">
          New to Supply Medicals?{' '}
          <Link to="/register" className="font-medium text-brand-700 transition-colors hover:text-brand-800">
            Create an account <ArrowRight className="inline h-3.5 w-3.5" />
          </Link>
        </p>
        <p className="mt-1 text-xs text-muted/90">Shops, salesmen and agencies — one form for all three.</p>
      </div>
    </>
  );
}
