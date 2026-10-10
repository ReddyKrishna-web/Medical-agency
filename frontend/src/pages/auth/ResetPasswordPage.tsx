import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { apiSend } from '@/lib/api';
import { AuthHeading } from './AuthHeading';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Form';
import { InlineError } from '@/components/ui/States';
import { SEO } from '@/components/ui/SEO';
import { PASSWORD_HINT, passwordField } from '@/lib/validation';

/** `resetPasswordSchema`: token (min 20 chars) + new password. */
const schema = z
  .object({
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type Values = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const submit = async (values: Values) => {
    if (!token) {
      setError('This reset link is missing its token. Request a new link.');
      return;
    }
    setError('');
    try {
      await apiSend('post', '/auth/reset-password', { token, password: values.password });
      navigate('/login', { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The reset link may be invalid or expired.');
    }
  };

  return (
    <>
      <SEO title="Reset password" description="Choose a new Supply Medicals account password." noIndex />
      <AuthHeading
        eyebrow="Account recovery"
        title="Choose a new password"
        description="Use a unique password you do not use for another service."
      />
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-5">
        <Field id="password" label="New password" error={errors.password?.message} hint={PASSWORD_HINT} required>
          <TextInput id="password" type="password" autoComplete="new-password" invalid={Boolean(errors.password)} {...register('password')} />
        </Field>
        <Field id="confirmPassword" label="Confirm new password" error={errors.confirmPassword?.message} required>
          <TextInput
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            invalid={Boolean(errors.confirmPassword)}
            {...register('confirmPassword')}
          />
        </Field>
        <InlineError message={error} />
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          <KeyRound className="h-4 w-4" /> Update password
        </Button>
      </form>
      <p className="mt-7 text-center text-sm">
        <Link to="/forgot-password" className="font-bold text-brand-700">
          Request a new link
        </Link>
      </p>
    </>
  );
}
