import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Lock,
  MapPin,
  ShoppingCart,
  UserPlus,
  Users,
} from 'lucide-react';
import { publicApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, SelectInput, TextInput } from '@/components/ui/Form';
import { CityInput } from '@/components/ui/CityInput';
import { InlineError } from '@/components/ui/States';
import { SEO } from '@/components/ui/SEO';
import { emailField, PASSWORD_MIN_LENGTH, passwordField, phoneField } from '@/lib/validation';
import type { AccountType, RegisterFormValues } from '@/lib/payloads';
import { cn } from '@/lib/utils';
import { Country, State } from 'country-state-city';
import { detectDeviceCountry, requestDevicePosition, reverseGeocode } from '@/lib/geo';

/* ------------------------------------------------------------------ schema */

const addressShape = {
  // Length rules only — presence is enforced per account type in the
  // superRefine below, so an untouched (hidden) address can never block
  // account types that do not render it.
  line1: z.string().trim().max(160),
  line2: z.string().trim().max(160).optional(),
  city: z.string().trim().max(80),
  state: z.string().trim().max(80),
  country: z.string().trim().max(80),
  postalCode: z.string().trim().max(20),
};

const requireAddressField = (
  ctx: z.RefinementCtx,
  address: Values['address'],
  field: 'line1' | 'city' | 'state' | 'country' | 'postalCode',
  minLength: number,
  message: string,
) => {
  const value = address?.[field] ?? '';
  if (value.trim().length < minLength) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [`address.${field}`], message });
  }
};

/**
 * One schema serves all three account kinds. Every step validates only its own
 * fields through `trigger()` before the next step is shown; the payload builder
 * on submit strips whatever does not apply, and the server re-validates all.
 */
const schema = z.object({
  accountType: z.enum(['MEDICAL_SHOP', 'SALESMAN', 'AGENCY']),
  agencyId: z.string().trim().min(1, 'Select the agency you want to join'),
  name: z.string().trim().min(2, 'Enter your full name').max(120),
  email: emailField,
  phone: phoneField,
  password: passwordField,
  confirmPassword: z.string(),
  businessName: z.string().trim().max(160).optional(),
  ownerName: z.string().trim().max(120).optional(),
  gstNumber: z.string().trim().max(32).optional(),
  drugLicenseNumber: z.string().trim().max(64).optional(),
  shopType: z.string().trim().max(80).optional(),
  agencyName: z.string().trim().max(120).optional(),
  contactName: z.string().trim().max(120).optional(),
  territory: z.string().trim().max(120).optional(),
  monthlyTarget: z.string().trim().max(20).optional(),
  address: z.object(addressShape).optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Accept the terms to continue' }) }),
})
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmPassword'], message: 'Passwords do not match' });
    }
    if (data.accountType === 'MEDICAL_SHOP') {
      if (!data.agencyId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['agencyId'], message: 'Select the agency you want to order from' });
      }
      if (!data.businessName || data.businessName.trim().length < 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['businessName'], message: 'Enter your shop or organisation name' });
      }
      requireAddressField(ctx, data.address, 'line1', 3, 'Enter the street address');
      requireAddressField(ctx, data.address, 'city', 2, 'Enter the city');
      requireAddressField(ctx, data.address, 'state', 2, 'Enter the state');
      requireAddressField(ctx, data.address, 'country', 2, 'Enter the country');
      requireAddressField(ctx, data.address, 'postalCode', 2, 'Enter the postal code');
    }
    if (data.accountType === 'AGENCY') {
      if (!data.agencyName || data.agencyName.trim().length < 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['agencyName'], message: 'Enter the agency name' });
      }
      requireAddressField(ctx, data.address, 'line1', 3, 'Enter the street address');
      requireAddressField(ctx, data.address, 'city', 2, 'Enter the city');
      requireAddressField(ctx, data.address, 'state', 2, 'Enter the state');
      requireAddressField(ctx, data.address, 'country', 2, 'Enter the country');
      requireAddressField(ctx, data.address, 'postalCode', 2, 'Enter the postal code');
    }
  });

type Values = z.infer<typeof schema>;

const SHOP_TYPES = ['Medical shop', 'Hospital', 'Clinic', 'Diagnostic centre', 'Pharmacy chain', 'Other'];

/** All countries sorted by name for the address selects. */
const COUNTRIES = Country.getAllCountries()
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((country) => ({ code: country.isoCode, name: country.name }));

