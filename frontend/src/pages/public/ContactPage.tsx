import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Building2, CheckCircle2, Mail, MapPin, Phone, Send } from 'lucide-react';
import { publicApi } from '@/lib/api';
import { mapAgencySummary } from '@/lib/adapters';
import { buildContactPayload } from '@/lib/payloads';
import { useToast } from '@/contexts/ToastContext';
import { errorMessage } from '@/lib/utils';
import { SEO } from '@/components/ui/SEO';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, Textarea, TextInput } from '@/components/ui/Form';
import { InlineError } from '@/components/ui/States';
import type { ContactTopic, PublicContactResult } from '@/types/api';

/** `CONTACT_TOPICS`; the API rejects any other value. */
const CONTACT_TOPICS = [
  'NEW_ORDER_ENQUIRY',
  'PRODUCT_ENQUIRY',
  'PRICING_REQUEST',
  'PARTNERSHIP',
  'COMPLAINT',
  'SUPPORT',
  'OTHER',
] as const satisfies readonly ContactTopic[];

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  email: z.string().trim().email('Enter a valid email address').max(160),
  phone: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\+?[0-9][0-9\s\-()]{6,19}$/.test(value), 'Enter a valid phone number')
    .optional(),
  organisation: z.string().trim().max(160).optional(),
  topic: z.enum(CONTACT_TOPICS),
  message: z.string().trim().min(20, 'Tell us a little more (at least 20 characters)').max(3000),
});

type FormValues = z.infer<typeof schema>;

const TOPIC_LABELS: Record<ContactTopic, string> = {
  NEW_ORDER_ENQUIRY: 'New order enquiry',
  PRODUCT_ENQUIRY: 'Product enquiry',
  PRICING_REQUEST: 'Pricing request',
  PARTNERSHIP: 'Partnership',
  COMPLAINT: 'Complaint',
  SUPPORT: 'Support',
  OTHER: 'Something else',
};

