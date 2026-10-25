import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Mail, MapPin, Phone, Send } from 'lucide-react';
import { publicApi } from '@/lib/api';
import { mapAgencySummary } from '@/lib/adapters';
import { buildContactPayload } from '@/lib/payloads';
import { useToast } from '@/contexts/ToastContext';
import { errorMessage } from '@/lib/utils';
import { SEO } from '@/components/ui/SEO';
import { Button } from '@/components/ui/Button';
import { Field, SelectInput, Textarea, TextInput } from '@/components/ui/Form';
import { InlineError } from '@/components/ui/States';
import { PageHero, PageSection, SectionLabel } from '@/components/landing/Editorial';
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
  const addressText = address
    ? [
        address.line1,
        address.line2,
        [address.city, address.state, address.postalCode].filter(Boolean).join(', '),
        address.country,
      ]
        .filter(Boolean)
        .join('\n')
    : '';

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

      <PageHero
        eyebrow="Contact"
        title={
          <>
            Let us discuss your <span className="text-brand-700">supply workflow</span>.
          </>
        }
        intro="Send an enquiry to the platform team. These messages are used for account review and product support; they are not patient or clinical enquiries."
        aside={
          <dl className="space-y-4 border-t border-line pt-5 text-sm">
            {contactEmail ? (
              <div className="flex items-start gap-3">
                <dt>
                  <Mail className="mt-0.5 h-4 w-4 text-brand-600" aria-hidden />
                  <span className="sr-only">Email</span>
                </dt>
                <dd>
                  <a href={`mailto:${contactEmail}`} className="break-all font-medium text-charcoal hover:text-brand-700">
                    {contactEmail}
                  </a>
                </dd>
              </div>
            ) : (
              <p className="text-muted">
                The public agency email has not been configured yet. The form still reaches the platform team.
              </p>
            )}
            {agency.data?.contact?.phone && (
              <div className="flex items-start gap-3">
                <dt>
                  <Phone className="mt-0.5 h-4 w-4 text-brand-600" aria-hidden />
                  <span className="sr-only">Phone</span>
                </dt>
                <dd>
                  <a href={`tel:${agency.data.contact.phone}`} className="font-medium text-charcoal hover:text-brand-700">
                    {agency.data.contact.phone}
                  </a>
                </dd>
              </div>
            )}
            {addressText && (
              <div className="flex items-start gap-3">
                <dt>
                  <MapPin className="mt-0.5 h-4 w-4 text-brand-600" aria-hidden />
                  <span className="sr-only">Address</span>
                </dt>
                <dd className="whitespace-pre-line leading-6 text-muted">{addressText}</dd>
              </div>
            )}
          </dl>
        }
      />

      <PageSection tone="white">
        <div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
          <div>
            <SectionLabel>Business enquiry</SectionLabel>
            <h2 className="mt-3 font-display text-[26px] font-semibold leading-[1.2] tracking-[-0.02em] text-charcoal">
              Tell us what you need.
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted">
              All fields marked required must be completed. The enquiry is stored as a business contact record and the
              agency team is notified.
            </p>
            <p className="mt-5 border-t border-line pt-5 text-xs leading-6 text-muted">
              Do not submit patient information, prescriptions or other sensitive medical data.
            </p>
          </div>

          <div className="rounded-xl border border-line bg-white p-6 sm:p-8">
            {result ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center text-center" role="status">
                <span className="grid h-12 w-12 place-items-center rounded-lg bg-sage text-brand-700">
                  <CheckCircle2 className="h-6 w-6" />
                </span>
                <h2 className="mt-5 font-display text-[24px] font-semibold tracking-[-0.02em] text-charcoal">
                  Thank you. Your enquiry is recorded.
                </h2>
                <p className="mt-3 max-w-md text-sm leading-7 text-muted">{result.message}</p>
                <Button className="mt-6" variant="outline" onClick={() => setResult(null)}>
                  Send another message
                </Button>
              </div>
            ) : (
              <>
                {submitError && (
                  <div className="mb-5">
                    <InlineError message={submitError} />
                  </div>
                )}
                <form onSubmit={handleSubmit(submit)} noValidate className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field id="contact-name" label="Your name" error={errors.name?.message} required>
                      <TextInput
                        id="contact-name"
                        autoComplete="name"
                        invalid={Boolean(errors.name)}
                        placeholder="Full name"
                        {...register('name')}
                      />
                    </Field>
                    <Field
                      id="contact-organisation"
                      label="Organisation / medical shop"
                      hint="Optional"
                      error={errors.organisation?.message}
                    >
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
                      <TextInput
                        id="contact-phone"
                        type="tel"
                        autoComplete="tel"
                        invalid={Boolean(errors.phone)}
                        {...register('phone')}
                      />
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

                  <p className="text-xs leading-5 text-muted">
                    By sending an enquiry you confirm that the message contains business information only, not patient
                    records or medical advice requests.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </PageSection>
    </>
  );
}
