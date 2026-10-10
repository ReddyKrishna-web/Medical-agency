import { useState } from 'react';
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

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const submit = async (values: Values) => {
    setFormError('');
    try {
      const user = await login(values);
      showToast('success', 'Welcome back');
      navigate(roleHome[user.role] || '/customer/dashboard', { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to sign in.');
    }
  };

  return (
    <>
      <SEO title="Sign in" description="Sign in to your Supply Medicals workspace." noIndex />

      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-medical-700">Sign in</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">Good to see you again</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Sign in with the credentials you registered. Your session is protected with rotating refresh cookies.
        </p>
      </div>

      {expired && (
        <div role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Your session expired or could not be renewed. Sign in again to continue.
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel sm:p-8">
        <form onSubmit={handleSubmit(submit)} noValidate className="space-y-5">
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
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-sm font-semibold text-brand-700 transition hover:text-brand-900">
              Forgot password?
            </Link>
          </div>

          <InlineError message={formError} />

          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
            <LogIn className="h-4 w-4" /> Sign in
          </Button>
        </form>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white/70 p-4 text-center">
        <p className="text-sm text-slate-600">
          New to Supply Medicals?{' '}
          <Link to="/register" className="font-extrabold text-brand-700 transition hover:text-brand-900">
            Create an account <ArrowRight className="inline h-3.5 w-3.5" />
          </Link>
        </p>
        <p className="mt-1 text-xs text-slate-400">Shops, salesmen and agencies — one form for all three.</p>
      </div>
    </>
  );
}
