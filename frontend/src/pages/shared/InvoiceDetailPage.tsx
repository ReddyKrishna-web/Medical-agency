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
        <Link to={`/${role}/invoices`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-navy-700 hover:text-brand-700">
          <ArrowLeft className="h-4 w-4" /> All invoices
        </Link>
      </div>

      <Card className="invoice-print mx-auto max-w-4xl overflow-hidden">
        <div className="flex flex-col gap-5 border-b border-line bg-ink p-7 text-white sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[.2em] text-sage">Tax / billing record</p>
            <h2 className="mt-2 font-display text-[28px] font-semibold leading-tight">{snapshot.name || 'Agency'}</h2>
            {snapshot.legalName && <p className="mt-1 text-[13px] text-white/70">{snapshot.legalName}</p>}
            <p className="mt-1 text-[13px] text-white/70">Invoice {invoice.invoiceNumber}</p>
          </div>
          <div className="text-left sm:text-right">
            <Badge value={invoice.status} />
            <p className="mt-3 text-[13px] text-white/70">Issued {formatDate(invoice.issuedAt)}</p>
            <p className="mt-1 text-[13px] text-white/70">Due {formatDate(invoice.dueAt)}</p>
            {invoice.voidReason && <p className="mt-1 text-sm text-red-300">Void: {invoice.voidReason}</p>}
          </div>
        </div>

        <CardBody className="p-7">
          <div className="grid gap-7 border-b border-line pb-7 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-[.12em] text-muted">Billed to</p>
              <p className="mt-2 font-semibold text-charcoal">{invoice.customerName}</p>
              {invoice.customerPhone && <p className="mt-1 text-[13px] text-muted">{invoice.customerPhone}</p>}
              {invoice.customerGstNumber && <p className="text-[13px] text-muted">GST {invoice.customerGstNumber}</p>}
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-medium uppercase tracking-[.12em] text-muted">From</p>
              <p className="mt-2 whitespace-pre-line text-[13px] leading-6 text-navy-700">
                {snapshot.address ? addressLines(snapshot.address) : '—'}
              </p>
              <p className="mt-2 text-[13px] text-navy-700">
                {snapshot.email}
                {snapshot.phone ? ` - ${snapshot.phone}` : ''}
              </p>
              {snapshot.gstNumber && <p className="text-[13px] text-navy-700">GST {snapshot.gstNumber}</p>}
            </div>
          </div>

          <div className="overflow-x-auto py-7">
            <table className="w-full min-w-[560px] text-left">
              <thead className="border-b border-line text-[11px] uppercase tracking-[.1em] text-muted">
                <tr>
                  <th className="py-3">Description</th>
                  <th className="py-3 text-right">Qty</th>
                  <th className="py-3 text-right">Unit price</th>
                  <th className="py-3 text-right">Tax</th>
                  <th className="py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoice.lines.length ? (
                  invoice.lines.map((line, index) => (
                    <tr key={`${line.productId}-${index}`}>
                      <td className="py-4">
                        <p className="text-[13.5px] font-medium text-charcoal">{line.productName}</p>
                        <p className="text-xs text-muted">
                          {line.sku} - {line.unit}
                        </p>
                      </td>
                      <td className="py-4 text-right">{line.quantity}</td>
                      <td className="py-4 text-right">{formatCurrency(line.unitPrice, invoice.currency)}</td>
                      <td className="py-4 text-right text-muted">{formatCurrency(line.taxAmount, invoice.currency)}</td>
                      <td className="py-4 text-right font-semibold">{formatCurrency(line.lineTotal, invoice.currency)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[13px] text-muted">
                      This invoice did not include line items.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="ml-auto max-w-sm space-y-3 border-t border-line pt-5 text-sm">
            <div className="flex justify-between text-navy-700">
              <span>Subtotal</span>
              <span>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
            </div>
            <div className="flex justify-between text-navy-700">
              <span>Tax</span>
              <span>{formatCurrency(invoice.taxTotal, invoice.currency)}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-[20px] font-semibold text-charcoal">
              <span>Grand total</span>
              <span>{formatCurrency(invoice.grandTotal, invoice.currency)}</span>
            </div>
            <div className="flex justify-between text-brand-700">
              <span>Amount paid</span>
              <span>{formatCurrency(invoice.amountPaid, invoice.currency)}</span>
            </div>
            <div className="flex justify-between font-semibold text-charcoal">
              <span>Amount due</span>
              <span>{formatCurrency(invoice.amountDue, invoice.currency)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted">
              <span>Payment terms</span>
              <span>{invoice.paymentTermsDays} day(s)</span>
            </div>
          </div>

          <p className="mt-10 border-t border-line pt-5 text-center text-xs text-muted">
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
        <p className="mt-3 text-xs text-muted">
          Current status: <strong>{humanize(invoice.status)}</strong>
        </p>
      </Modal>
    </>
  );
}
