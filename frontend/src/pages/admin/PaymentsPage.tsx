import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Plus, Search, WalletCards } from 'lucide-react';
import { apiMeta, apiSend } from '@/lib/api';
import { mapCustomers, mapInvoices, mapPayments } from '@/lib/adapters';
import { buildPaymentPayload } from '@/lib/payloads';
import { useToast } from '@/contexts/ToastContext';
import { useDebounce } from '@/hooks/useDebounce';
import { errorMessage, formatCurrency, formatDate } from '@/lib/utils';
import { humanize, PAYMENT_METHODS } from '@/lib/status';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, SelectInput, TextInput } from '@/components/ui/Form';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import type { Payment, PaymentMethod } from '@/types/api';

const emptyForm = {
  invoiceId: '',
  customerId: '',
  amount: '',
  method: 'BANK_TRANSFER' as PaymentMethod,
  reference: '',
  paidAt: '',
  note: '',
};

const customerNameOf = (payment: Payment) =>
  typeof payment.customerId === 'object' ? payment.customerId.businessName ?? '—' : '—';

export default function PaymentsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const debounced = useDebounce(search);

  const query = useQuery({
    queryKey: ['payments', { page, search: debounced, method }],
    queryFn: async () => {
      const { data, meta } = await apiMeta<unknown>('/payments', {
        params: { page, limit: 20, search: debounced || undefined, method: method || undefined },
      });
      return { rows: mapPayments(data), total: Number(meta.total ?? 0) };
    },
    placeholderData: (previous) => previous,
  });

  const invoices = useQuery({
    queryKey: ['invoices', { payment: true }],
    queryFn: async () => {
      const { data } = await apiMeta<unknown>('/invoices', { params: { page: 1, limit: 200 } });
      return mapInvoices(data);
    },
    enabled: open,
  });

  const customers = useQuery({
    queryKey: ['customers', { payment: true }],
    queryFn: async () => {
      const { data } = await apiMeta<unknown>('/customers', { params: { page: 1, limit: 200 } });
      return mapCustomers(data);
    },
    enabled: open,
    staleTime: 60_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['payments'] });
    void queryClient.invalidateQueries({ queryKey: ['invoices'] });
  };

  // `createPaymentSchema` requires customerId, amount and method.
  const save = useMutation({
    mutationFn: () =>
      apiSend<unknown>(
        'post',
        '/payments',
        buildPaymentPayload({
          customerId: form.customerId,
          amount: form.amount,
          method: form.method,
          invoiceId: form.invoiceId || undefined,
          reference: form.reference || undefined,
          paidAt: form.paidAt || undefined,
          note: form.note || undefined,
        }),
      ),
    onSuccess: () => {
      invalidate();
      setOpen(false);
      setForm(emptyForm);
      showToast('success', 'Payment recorded');
    },
    onError: (error) => showToast('error', 'Payment not recorded', errorMessage(error)),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? rows.length;

  const columns: Column<Payment>[] = [
    {
      key: 'reference',
      header: 'Reference',
      render: (item) => (
        <div>
          <p className="text-[13.5px] font-medium text-charcoal">{item.reference || '—'}</p>
          {item.invoiceNumber && <p className="text-xs text-muted">Invoice {item.invoiceNumber}</p>}
        </div>
      ),
    },
    { key: 'customer', header: 'Customer', render: customerNameOf },
    {
      key: 'amount',
      header: 'Amount',
      render: (item) => <span className="text-[13px] font-semibold tabular-nums text-charcoal">{formatCurrency(item.amount)}</span>,
    },
    { key: 'method', header: 'Method', render: (item) => <Badge value={item.method} tone="blue" /> },
    { key: 'paidAt', header: 'Paid at', render: (item) => formatDate(item.paidAt), mobileLabel: false },
    { key: 'note', header: 'Note', render: (item) => item.note || '—', mobileLabel: false },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Finance operations"
        title="Payments"
        description="Record payments against invoices. This workspace does not operate a payment gateway."
        actions={
          <Button
            onClick={() => {
              setForm(emptyForm);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Record payment
          </Button>
        }
      />

      <Card className="mb-5 p-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-muted" />
            <TextInput
              aria-label="Search payments"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Reference, invoice or order number"
              className="pl-10"
            />
          </div>
          <SelectInput
            aria-label="Filter by method"
            value={method}
            onChange={(event) => {
              setMethod(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All methods</option>
            {PAYMENT_METHODS.map((value) => (
              <option key={value} value={value}>
                {humanize(value)}
              </option>
            ))}
          </SelectInput>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={rows}
          getKey={(item) => item.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          emptyTitle="No payments recorded"
          emptyDescription="Record a payment when an invoice is settled outside this system."
          emptyAction={
            <Button
              size="sm"
              onClick={() => {
                setForm(emptyForm);
                setOpen(true);
              }}
            >
              <WalletCards className="h-4 w-4" /> Record payment
            </Button>
          }
          footer={<Pagination page={page} limit={20} total={total} onPageChange={setPage} />}
        />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record a payment"
        description="Only the agency administrator can write payment records through this API."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={save.isPending} disabled={!form.customerId || !form.amount} onClick={() => save.mutate()}>
              Record payment
            </Button>
          </>
        }
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <Field
            id="payment-invoice"
            label="Invoice"
            hint="Optional. Selecting one applies the amount to that invoice."
          >
            <SelectInput
              id="payment-invoice"
              value={form.invoiceId}
              onChange={(event) => {
                const invoice = (invoices.data ?? []).find((item) => item.id === event.target.value);
                setForm({
                  ...form,
                  invoiceId: event.target.value,
                  customerId: invoice?.customerId ?? form.customerId,
                  amount: invoice && !form.amount ? String(invoice.amountDue) : form.amount,
                });
              }}
            >
              <option value="">No invoice</option>
              {(invoices.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.invoiceNumber} - {item.customerName} - due {formatCurrency(item.amountDue, item.currency)}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field id="payment-customer" label="Customer" required>
            <SelectInput
              id="payment-customer"
              value={form.customerId}
              onChange={(event) => setForm({ ...form, customerId: event.target.value })}
            >
              <option value="">Choose customer</option>
              {(customers.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.businessName}
                </option>
              ))}
            </SelectInput>
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="payment-amount" label="Amount" required>
              <TextInput
                id="payment-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
              />
            </Field>
            <Field id="payment-date" label="Payment date" hint="Defaults to now">
              <TextInput
                id="payment-date"
                type="date"
                value={form.paidAt}
                onChange={(event) => setForm({ ...form, paidAt: event.target.value })}
              />
            </Field>
            <Field id="payment-method" label="Method" required>
              <SelectInput
                id="payment-method"
                value={form.method}
                onChange={(event) => setForm({ ...form, method: event.target.value as PaymentMethod })}
              >
                {PAYMENT_METHODS.map((value) => (
                  <option key={value} value={value}>
                    {humanize(value)}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field id="payment-reference" label="Reference" hint="Optional bank or receipt reference">
              <TextInput
                id="payment-reference"
                value={form.reference}
                onChange={(event) => setForm({ ...form, reference: event.target.value })}
              />
            </Field>
          </div>
          <Field id="payment-note" label="Note" hint="Optional">
            <TextInput id="payment-note" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          </Field>
          <div className="flex items-start gap-2 rounded-md bg-ivory p-3 text-xs leading-5 text-muted">
            <CreditCard className="mt-0.5 h-4 w-4 shrink-0" />
            <p>No card data is collected. Recording a payment asserts that a payment happened outside this platform.</p>
          </div>
        </form>
      </Modal>
    </>
  );
}
