import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Clock, Save, Settings2 } from 'lucide-react';
import { api, apiSend } from '@/lib/api';
import { mapAgencySettings } from '@/lib/adapters';
import { buildSettingsPayload, type BusinessHoursInput, type SettingsFormValues } from '@/lib/payloads';
import { useToast } from '@/contexts/ToastContext';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, TextInput, Textarea } from '@/components/ui/Form';
import { ErrorState, LoadingState } from '@/components/ui/States';
import type { AgencySettings, NotificationPreferenceKey } from '@/types/api';

/** `WEEK_DAYS`; each day is a free-text range such as "09:00 - 18:00". */
const DAYS = [
  { key: 'MONDAY', label: 'Monday' },
  { key: 'TUESDAY', label: 'Tuesday' },
  { key: 'WEDNESDAY', label: 'Wednesday' },
  { key: 'THURSDAY', label: 'Thursday' },
  { key: 'FRIDAY', label: 'Friday' },
  { key: 'SATURDAY', label: 'Saturday' },
  { key: 'SUNDAY', label: 'Sunday' },
] as const;

const NOTIFICATION_EVENTS: Array<{ key: NotificationPreferenceKey; label: string }> = [
  { key: 'newOrder', label: 'New order placed' },
  { key: 'orderStatusChange', label: 'Order status change' },
  { key: 'paymentRecorded', label: 'Payment recorded' },
  { key: 'inventoryLow', label: 'Low stock alert' },
  { key: 'inventoryExpiring', label: 'Stock expiring soon' },
  { key: 'requirementUploaded', label: 'Requirement uploaded' },
  { key: 'followUpDue', label: 'Follow-up due' },
  { key: 'contactSubmission', label: 'Website contact submission' },
];

const emptyAddress = { line1: '', line2: '', city: '', state: '', country: '', postalCode: '' };

const toForm = (settings: AgencySettings): SettingsFormValues => {
  const hours: BusinessHoursInput = {};
  for (const day of DAYS) {
    hours[day.key] = settings.businessHours?.[day.key] ?? null;
  }

  return {
    name: settings.name,
    legalName: settings.legalName ?? '',
    website: settings.website ?? '',
    description: settings.description ?? '',
    logoUrl: settings.logoUrl ?? '',
    contact: {
      email: settings.contact.email,
      phone: settings.contact.phone,
      address: { ...emptyAddress, ...settings.contact.address },
    },
    tax: {
      gstNumber: settings.tax.gstNumber ?? '',
      defaultTaxRate: String(settings.tax.defaultTaxRate),
      pricesIncludeTax: settings.tax.pricesIncludeTax,
      invoicePrefix: settings.tax.invoicePrefix,
    },
    orderSettings: {
      prefix: settings.orderSettings.prefix,
      padding: String(settings.orderSettings.padding),
      lowStockThreshold: String(settings.orderSettings.lowStockThreshold),
      expiryAlertDays: String(settings.orderSettings.expiryAlertDays),
      allowCustomerCancellation: settings.orderSettings.allowCustomerCancellation,
      cancelWindowHours: String(settings.orderSettings.cancelWindowHours),
      followUpDueDays: String(settings.orderSettings.followUpDueDays),
      invoiceDueDays: String(settings.orderSettings.invoiceDueDays),
      defaultPaymentTermsDays: String(settings.orderSettings.defaultPaymentTermsDays),
    },
    features: { ...settings.features },
    businessHours: hours,
    notifications: {
      email: { ...settings.notifications.email },
      quietHoursEnabled: settings.notifications.quietHoursEnabled,
      quietHoursStart: settings.notifications.quietHoursStart ?? '',
      quietHoursEnd: settings.notifications.quietHoursEnd ?? '',
    },
  };
};