const emptyAddress: NonNullable<Values['address']> = {
  line1: '',
  line2: '',
  city: '',
  state: '',
  country: '',
  postalCode: '',
};

/* -------------------------------------------------------------- step logic */

type FieldName =
  | 'accountType'
  | 'agencyId'
  | 'name'
  | 'email'
  | 'phone'
  | 'password'
  | 'confirmPassword'
  | 'businessName'
  | 'ownerName'
  | 'gstNumber'
  | 'drugLicenseNumber'
  | 'shopType'
  | 'agencyName'
  | 'contactName'
  | 'acceptTerms'
  | 'address.line1'
  | 'address.line2'
  | 'address.city'
  | 'address.state'
  | 'address.country'
  | 'address.postalCode';

const stepFields: Record<number, FieldName[]> = {
  0: ['accountType'],
  1: [],
  2: ['name', 'email', 'phone', 'password', 'confirmPassword', 'acceptTerms'],
};

const fieldsForStep = (step: number, accountType: AccountType): FieldName[] => {
  if (step === 1) {
    if (accountType === 'MEDICAL_SHOP') {
      return ['agencyId', 'businessName', 'address.line1', 'address.city', 'address.state', 'address.country', 'address.postalCode'];
    }
    if (accountType === 'AGENCY') {
      return ['agencyName', 'address.line1', 'address.city', 'address.state', 'address.country', 'address.postalCode'];
    }
    return ['agencyId'];
  }
  return stepFields[step] ?? [];
};

/* ------------------------------------------------------------------- cards */

const ACCOUNT_OPTIONS: Array<{
  value: AccountType;
  title: string;
  text: string;
  points: string[];
  icon: typeof ShoppingCart;
}> = [
  {
    value: 'MEDICAL_SHOP',
    title: 'Medical shop',
    text: 'Order medicals from an agency and track every delivery.',
    points: ['Pick your agency', 'Order instantly', 'No waiting for approval'],
    icon: ShoppingCart,
  },
  {
    value: 'SALESMAN',
    title: 'Salesman',
    text: 'Mediate between an agency and the shops you serve.',
    points: ['Join an agency', 'Get customers assigned', 'Start working today'],
    icon: Users,
  },
  {
    value: 'AGENCY',
    title: 'Agency',
    text: 'Run your own distribution workspace as the administrator.',
    points: ['Your own workspace', 'Full admin control', 'Live immediately'],
    icon: Building2,
  },
];

const STEP_TITLES = ['Choose account type', 'Your details', 'Account & security'];

/* -------------------------------------------------------------------- page */

