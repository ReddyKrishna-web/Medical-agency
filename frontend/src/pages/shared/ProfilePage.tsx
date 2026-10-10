import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, LogOut, Save, ShieldAlert, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiSend } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { roleLabel } from '@/lib/status';
import { errorMessage, formatDate, initials } from '@/lib/utils';
import { PASSWORD_HINT, passwordField, phoneField } from '@/lib/validation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Form';
import { InlineError } from '@/components/ui/States';
import type { Role } from '@/types/api';

/** `updateProfileSchema`: name, phone and avatarUrl only. */
const profileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  phone: phoneField,
  avatarUrl: z
    .string()
    .trim()
    .refine((value) => value === '' || /^https?:\/\/\S+$/.test(value), 'Enter a valid image URL')
    .optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type PasswordValues = z.infer<typeof passwordSchema>;

export default function ProfilePage() {
  const { user, updateUser, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [passwordError, setPasswordError] = useState('');

  const profile = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: { name: user?.name ?? '', phone: user?.phone ?? '', avatarUrl: user?.avatarUrl ?? '' },
  });

  const password = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });

  // `PATCH /auth/profile` returns `{ user: { id, name, email, phone, avatarUrl } }`.
  const saveProfile = useMutation({
    mutationFn: (values: ProfileValues) =>
      apiSend<{ user?: Partial<import('@/types/api').User> }>('patch', '/auth/profile', {
        name: values.name,
        phone: values.phone,
        avatarUrl: values.avatarUrl || undefined,
      }),
    onSuccess: (result) => {
      if (result?.user) updateUser(result.user);
      showToast('success', 'Profile updated');
    },
    onError: (error) => showToast('error', 'Profile not updated', errorMessage(error)),
  });

  const changePassword = useMutation({
    mutationFn: (values: PasswordValues) =>
      apiSend('patch', '/auth/password', { currentPassword: values.currentPassword, newPassword: values.newPassword }),
    onSuccess: () => {
      setPasswordError('');
      password.reset();
      showToast('success', 'Password changed', 'Your session was ended. Sign in again with the new password.');
      void logout().then(() => navigate('/login', { replace: true }));
    },
    onError: (error) => {
      const message = errorMessage(error, 'Unable to change password.');
      setPasswordError(message);
      showToast('error', 'Password not changed', message);
    },
  });

  if (!user) return null;

  const role = user.role as Role;

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Profile and security"
        description="Keep your contact details and sign-in security current."
      />

      {user.mustChangePassword && (
        <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            <strong>Password change required.</strong> Your account was provisioned with a temporary password. Set a
            new one below before continuing to use the workspace.
          </p>
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <CardBody className="text-center">
            <div className="mx-auto grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-brand-100 text-2xl font-extrabold text-brand-800 ring-8 ring-brand-50">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                initials(user.name || user.email)
              )}
            </div>
            <h2 className="mt-5 text-xl font-extrabold text-ink">{user.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{user.email}</p>
            <span className="mt-4 inline-flex rounded-full bg-medical-50 px-3 py-1.5 text-xs font-bold text-medical-700">
              {roleLabel[role]}
            </span>
            <dl className="mt-6 space-y-3 border-t border-slate-100 pt-5 text-left text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Account status</dt>
                <dd className="font-semibold text-slate-800">{user.status}</dd>
              </div>
              {user.customer && (
                <>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Business</dt>
                    <dd className="max-w-[60%] truncate text-right font-semibold text-slate-800">
                      {user.customer.businessName}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Account status</dt>
                    <dd className="font-semibold text-slate-800">{user.customer.status}</dd>
                  </div>
                </>
              )}
              {user.salesman && (
                <>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Employee code</dt>
                    <dd className="font-semibold text-slate-800">{user.salesman.employeeCode}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Territory</dt>
                    <dd className="font-semibold text-slate-800">{user.salesman.territory || '—'}</dd>
                  </div>
                </>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Member since</dt>
                <dd className="font-semibold text-slate-800">{formatDate(user.createdAt)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Contact details" description="Only these fields are writable through PATCH /auth/profile." />
            <CardBody>
              <form
                className="grid gap-5 sm:grid-cols-2"
                onSubmit={profile.handleSubmit((values) => saveProfile.mutate(values))}
              >
                <Field id="profile-name" label="Full name" error={profile.formState.errors.name?.message} required>
                  <TextInput id="profile-name" autoComplete="name" {...profile.register('name')} />
                </Field>
                <Field id="profile-phone" label="Phone" error={profile.formState.errors.phone?.message}>
                  <TextInput id="profile-phone" type="tel" autoComplete="tel" {...profile.register('phone')} />
                </Field>
                <Field
                  id="profile-avatar"
                  label="Avatar image URL"
                  error={profile.formState.errors.avatarUrl?.message}
                  hint="Optional HTTPS image URL"
                  className="sm:col-span-2"
                >
                  <TextInput id="profile-avatar" type="url" placeholder="https://" {...profile.register('avatarUrl')} />
                </Field>
                <div className="sm:col-span-2">
                  <Button type="submit" loading={saveProfile.isPending}>
                    <Save className="h-4 w-4" /> Save profile
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Change password"
              description="Changing your password ends the current session on the service."
            />
            <CardBody>
              <form
                className="grid gap-5 sm:grid-cols-2"
                onSubmit={password.handleSubmit((values) => changePassword.mutate(values))}
              >
                <Field
                  id="currentPassword"
                  label="Current password"
                  error={password.formState.errors.currentPassword?.message}
                  required
                  className="sm:col-span-2"
                >
                  <TextInput
                    id="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    {...password.register('currentPassword')}
                  />
                </Field>
                <Field
                  id="newPassword"
                  label="New password"
                  error={password.formState.errors.newPassword?.message}
                  hint={PASSWORD_HINT}
                  required
                >
                  <TextInput id="newPassword" type="password" autoComplete="new-password" {...password.register('newPassword')} />
                </Field>
                <Field
                  id="confirmPassword"
                  label="Confirm new password"
                  error={password.formState.errors.confirmPassword?.message}
                  required
                >
                  <TextInput
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    {...password.register('confirmPassword')}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <InlineError message={passwordError} />
                  <Button type="submit" className="mt-3" loading={changePassword.isPending}>
                    <KeyRound className="h-4 w-4" /> Update password
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>

      <p className="mt-6 flex items-center gap-2 text-xs text-slate-400">
        <UserRound className="h-4 w-4" />
        Role and account status are controlled by the service and cannot be edited here.
        <LogOut className="ml-2 h-4 w-4" />
        <button className="font-semibold text-brand-700" onClick={() => void logout().then(() => navigate('/login', { replace: true }))}>
          Sign out of this device
        </button>
      </p>
    </>
  );
}