export default function SettingsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SettingsFormValues | null>(null);

  const query = useQuery({
    queryKey: ['settings'],
    queryFn: async () => mapAgencySettings(await api<unknown>('/settings')),
  });

  useEffect(() => {
    if (query.data && !form) setForm(toForm(query.data));
  }, [query.data, form]);

  const save = useMutation({
    mutationFn: () => {
      if (!form) throw new Error('Settings are still loading.');
      return apiSend<unknown>('patch', '/settings', buildSettingsPayload(form));
    },
    onSuccess: (raw) => {
      const updated = mapAgencySettings(raw);
      queryClient.setQueryData(['settings'], updated);
      setForm(toForm(updated));
      void queryClient.invalidateQueries({ queryKey: ['public-agency'] });
      showToast('success', 'Settings updated', 'Agency profile, order defaults and tax settings were saved.');
    },
    onError: (error) => showToast('error', 'Settings not updated', errorMessage(error)),
  });

  const dirty = useMemo(() => form !== null && query.data !== undefined && JSON.stringify(form) !== JSON.stringify(toForm(query.data)), [form, query.data]);

  if (query.isLoading || !form) return <LoadingState rows={6} />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const patchContact = (patch: Partial<SettingsFormValues['contact']>) => setForm({ ...form, contact: { ...form.contact, ...patch } });
  const patchAddress = (patch: Partial<SettingsFormValues['contact']['address']>) =>
    setForm({ ...form, contact: { ...form.contact, address: { ...form.contact.address, ...patch } } });
  const patchTax = (patch: Partial<SettingsFormValues['tax']>) => setForm({ ...form, tax: { ...form.tax, ...patch } });
  const patchOrders = (patch: Partial<SettingsFormValues['orderSettings']>) =>
    setForm({ ...form, orderSettings: { ...form.orderSettings, ...patch } });
  const patchFeatures = (patch: Partial<SettingsFormValues['features']>) =>
    setForm({ ...form, features: { ...form.features, ...patch } });

  return (
    <>
      <PageHeader
        eyebrow="Agency configuration"
        title="Settings"
        description="Saved to the real nested agency document. Unknown fields are rejected by the API, so nothing is invented here."
        actions={
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
            <Save className="h-4 w-4" /> Save settings
          </Button>
        }
      />

      <form
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className="space-y-6">
          <Card>
            <CardHeader title="Agency profile" description="Shown on the public website through GET /public/agency." action={<Building2 className="h-5 w-5 text-slate-400" />} />
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <Field id="settings-name" label="Agency name" required>
                <TextInput id="settings-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </Field>
              <Field id="settings-legal-name" label="Legal name" hint="Optional">
                <TextInput id="settings-legal-name" value={form.legalName} onChange={(event) => setForm({ ...form, legalName: event.target.value })} />
              </Field>
              <Field id="settings-website" label="Website" hint="Must be a full URL">
                <TextInput id="settings-website" type="url" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} placeholder="https://" />
              </Field>
              <Field id="settings-logo" label="Logo URL" hint="Optional HTTPS URL">
                <TextInput id="settings-logo" type="url" value={form.logoUrl} onChange={(event) => setForm({ ...form, logoUrl: event.target.value })} placeholder="https://" />
              </Field>
              <Field id="settings-description" label="Description" className="sm:col-span-2">
                <Textarea id="settings-description" rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Contact details" description="Used on invoices and the public contact page." />
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <Field id="settings-email" label="Public email" required>
                <TextInput id="settings-email" type="email" value={form.contact.email} onChange={(event) => patchContact({ email: event.target.value })} />
              </Field>
              <Field id="settings-phone" label="Phone" required>
                <TextInput id="settings-phone" value={form.contact.phone} onChange={(event) => patchContact({ phone: event.target.value })} />
              </Field>
              <Field id="settings-line1" label="Address line 1" required className="sm:col-span-2">
                <TextInput id="settings-line1" value={form.contact.address.line1} onChange={(event) => patchAddress({ line1: event.target.value })} />
              </Field>
              <Field id="settings-line2" label="Address line 2" className="sm:col-span-2">
                <TextInput id="settings-line2" value={form.contact.address.line2} onChange={(event) => patchAddress({ line2: event.target.value })} />
              </Field>
              <Field id="settings-city" label="City" required>
                <TextInput id="settings-city" value={form.contact.address.city} onChange={(event) => patchAddress({ city: event.target.value })} />
              </Field>
              <Field id="settings-state" label="State" required>
                <TextInput id="settings-state" value={form.contact.address.state} onChange={(event) => patchAddress({ state: event.target.value })} />
              </Field>
              <Field id="settings-country" label="Country" required>
                <TextInput id="settings-country" value={form.contact.address.country} onChange={(event) => patchAddress({ country: event.target.value })} />
              </Field>
              <Field id="settings-postal" label="Postal code" required>
                <TextInput id="settings-postal" value={form.contact.address.postalCode} onChange={(event) => patchAddress({ postalCode: event.target.value })} />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Tax and invoicing" description="Applied when the service prices an order or issues an invoice." />
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <Field id="settings-gst" label="Agency GST number" hint="Optional">
                <TextInput id="settings-gst" value={form.tax.gstNumber} onChange={(event) => patchTax({ gstNumber: event.target.value })} />
              </Field>
              <Field id="settings-default-tax" label="Default tax rate (%)">
                <TextInput id="settings-default-tax" type="number" min="0" max="100" step="0.01" value={form.tax.defaultTaxRate} onChange={(event) => patchTax({ defaultTaxRate: event.target.value })} />
              </Field>
              <Field id="settings-invoice-prefix" label="Invoice prefix" hint="e.g. INV produces INV-2026-000001">
                <TextInput id="settings-invoice-prefix" value={form.tax.invoicePrefix} onChange={(event) => patchTax({ invoicePrefix: event.target.value.toUpperCase() })} />
              </Field>
              <label className="sm:col-span-2">
                <Checkbox
                  label="Prices include tax"
                  description="When enabled, the service sets the order tax rate to zero."
                  checked={form.tax.pricesIncludeTax}
                  onChange={(event) => patchTax({ pricesIncludeTax: event.target.checked })}
                />
              </label>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Order defaults" description="Numbering, stock thresholds and cancellation policy." action={<Settings2 className="h-5 w-5 text-slate-400" />} />
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <Field id="settings-prefix" label="Order number prefix" hint="e.g. SM produces SM-2026-000001">
                <TextInput id="settings-prefix" value={form.orderSettings.prefix} onChange={(event) => patchOrders({ prefix: event.target.value.toUpperCase() })} />
              </Field>
              <Field id="settings-padding" label="Number padding" hint="1 to 12 digits">
                <TextInput id="settings-padding" type="number" min="1" max="12" value={form.orderSettings.padding} onChange={(event) => patchOrders({ padding: event.target.value })} />
              </Field>
              <Field id="settings-low-stock" label="Low-stock threshold" hint="Units at or below this count raise a low-stock alert.">
                <TextInput id="settings-low-stock" type="number" min="0" value={form.orderSettings.lowStockThreshold} onChange={(event) => patchOrders({ lowStockThreshold: event.target.value })} />
              </Field>
              <Field id="settings-expiry" label="Expiry alert days" hint="Batches expiring inside this window are flagged.">
                <TextInput id="settings-expiry" type="number" min="1" max="365" value={form.orderSettings.expiryAlertDays} onChange={(event) => patchOrders({ expiryAlertDays: event.target.value })} />
              </Field>
              <Field id="settings-invoice-due" label="Invoice due days">
                <TextInput id="settings-invoice-due" type="number" min="0" max="365" value={form.orderSettings.invoiceDueDays} onChange={(event) => patchOrders({ invoiceDueDays: event.target.value })} />
              </Field>
              <Field id="settings-terms" label="Default payment terms (days)">
                <TextInput id="settings-terms" type="number" min="0" max="365" value={form.orderSettings.defaultPaymentTermsDays} onChange={(event) => patchOrders({ defaultPaymentTermsDays: event.target.value })} />
              </Field>
              <Field id="settings-followup-due" label="Follow-up due days">
                <TextInput id="settings-followup-due" type="number" min="1" max="365" value={form.orderSettings.followUpDueDays} onChange={(event) => patchOrders({ followUpDueDays: event.target.value })} />
              </Field>
              <Field id="settings-cancel-window" label="Cancellation window (hours)">
                <TextInput id="settings-cancel-window" type="number" min="0" max="720" value={form.orderSettings.cancelWindowHours} onChange={(event) => patchOrders({ cancelWindowHours: event.target.value })} />
              </Field>
              <label className="sm:col-span-2">
                <Checkbox
                  label="Allow customer cancellation"
                  description="When disabled, customers can only cancel before an order is confirmed."
                  checked={form.orderSettings.allowCustomerCancellation}
                  onChange={(event) => patchOrders({ allowCustomerCancellation: event.target.checked })}
                />
              </label>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Business hours"
              description="Published opening hours. Free text such as 09:00 - 18:00; a split shift such as 09:00 - 13:00, 16:00 - 20:00 is also valid. Leave blank for a closed day."
              action={<Clock className="h-5 w-5 text-slate-400" />}
            />
            <CardBody className="space-y-3">
              {DAYS.map((day) => (
                <div key={day.key} className="flex flex-wrap items-center gap-2">
                  <span className="w-24 shrink-0 text-sm font-semibold text-slate-700">{day.label}</span>
                  <TextInput
                    aria-label={`${day.label} opening hours`}
                    placeholder="09:00 - 18:00"
                    className="min-w-[13rem] flex-1"
                    value={form.businessHours[day.key] ?? ''}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        businessHours: { ...form.businessHours, [day.key]: event.target.value.trim() || null },
                      })
                    }
                  />
                  {form.businessHours[day.key] ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setForm({ ...form, businessHours: { ...form.businessHours, [day.key]: null } })}
                    >
                      Mark closed
                    </Button>
                  ) : (
                    <span className="text-xs text-slate-400">Closed</span>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Feature flags" description="Enables optional agency capabilities." />
            <CardBody className="space-y-4">
              <Checkbox
                label="AI reporting assistant"
                description="Also requires a provider key on the server."
                checked={form.features.aiEnabled}
                onChange={(event) => patchFeatures({ aiEnabled: event.target.checked })}
              />
              <Checkbox
                label="Requirement uploads"
                description="When disabled, customers cannot upload requirement documents."
                checked={form.features.uploadsEnabled}
                onChange={(event) => patchFeatures({ uploadsEnabled: event.target.checked })}
              />
              <Checkbox
                label="Realtime sockets"
                description="Socket.IO is served by the backend; this records agency intent."
                checked={form.features.socketEnabled}
                onChange={(event) => patchFeatures({ socketEnabled: event.target.checked })}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Notification preferences" description="Business events the agency emails its administrators about." />
            <CardBody className="space-y-4">
              {NOTIFICATION_EVENTS.map((event) => (
                <Checkbox
                  key={event.key}
                  label={event.label}
                  checked={form.notifications.email[event.key]}
                  onChange={(changeEvent) =>
                    setForm({
                      ...form,
                      notifications: {
                        ...form.notifications,
                        email: { ...form.notifications.email, [event.key]: changeEvent.target.checked },
                      },
                    })
                  }
                />
              ))}
              <div className="border-t border-slate-100 pt-4">
                <Checkbox
                  label="Quiet hours"
                  description="Mute non-critical notifications inside the window below."
                  checked={form.notifications.quietHoursEnabled}
                  onChange={(event) =>
                    setForm({ ...form, notifications: { ...form.notifications, quietHoursEnabled: event.target.checked } })
                  }
                />
                {form.notifications.quietHoursEnabled && (
                  <div className="mt-3 flex items-center gap-2">
                    <TextInput
                      type="time"
                      aria-label="Quiet hours start"
                      className="w-32"
                      value={form.notifications.quietHoursStart}
                      onChange={(event) =>
                        setForm({ ...form, notifications: { ...form.notifications, quietHoursStart: event.target.value } })
                      }
                    />
                    <span className="text-sm text-slate-500">to</span>
                    <TextInput
                      type="time"
                      aria-label="Quiet hours end"
                      className="w-32"
                      value={form.notifications.quietHoursEnd}
                      onChange={(event) =>
                        setForm({ ...form, notifications: { ...form.notifications, quietHoursEnd: event.target.value } })
                      }
                    />
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

          <Card className="sticky top-24">
            <CardHeader title="Save configuration" />
            <CardBody>
              <p className="text-sm leading-6 text-slate-600">
                Changes are written to <code>PATCH /settings</code>. Secrets and API keys are not handled by this
                frontend.
              </p>
              <Button type="submit" className="mt-5 w-full" loading={save.isPending} disabled={!dirty}>
                <Save className="h-4 w-4" /> Save settings
              </Button>
              {dirty && <p className="mt-2 text-center text-xs text-amber-700">Unsaved changes</p>}
            </CardBody>
          </Card>
        </div>
      </form>
    </>
  );
}