export default function ContactPage() {
  const { showToast } = useToast();
  const [result, setResult] = useState<PublicContactResult | null>(null);
  const [submitError, setSubmitError] = useState('');

  const agency = useQuery({
    queryKey: ['public-agency'],
    queryFn: async () => mapAgencySummary(await publicApi.agency()),
    staleTime: 300_000,
    retry: false,
  });

  const configuredEmail = import.meta.env.VITE_CONTACT_EMAIL as string | undefined;
  // The agency's real contact email is preferred; the build-time value is a fallback.
  const contactEmail = agency.data?.contact?.email || configuredEmail || '';
  const address = agency.data?.contact?.address;

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { topic: 'NEW_ORDER_ENQUIRY', phone: '', organisation: '' },
  });

  const submit = async (values: FormValues) => {
    setSubmitError('');
    try {
      // `POST /public/contact` is the primary channel; the service returns its own result.
      const response = await publicApi.contact(buildContactPayload(values));
      setResult(response);
      reset({ topic: 'NEW_ORDER_ENQUIRY', phone: '', organisation: '' });
      showToast('success', 'Enquiry received', response.message);
    } catch (error) {
      const message = errorMessage(error, 'Your message could not be submitted.');
      setSubmitError(message);
      showToast('error', 'Message not sent', message);
    }
  };

  const openEmailFallback = () => {
    if (!contactEmail) return;
    const values = getValues();
    const body = [
      `Name: ${values.name}`,
      `Email: ${values.email}`,
      `Phone: ${values.phone || 'Not provided'}`,
      `Organisation: ${values.organisation || 'Not provided'}`,
      `Topic: ${TOPIC_LABELS[values.topic]}`,
      '',
      values.message,
    ].join('\n');
    window.location.href = `mailto:${contactEmail}?subject=${encodeURIComponent(
      `Supply Medicals enquiry - ${TOPIC_LABELS[values.topic]}`,
    )}&body=${encodeURIComponent(body)}`;
  };

  return (
    <>
      <SEO
        title="Contact"
        description="Contact Supply Medicals about organisation access, account support, catalogue questions or platform enquiries."
      />
      <section className="bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[.8fr_1.2fr]">
          <div className="rounded-3xl bg-ink p-8 text-white sm:p-10">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-medical-300">Contact</p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight">Let us discuss your supply workflow.</h1>
            <p className="mt-5 leading-7 text-slate-300">
              Send an enquiry to the platform team. These messages are used for account review and product support; they
              are not patient or clinical enquiries.
            </p>

            <div className="mt-8 space-y-3">
              {contactEmail ? (
                <a
                  href={`mailto:${contactEmail}`}
                  className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 p-4 text-sm font-semibold hover:bg-white/10"
                >
                  <Mail className="h-5 w-5 shrink-0 text-medical-300" />
                  <span className="break-all">{contactEmail}</span>
                </a>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-50">
                  <Mail className="mt-0.5 h-5 w-5 shrink-0" />
                  The public agency email has not been configured yet. The form below still reaches the platform team.
                </div>
              )}
              {agency.data?.contact?.phone && (
                <a
                  href={`tel:${agency.data.contact.phone}`}
                  className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 p-4 text-sm font-semibold hover:bg-white/10"
                >
                  <Phone className="h-5 w-5 shrink-0 text-medical-300" /> {agency.data.contact.phone}
                </a>
              )}
              {address && (
                <div className="flex items-start gap-3 rounded-xl border border-white/15 bg-white/5 p-4 text-sm">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-medical-300" />
                  <span className="whitespace-pre-line">
                    {[address.line1, address.line2, [address.city, address.state, address.postalCode].filter(Boolean).join(', '), address.country]
                      .filter(Boolean)
                      .join('\n')}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-8 border-t border-white/10 pt-6">
              <p className="text-sm font-semibold">What happens next?</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                The enquiry is stored as a business contact record and the agency team is notified. Do not submit patient
                information, prescriptions or other sensitive medical data.
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
            {result ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center" role="status">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-medical-50 text-medical-700">
                  <CheckCircle2 className="h-8 w-8" />
                </span>
                <h2 className="mt-6 text-2xl font-extrabold text-ink">Thank you. Your enquiry is recorded.</h2>
                <p className="mt-3 max-w-md leading-7 text-slate-600">{result.message}</p>
                <Button className="mt-7" variant="outline" onClick={() => setResult(null)}>
                  Send another message
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-xl font-extrabold text-ink">Business enquiry</h2>
                    <p className="text-sm text-slate-500">All fields marked required must be completed.</p>
                  </div>
                </div>
                {submitError && (
                  <div className="mt-5">
                    <InlineError message={submitError} />
                  </div>
                )}
                <form onSubmit={handleSubmit(submit)} noValidate className="mt-6 space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field id="contact-name" label="Your name" error={errors.name?.message} required>
                      <TextInput id="contact-name" autoComplete="name" invalid={Boolean(errors.name)} placeholder="Full name" {...register('name')} />
                    </Field>
                    <Field id="contact-organisation" label="Organisation / medical shop" hint="Optional" error={errors.organisation?.message}>
                      <TextInput
                        id="contact-organisation"
                        autoComplete="organization"
                        invalid={Boolean(errors.organisation)}
                        placeholder="Registered business name"
                        {...register('organisation')}
                      />
                    </Field>
                    <Field id="contact-email" label="Email address" error={errors.email?.message} required>
                      <TextInput
                        id="contact-email"
                        type="email"
                        autoComplete="email"
                        invalid={Boolean(errors.email)}
                        placeholder="you@organisation.com"
                        {...register('email')}
                      />
                    </Field>
                    <Field id="contact-phone" label="Phone (optional)" error={errors.phone?.message}>
                      <TextInput id="contact-phone" type="tel" autoComplete="tel" invalid={Boolean(errors.phone)} {...register('phone')} />
                    </Field>
                  </div>
                  <Field id="contact-topic" label="Topic" error={errors.topic?.message} required>
                    <SelectInput id="contact-topic" invalid={Boolean(errors.topic)} {...register('topic')}>
                      {CONTACT_TOPICS.map((topic) => (
                        <option key={topic} value={topic}>
                          {TOPIC_LABELS[topic]}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field id="contact-message" label="How can we help?" error={errors.message?.message} required>
                    <Textarea
                      id="contact-message"
                      rows={7}
                      invalid={Boolean(errors.message)}
                      placeholder="Describe your business requirement. Do not include patient data."
                      {...register('message')}
                    />
                  </Field>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button type="submit" loading={isSubmitting}>
                      <Send className="h-4 w-4" /> Send enquiry
                    </Button>
                    {contactEmail && (
                      <Button type="button" variant="outline" onClick={openEmailFallback}>
                        Open in email instead
                      </Button>
                    )}
                  </div>
                  <p className="text-xs leading-5 text-slate-500">
                    By sending an enquiry you confirm that the message contains business information only, not patient
                    records or medical advice requests.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