export default function RegisterPage() {
  const { register: registerAccount, registerAgency } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | undefined>();
  const [formError, setFormError] = useState('');
  const [locate, setLocate] = useState<'idle' | 'locating' | 'done' | 'error'>('idle');
  const [locateMessage, setLocateMessage] = useState('');

  const agencies = useQuery({
    queryKey: ['public-agencies'],
    queryFn: publicApi.agencies,
    staleTime: 300_000,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      accountType: 'MEDICAL_SHOP',
      agencyId: '',
      address: emptyAddress,
      acceptTerms: false as unknown as true,
    },
  });

  const accountType = watch('accountType');
  const isShop = accountType === 'MEDICAL_SHOP';
  const isSalesman = accountType === 'SALESMAN';
  const isAgency = accountType === 'AGENCY';
  const showAddress = isShop || isAgency;
  const agencyOptions = useMemo(() => agencies.data?.rows ?? [], [agencies.data]);
  const selectedAgency = agencyOptions.find((agency) => agency.id === watch('agencyId'));

  const watchedCountry = watch('address.country') || '';
  const watchedCountryCode = useMemo(
    () => COUNTRIES.find((country) => country.name === watchedCountry)?.code ?? '',
    [watchedCountry],
  );
  const states = useMemo(
    () => (watchedCountryCode ? State.getStatesOfCountry(watchedCountryCode).map((s) => s.name) : []),
    [watchedCountryCode],
  );

  /**
   * Auto-detect the device country once: prefill the select only while the
   * user has not chosen anything, and let the state list drive the rest.
   */
  const geoApplied = useRef(false);
  useEffect(() => {
    if (geoApplied.current || agencies.isLoading || watchedCountry) return;
    geoApplied.current = true;
    const detected = detectDeviceCountry();
    if (detected && COUNTRIES.some((country) => country.name === detected.name)) {
      setValue('address.country', detected.name, { shouldValidate: false });
    }
  }, [agencies.isLoading, watchedCountry, setValue]);

  /** A state picked for one country is never valid for another. */
  const previousCountryCode = useRef(watchedCountryCode);
  useEffect(() => {
    if (previousCountryCode.current && watchedCountryCode !== previousCountryCode.current) {
      setValue('address.state', '', { shouldValidate: false });
    }
    previousCountryCode.current = watchedCountryCode;
  }, [watchedCountryCode, setValue]);

  /**
   * Postal-code auto-fill: with the user's explicit tap (and the browser's own
   * permission prompt), read device coordinates, reverse-geocode them, and fill
   * only fields the user has not completed. Fails soft with a readable reason.
   */
  const fillFromDeviceLocation = async () => {
    setLocate('locating');
    setLocateMessage('');
    try {
      const { coords } = await requestDevicePosition();
      const place = await reverseGeocode(coords.latitude, coords.longitude);

      // Never overwrite values the user already entered.
      const current = getValues();
      if (place.postalCode && !current.address?.postalCode) {
        setValue('address.postalCode', place.postalCode, { shouldValidate: true });
      }
      if (place.city && !current.address?.city) {
        setValue('address.city', place.city, { shouldValidate: true });
      }
      if (place.state && states.includes(place.state) && !current.address?.state) {
        setValue('address.state', place.state, { shouldValidate: true });
      }
      if (place.countryName && COUNTRIES.some((country) => country.name === place.countryName) && !current.address?.country) {
        setValue('address.country', place.countryName, place.postalCode || place.city ? { shouldValidate: true } : { shouldValidate: false });
      }

      setLocate('done');
      setLocateMessage(
        place.postalCode
          ? `Filled from your location — postal code ${place.postalCode}. Check it before continuing.`
          : 'Filled what we could from your location. Please complete the rest.',
      );
    } catch (error) {
      setLocate('error');
      setLocateMessage(error instanceof Error ? error.message : 'Could not read your location. Please type the address.');
    }
  };

  const next = async () => {
    const valid = await trigger(fieldsForStep(step, accountType));
    if (valid) setStep((current) => Math.min(current + 1, 2));
  };

  const back = () => setStep((current) => Math.max(current - 1, 0));

  const submit = async (values: Values) => {
    setFormError('');
    try {
      if (values.accountType === 'AGENCY') {
        if (!values.agencyName || !values.address) {
          setFormError('Agency name and address are required.');
          return;
        }
        const result = await registerAgency({
          agencyName: values.agencyName,
          contactName: values.contactName || undefined,
          email: values.email,
          phone: values.phone,
          password: values.password,
          gstNumber: values.gstNumber || undefined,
          address: values.address,
        });
        setStatusMessage(result.statusMessage);
        navigate('/admin/dashboard', { replace: true });
        return;
      }

      const result = await registerAccount({
        accountType: values.accountType,
        agencyId: values.agencyId,
        name: values.name,
        email: values.email,
        phone: values.phone,
        password: values.password,
        businessName: values.businessName || undefined,
        ownerName: values.ownerName || undefined,
        address: isShop ? values.address : undefined,
        gstNumber: values.gstNumber || undefined,
        drugLicenseNumber: values.drugLicenseNumber || undefined,
        territory: isSalesman ? values.territory || undefined : undefined,
        monthlyTarget: isSalesman && values.monthlyTarget ? values.monthlyTarget : undefined,
      } satisfies RegisterFormValues);
      setStatusMessage(result.statusMessage);
      // Accounts are ACTIVE immediately; land on the role dashboard.
      navigate(values.accountType === 'SALESMAN' ? '/salesman/dashboard' : '/customer/dashboard', { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to submit your request.');
    }
  };

  return (
    <>
      <SEO
        title="Create an account"
        description="Register a medical shop, join an agency as a salesman, or start your own distribution agency."
        noIndex
      />

      <div className="mb-7">
        <p className="text-[11px] font-medium uppercase tracking-[.14em] text-brand-700">Registration</p>
        <h1 className="mt-2 font-display text-[27px] font-semibold tracking-[-0.02em] text-charcoal">
          Create your account
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Three steps and you are in. Shops and salesmen can start working straight away.
        </p>
      </div>

      {statusMessage && (
        <div
          role="status"
          className="mb-5 flex items-start gap-3 rounded-lg border border-medical-200 bg-medical-50 p-4 text-sm leading-6 text-medical-800"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-medical-600" />
          {statusMessage}
        </div>
      )}

      {/* Stepper */}
      <ol className="mb-7 flex items-center gap-2" aria-label="Registration progress">
        {STEP_TITLES.map((title, index) => {
          const state = index < step ? 'done' : index === step ? 'current' : 'todo';
          return (
            <li key={title} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-semibold transition-colors',
                  state === 'done' && 'bg-brand-700 text-white',
                  state === 'current' && 'bg-forest text-white ring-2 ring-brand-200',
                  state === 'todo' && 'bg-parchment text-muted ring-1 ring-line',
                )}
                aria-current={state === 'current' ? 'step' : undefined}
              >
                {state === 'done' ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  'hidden text-xs font-medium sm:block',
                  state === 'todo' ? 'text-muted' : 'text-charcoal',
                )}
              >
                {title}
              </span>
              {index < STEP_TITLES.length - 1 && <span className="h-px flex-1 bg-line" />}
            </li>
          );
        })}
      </ol>

      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-6">
        {/* ------------------------------------------------------ step 1 */}
        <section className={cn('rounded-xl border border-line bg-white p-6 shadow-soft transition-shadow sm:p-7', step === 0 && 'border-brand-300', step !== 0 && 'hidden')}>
          <h2 className="text-[11px] font-medium uppercase tracking-[.14em] text-muted">What describes you best?</h2>
          <div className="mt-4 space-y-3" role="radiogroup" aria-label="Account type">
            {ACCOUNT_OPTIONS.map((option) => {
              const active = accountType === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setValue('accountType', option.value, { shouldValidate: true })}
                  className={cn(
                    'flex w-full items-start gap-4 rounded-lg border p-4 text-left transition-colors',
                    active
                      ? 'border-brand-300 bg-sage/50 ring-1 ring-brand-200'
                      : 'border-line bg-white hover:border-brand-300 hover:bg-ivory',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-10 w-10 shrink-0 place-items-center rounded-md transition-colors',
                      active ? 'bg-forest text-white' : 'bg-parchment text-muted',
                    )}
                  >
                    <option.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-charcoal">{option.title}</span>
                      {active && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-[.08em] text-brand-800">
                          <Check className="h-3 w-3" /> Selected
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted">{option.text}</span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {option.points.map((point) => (
                        <span key={point} className="rounded-md bg-parchment px-2 py-0.5 text-[10px] font-medium text-navy-700">
                          {point}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-5 flex justify-end">
            <Button type="button" size="lg" onClick={() => void next()}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>

        {/* ------------------------------------------------------ step 2 */}
        <section className={cn('rounded-xl border border-line bg-white p-6 shadow-soft sm:p-7', step !== 1 && 'hidden')}>
          {!isAgency && (
            <Field
              id="agencyId"
              label={isSalesman ? 'Agency you will work with' : 'Agency you will order from'}
              hint={selectedAgency?.name ? undefined : 'Pick from the agencies on the platform'}
              error={errors.agencyId?.message}
              required
            >
              <SelectInput id="agencyId" invalid={Boolean(errors.agencyId)} {...register('agencyId')}>
                <option value="">{agencies.isLoading ? 'Loading agencies…' : 'Select an agency'}</option>
                {agencyOptions.map((agency) => (
                  <option key={agency.id} value={agency.id}>
                    {agency.name}
                    {agency.city ? ` — ${agency.city}` : ''}
                  </option>
                ))}
              </SelectInput>
            </Field>
          )}

          {isShop && (
            <div className="space-y-5">
              <Field id="businessName" label="Shop / organisation name" error={errors.businessName?.message} required>
                <TextInput
                  id="businessName"
                  autoComplete="organization"
                  invalid={Boolean(errors.businessName)}
                  {...register('businessName')}
                />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="ownerName" label="Owner name" hint="Optional" error={errors.ownerName?.message}>
                  <TextInput id="ownerName" autoComplete="name" {...register('ownerName')} />
                </Field>
                <Field id="shopType" label="Shop type" hint="Optional" error={errors.shopType?.message}>
                  <SelectInput id="shopType" defaultValue="" {...register('shopType')}>
                    <option value="">Not specified</option>
                    {SHOP_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field id="gstNumber" label="GST number" hint="Optional" error={errors.gstNumber?.message}>
                  <TextInput id="gstNumber" {...register('gstNumber')} />
                </Field>
                <Field id="drugLicenseNumber" label="Drug licence number" hint="Optional" error={errors.drugLicenseNumber?.message}>
                  <TextInput id="drugLicenseNumber" {...register('drugLicenseNumber')} />
                </Field>
              </div>
            </div>
          )}

          {isAgency && (
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="agencyName" label="Agency name" error={errors.agencyName?.message} required>
                  <TextInput
                    id="agencyName"
                    autoComplete="organization"
                    invalid={Boolean(errors.agencyName)}
                    {...register('agencyName')}
                  />
                </Field>
                <Field id="contactName" label="Your name" hint="Optional" error={errors.contactName?.message}>
                  <TextInput id="contactName" autoComplete="name" {...register('contactName')} />
                </Field>
              </div>
              <Field id="agencyGst" label="Agency GST number" hint="Optional" error={errors.gstNumber?.message}>
                <TextInput id="agencyGst" {...register('gstNumber')} />
              </Field>
            </div>
          )}

          {showAddress && (
            <div className="mt-6 border-t border-line pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-[13px] font-semibold text-charcoal">{isAgency ? 'Agency address' : 'Registered address'}</h3>
                <button
                  type="button"
                  onClick={() => void fillFromDeviceLocation()}
                  disabled={locate === 'locating'}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:border-brand-300 hover:bg-ivory disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {locate === 'locating' ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Detecting…
                    </>
                  ) : (
                    <>
                      <MapPin className="h-3.5 w-3.5" /> Auto-fill from my location
                    </>
                  )}
                </button>
              </div>
              {locateMessage && (
                <p
                  role="status"
                  className={cn(
                    'mt-3 rounded-md px-3 py-2 text-xs leading-5',
                    locate === 'done' && 'bg-medical-50 text-brand-800',
                    locate === 'error' && 'bg-red-50 text-red-700',
                  )}
                >
                  {locateMessage}
                </p>
              )}
              <div className="mt-4 space-y-5">
                <Field id="line1" label="Address line 1" error={errors.address?.line1?.message} required>
                  <TextInput id="line1" autoComplete="address-line1" invalid={Boolean(errors.address?.line1)} {...register('address.line1')} />
                </Field>
                <Field id="line2" label="Address line 2" hint="Optional" error={errors.address?.line2?.message}>
                  <TextInput id="line2" autoComplete="address-line2" {...register('address.line2')} />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="country" label="Country" error={errors.address?.country?.message} required>
                    <SelectInput
                      id="country"
                      autoComplete="country-name"
                      invalid={Boolean(errors.address?.country)}
                      defaultValue=""
                      {...register('address.country')}
                    >
                      <option value="">Select a country</option>
                      {COUNTRIES.map((country) => (
                        <option key={country.code} value={country.name}>
                          {country.name}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field id="state" label="State" error={errors.address?.state?.message} required>
                    {states.length ? (
                      <SelectInput
                        id="state"
                        autoComplete="address-level1"
                        invalid={Boolean(errors.address?.state)}
                        defaultValue=""
                        key={watchedCountryCode}
                        {...register('address.state')}
                      >
                        <option value="">Select a state</option>
                        {states.map((stateName) => (
                          <option key={stateName} value={stateName}>
                            {stateName}
                          </option>
                        ))}
                      </SelectInput>
                    ) : (
                      <TextInput
                        id="state"
                        autoComplete="address-level1"
                        invalid={Boolean(errors.address?.state)}
                        placeholder="Select a country first"
                        disabled={!watchedCountryCode}
                        {...register('address.state')}
                      />
                    )}
                  </Field>
                  <Field id="city" label="City" hint="Start typing to see suggestions" error={errors.address?.city?.message} required>
                    <CityInput
                      id="city"
                      value={watch('address.city') ?? ''}
                      onValueChange={(next) => setValue('address.city', next, { shouldValidate: true })}
                      onPick={(suggestion) => {
                        // The geocoder knows the place's postcode; fill it if the
                        // user has not entered one. Manual entries always win.
                        if (suggestion.postalCode && !getValues().address?.postalCode) {
                          setValue('address.postalCode', suggestion.postalCode, { shouldValidate: true });
                        }
                      }}
                      state={watch('address.state') || undefined}
                      countryName={watchedCountry || undefined}
                      countryCode={watchedCountryCode || undefined}
                      invalid={Boolean(errors.address?.city)}
                    />
                  </Field>
                  <Field id="postalCode" label="Postal code" error={errors.address?.postalCode?.message} required>
                    <TextInput
                      id="postalCode"
                      autoComplete="postal-code"
                      invalid={Boolean(errors.address?.postalCode)}
                      {...register('address.postalCode')}
                    />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {isSalesman && (
            <div className="mt-6 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  id="territory"
                  label="Territory / area you cover"
                  hint="Optional — the agency can adjust this later"
                  error={errors.territory?.message}
                >
                  <TextInput id="territory" placeholder="e.g. West Pune, MG Road area" {...register('territory')} />
                </Field>
                <Field
                  id="monthlyTarget"
                  label="Monthly sales target"
                  hint="Optional — in your currency"
                  error={errors.monthlyTarget?.message}
                >
                  <TextInput
                    id="monthlyTarget"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 250000"
                    {...register('monthlyTarget')}
                  />
                </Field>
              </div>
              <div className="flex items-start gap-3 rounded-lg bg-ivory p-4 text-xs leading-5 text-muted">
                <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <p>
                  Medical shops are assigned to you by the agency from the admin workspace. You can start as soon as
                  your first shop is assigned.
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            <Button type="button" variant="outline" onClick={back}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button type="button" size="lg" onClick={() => void next()}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>

        {/* ------------------------------------------------------ step 3 */}
        <section className={cn('rounded-xl border border-line bg-white p-6 shadow-soft sm:p-7', step !== 2 && 'hidden')}>
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-sage text-brand-700">
              <Lock className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h2 className="text-[13px] font-semibold text-charcoal">Sign-in credentials</h2>
              <p className="text-xs text-muted">Minimum {PASSWORD_MIN_LENGTH} characters, mixing letters and numbers.</p>
            </div>
          </div>

          {isAgency ? (
            <p className="rounded-lg bg-ivory p-4 text-xs leading-5 text-muted">
              Signing up as <strong>{watch('agencyName') || 'your agency'}</strong>. The contact name you entered is
              used as the administrator profile.
            </p>
          ) : (
            <Field id="name" label="Full name" error={errors.name?.message} required>
              <TextInput id="name" autoComplete="name" invalid={Boolean(errors.name)} {...register('name')} />
            </Field>
          )}

          <div className="mt-5 space-y-5">
            <Field id="email" label="Email address" error={errors.email?.message} required>
              <TextInput
                id="email"
                type="email"
                autoComplete="email"
                invalid={Boolean(errors.email)}
                placeholder="you@business.com"
                {...register('email')}
              />
            </Field>
            <Field id="phone" label="Phone" error={errors.phone?.message} required>
              <TextInput id="phone" type="tel" autoComplete="tel" invalid={Boolean(errors.phone)} {...register('phone')} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="password" label="Password" error={errors.password?.message} required>
                <TextInput
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  invalid={Boolean(errors.password)}
                  {...register('password')}
                />
              </Field>
              <Field id="confirmPassword" label="Confirm password" error={errors.confirmPassword?.message} required>
                <TextInput
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  invalid={Boolean(errors.confirmPassword)}
                  {...register('confirmPassword')}
                />
              </Field>
            </div>
          </div>

          <div className="mt-6 space-y-2 border-t border-line pt-6">
            <Checkbox
              label="I accept the terms of service"
              description="The privacy notice and terms are review placeholders until configured for launch."
              {...register('acceptTerms')}
            />
            {errors.acceptTerms && <p className="text-xs font-medium text-red-600">{errors.acceptTerms.message}</p>}
          </div>

          <InlineError message={formError} />

          <div className="mt-6 flex items-center justify-between gap-4">
            <Button type="button" variant="outline" onClick={back}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button type="submit" size="lg" loading={isSubmitting}>
              <UserPlus className="h-4 w-4" />
              {isAgency ? 'Create agency workspace' : 'Create my account'}
            </Button>
          </div>
        </section>
      </form>

      {/* Summary rail */}
      <div className="mt-5 rounded-lg border border-line bg-white p-4 text-xs leading-5 text-muted">
        <p className="font-semibold text-charcoal">What happens next?</p>
        <p className="mt-1">
          {isAgency
            ? 'Your agency workspace is created immediately with you as its administrator — you land straight on the admin dashboard.'
            : isSalesman
              ? 'Your salesman account is active right away. The agency can then assign your medical shops and territory.'
              : 'Your shop account is active right away — you can fill the basket and place your first order immediately.'}
        </p>
      </div>

      <p className="mt-6 border-t border-line pt-6 text-center text-sm text-muted">
        Already registered?{' '}
        <Link to="/login" className="font-medium text-brand-700 transition-colors hover:text-brand-800">
          Sign in
        </Link>
      </p>
    </>
  );
}
