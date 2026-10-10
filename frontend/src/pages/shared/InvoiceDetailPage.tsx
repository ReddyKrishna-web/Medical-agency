import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Printer } from 'lucide-react';
import { api, apiSend } from '@/lib/api';
import { mapInvoice } from '@/lib/adapters';
import { buildVoidInvoicePayload } from '@/lib/payloads';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { errorMessage, formatCurrency, formatDate } from '@/lib/utils';
import { humanize } from '@/lib/status';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody } from '@/components/ui/Card';
import { Field, Textarea } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';

const addressLines = (address: { line1: string; line2?: string; city: string; state: string; country: string; postalCode: string }) =>
  [address.line1, address.line2, [address.city, address.state, address.postalCode].filter(Boolean).join(', '), address.country]
    .filter(Boolean)
    .join('\n');

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const role = user?.role ?? 'customer';
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  useDocumentTitle(`Invoice ${id?.slice(-8) ?? ''}`);

  const query = useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => mapInvoice(await api<unknown>(`/invoices/${id}`)),
    enabled: Boolean(id),
  });

  const voidInvoice = useMutation({
    mutationFn: () => {
      if (voidReason.trim().length < 3) throw new Error('A void reason is required.');
      return apiSend<unknown>('post', `/invoices/${id}/void`, buildVoidInvoicePayload(voidReason));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      showToast('success', 'Invoice voided');
      setVoidOpen(false);
      setVoidReason('');
    },
    onError: (error) => showToast('error', 'Invoice not voided', errorMessage(error)),
  });

  useEffect(() => {
    if (params.get('print') !== '1' || !query.data) return;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [params, query.data]);

  if (query.isLoading) return <LoadingState rows={6} />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const invoice = query.data;
  if (!invoice) return <EmptyState title="Invoice not found" />;

  const snapshot = invoice.agencySnapshot;

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title={invoice.invoiceNumber}
        description={`Order ${invoice.orderNumber} - issued ${formatDate(invoice.issuedAt)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print invoice
            </Button>
            {role === 'admin' && invoice.status !== 'VOID' && invoice.status !== 'PAID' && (
              <Button variant="danger" onClick={() => setVoidOpen(true)}>
                <Ban className="h-4 w-4" /> Void invoice
              </Button>
            )}
            <Button variant="ghost" onClick={() => navigate(`/${role}/orders/${invoice.orderId}`)}>
              View order
            </Button>
          </>
        }
      />

      <div className="no-print mb-5">
        <Link to={`/${role}/invoices`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-700">
          <ArrowLeft className="h-4 w-4" /> All invoices
        </Link>
      </div>

      <Card className="invoice-print mx-auto max-w-4xl overflow-hidden">
        <div className="flex flex-col gap-5 border-b border-slate-200 bg-ink p-7 text-white sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-medical-300">Tax / billing record</p>
            <h2 className="mt-2 text-3xl font-extrabold">{snapshot.name || 'Agency'}</h2>
            {snapshot.legalName && <p className="mt-1 text-sm text-slate-300">{snapshot.legalName}</p>}
            <p className="mt-1 text-sm text-slate-300">Invoice {invoice.invoiceNumber}</p>
          </div>
          <div className="text-left sm:text-right">
            <Badge value={invoice.status} />
            <p className="mt-3 text-sm text-slate-300">Issued {formatDate(invoice.issuedAt)}</p>
            <p className="mt-1 text-sm text-slate-300">Due {formatDate(invoice.dueAt)}</p>
            {invoice.voidReason && <p className="mt-1 text-sm text-red-300">Void: {invoice.voidReason}</p>}
          </div>
        </div>

        <CardBody className="p-7">
          <div className="grid gap-7 border-b border-slate-200 pb-7 sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Billed to</p>
              <p className="mt-2 font-bold text-ink">{invoice.customerName}</p>
              {invoice.customerPhone && <p className="mt-1 text-sm text-slate-500">{invoice.customerPhone}</p>}
              {invoice.customerGstNumber && <p className="text-sm text-slate-500">GST {invoice.customerGstNumber}</p>}
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">From</p>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                {snapshot.address ? addressLines(snapshot.address) : '—'}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {snapshot.email}
                {snapshot.phone ? ` - ${snapshot.phone}` : ''}
              </p>
              {snapshot.gstNumber && <p className="text-sm text-slate-600">GST {snapshot.gstNumber}</p>}
            </div>
          </div>

          <div className="overflow-x-auto py-7">
            <table className="w-full min-w-[560px] text-left">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3">Description</th>
                  <th className="py-3 text-right">Qty</th>
                  <th className="py-3 text-right">Unit price</th>
                  <th className="py-3 text-right">Tax</th>
                  <th className="py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.lines.length ? (
                  invoice.lines.map((line, index) => (
                    <tr key={`${line.productId}-${index}`}>
                      <td className="py-4">
                        <p className="font-semibold text-slate-800">{line.productName}</p>
                        <p className="text-xs text-slate-400">
                          {line.sku} - {line.unit}
                        </p>
                      </td>
                      <td className="py-4 text-right">{line.quantity}</td>
                      <td className="py-4 text-right">{formatCurrency(line.unitPrice, invoice.currency)}</td>
                      <td className="py-4 text-right text-slate-500">{formatCurrency(line.taxAmount, invoice.currency)}</td>
                      <td className="py-4 text-right font-semibold">{formatCurrency(line.lineTotal, invoice.currency)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                      This invoice did not include line items.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="ml-auto max-w-sm space-y-3 border-t border-slate-200 pt-5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Tax</span>
              <span>{formatCurrency(invoice.taxTotal, invoice.currency)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-3 text-xl font-extrabold text-ink">
              <span>Grand total</span>
              <span>{formatCurrency(invoice.grandTotal, invoice.currency)}</span>
            </div>
            <div className="flex justify-between text-medical-700">
              <span>Amount paid</span>
              <span>{formatCurrency(invoice.amountPaid, invoice.currency)}</span>
            </div>
            <div className="flex justify-between font-bold text-ink">
              <span>Amount due</span>
              <span>{formatCurrency(invoice.amountDue, invoice.currency)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>Payment terms</span>
              <span>{invoice.paymentTermsDays} day(s)</span>
            </div>
          </div>

          <p className="mt-10 border-t border-slate-100 pt-5 text-center text-xs text-slate-400">
            This document reflects the invoice snapshot stored by the Supply Medicals service. Verify account and
            commercial details before payment.
          </p>
        </CardBody>
      </Card>

      <Modal
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        title="Void this invoice"
        description="Voiding is recorded on the invoice and cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setVoidOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={voidInvoice.isPending} onClick={() => voidInvoice.mutate()}>
              Void invoice
            </Button>
          </>
        }
      >
        <Field id="void-reason" label="Reason" required>
          <Textarea
            id="void-reason"
            rows={3}
            value={voidReason}
            onChange={(event) => setVoidReason(event.target.value)}
            placeholder="e.g. Duplicate invoice raised in error"
          />
        </Field>
        <p className="mt-3 text-xs text-slate-500">
          Current status: <strong>{humanize(invoice.status)}</strong>
        </p>
      </Modal>
    </>
  );
}
