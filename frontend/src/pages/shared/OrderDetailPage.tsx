import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, CheckCircle2, Clock3, CopyPlus, PackageCheck, Printer, RefreshCcw, Truck } from 'lucide-react';
import { api, apiSend } from '@/lib/api';
import { mapOrder, mapOrderMutation, mapOrderTimeline } from '@/lib/adapters';
import { buildOrderCancelPayload, buildOrderStatusPayload, buildReorderPayload } from '@/lib/payloads';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { errorMessage, formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import { ORDER_STATUSES, humanize } from '@/lib/status';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, SelectInput, Textarea } from '@/components/ui/Form';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import type { OrderStatus } from '@/types/api';

export default function OrderDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const role = user?.role ?? 'customer';
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderNotes, setReorderNotes] = useState('');

  useDocumentTitle(`Order ${id?.slice(-8) ?? ''}`);

  const orderQuery = useQuery({
    queryKey: ['order', id],
    queryFn: async () => mapOrder(await api<unknown>(`/orders/${id}`)),
    enabled: Boolean(id),
  });

  const timelineQuery = useQuery({
    queryKey: ['order-timeline', id],
    queryFn: () => api<unknown>(`/orders/${id}/timeline`),
    enabled: Boolean(id),
  });

  const order = orderQuery.data;
  const timeline = timelineQuery.data ? mapOrderTimeline(timelineQuery.data) : null;

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['order', id] });
    void queryClient.invalidateQueries({ queryKey: ['order-timeline', id] });
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory'] });
  };

  // The mutation returns `{ order, previousStatus, status }`.
  const update = useMutation({
    mutationFn: () => {
      if (!status) throw new Error('Choose the next status.');
      return apiSend<unknown>('post', `/orders/${id}/status`, buildOrderStatusPayload(status, note));
    },
    onSuccess: (raw) => {
      const result = mapOrderMutation(raw);
      invalidateAll();
      showToast(
        'success',
        'Order status updated',
        `${humanize(result.previousStatus)} to ${humanize(result.status)}`,
      );
      setStatus('');
      setNote('');
    },
    onError: (error) => showToast('error', 'Status not updated', errorMessage(error)),
  });

  const cancelOrder = useMutation({
    mutationFn: () => {
      if (cancelReason.trim().length < 3) throw new Error('A cancellation reason is required.');
      return apiSend<unknown>('post', `/orders/${id}/cancel`, buildOrderCancelPayload(cancelReason));
    },
    onSuccess: (raw) => {
      const result = mapOrderMutation(raw);
      invalidateAll();
      showToast(
        'success',
        'Order cancelled',
        result.stockDisposition && result.stockDisposition !== 'NOT_ALLOCATED'
          ? `Stock disposition: ${humanize(result.stockDisposition)}`
          : undefined,
      );
      setCancelOpen(false);
      setCancelReason('');
    },
    onError: (error) => showToast('error', 'Order not cancelled', errorMessage(error)),
  });

  // Reorder calls the real endpoint; the source order's history is never edited.
  const reorder = useMutation({
    mutationFn: () => {
      if (!id) throw new Error('Missing order id.');
      return apiSend<unknown>('post', '/orders/reorder', buildReorderPayload(id, reorderNotes));
    },
    onSuccess: (raw) => {
      const created = mapOrder(raw);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      showToast('success', 'New order created', `Order ${created.orderNumber} was re-priced and created as a separate record.`);
      setReorderOpen(false);
      setReorderNotes('');
      navigate(`/${role}/orders/${created.id}`);
    },
    onError: (error) => showToast('error', 'Could not create the repeat order', errorMessage(error)),
  });

  if (orderQuery.isLoading) return <LoadingState rows={7} />;
  if (orderQuery.error) return <ErrorState error={orderQuery.error} onRetry={() => void orderQuery.refetch()} />;
  if (!order) return <EmptyState title="Order not found" action={<Button onClick={() => navigate(`/${role}/orders`)}>Back to orders</Button>} />;

  const allowed = order.permissions?.allowedTransitions ?? [];
  const canCancel = order.permissions?.canCancel ?? false;
  const isTerminal = order.status === 'DELIVERED' || order.status === 'CANCELLED';

  return (
    <>
      <PageHeader
        eyebrow={`Order ${order.orderNumber}`}
        title="Order details"
        description={`Created ${formatDate(order.createdAt, 'dd MMM yyyy, HH:mm')} by ${humanize(order.source)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">Print</span>
            </Button>
            <Button variant="outline" onClick={() => setReorderOpen(true)}>
              <CopyPlus className="h-4 w-4" /> Repeat order
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link to={`/${role}/orders`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-700">
          <ArrowLeft className="h-4 w-4" /> All orders
        </Link>
        <span className="text-slate-300">/</span>
        <Badge value={order.status} />
        <Badge value={order.allocationState} tone="slate" />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Order items" description="Prices, tax and line totals are snapshots taken by the service." />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead className="border-y border-slate-100 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Product</th>
                    <th className="px-5 py-3">Batch allocation</th>
                    <th className="px-5 py-3 text-right">Qty</th>
                    <th className="px-5 py-3 text-right">Unit price</th>
                    <th className="px-5 py-3 text-right">Tax</th>
                    <th className="px-5 py-3 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.items.map((item) => (
                    <tr key={item.productId}>
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-800">{item.productName}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {item.sku} - {item.unit}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {item.allocations.length
                          ? item.allocations
                              .map(
                                (allocation) =>
                                  `${allocation.batchNumber} x${formatNumber(
                                    allocation.quantity - allocation.releasedQuantity,
                                  )} (exp ${formatDate(allocation.expiryDate)})`,
                              )
                              .join(', ')
                          : 'Not allocated yet'}
                      </td>
                      <td className="px-5 py-4 text-right font-semibold">{formatNumber(item.quantity)}</td>
                      <td className="px-5 py-4 text-right">{formatCurrency(item.unitPrice, order.currency)}</td>
                      <td className="px-5 py-4 text-right text-slate-500">
                        {formatNumber(item.taxRate)}% ({formatCurrency(item.taxAmount, order.currency)})
                      </td>
                      <td className="px-5 py-4 text-right font-semibold">{formatCurrency(item.lineTotal, order.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ml-auto w-full max-w-sm space-y-2 border-t border-slate-100 p-5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{formatCurrency(order.subtotal, order.currency)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tax</span>
                <span>{formatCurrency(order.taxTotal, order.currency)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-3 text-lg font-extrabold text-ink">
                <span>Grand total</span>
                <span>{formatCurrency(order.grandTotal, order.currency)}</span>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Order timeline" description="Server-recorded status history." />
            <CardBody>
              {timelineQuery.isLoading ? (
                <LoadingState rows={3} />
              ) : timelineQuery.error ? (
                <ErrorState error={timelineQuery.error} onRetry={() => void timelineQuery.refetch()} />
              ) : timeline?.timeline.length ? (
                <ol className="space-y-0">
                  {timeline.timeline.map((entry, index) => (
                    <li key={`${entry.at}-${index}`} className="relative flex gap-4 pb-7 last:pb-0">
                      <div className="flex flex-col items-center">
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-medical-50 text-medical-700">
                          <CheckCircle2 className="h-4 w-4" />
                        </span>
                        {index < timeline.timeline.length - 1 && <span className="mt-1 h-full w-px bg-slate-200" />}
                      </div>
                      <div className="pt-1">
                        <p className="text-sm font-bold text-slate-800">
                          {entry.from ? `${humanize(entry.from)} to ${humanize(entry.to)}` : humanize(entry.to)}
                        </p>
                        {entry.note && <p className="mt-1 text-sm text-slate-500">{entry.note}</p>}
                        <p className="mt-1 text-xs text-slate-400">
                          {formatDate(entry.at, 'dd MMM yyyy, HH:mm')}
                          {entry.byRole ? ` by ${humanize(entry.byRole)}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState icon={Clock3} title="No timeline entries yet" description="Status history appears once the service records a change." />
              )}

              {Object.keys(order.statusTimestamps).length > 0 && (
                <div className="mt-6 border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Status timestamps</p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    {Object.entries(order.statusTimestamps).map(([key, value]) => (
                      <li key={key} className="flex justify-between gap-4">
                        <span>{humanize(key)}</span>
                        <span>{formatDate(value, 'dd MMM yyyy, HH:mm')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24">
          <Card>
            <CardHeader title="Order summary" />
            <CardBody className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Customer</p>
                <p className="mt-1 font-bold text-slate-800">{order.customerName}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                <div>
                  <p className="text-xs text-slate-400">Source</p>
                  <p className="mt-1 font-semibold">{humanize(order.source)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Last updated</p>
                  <p className="mt-1 font-semibold">{formatDate(order.updatedAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Currency</p>
                  <p className="mt-1 font-semibold">{order.currency}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Reordered from</p>
                  <p className="mt-1 font-semibold">{order.reorderedFromOrderId ? order.reorderedFromOrderId.slice(-8) : '—'}</p>
                </div>
              </div>
              {order.cancellation && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <p className="font-bold">Cancelled {formatDate(order.cancellation.at)}</p>
                  <p className="mt-1">{order.cancellation.reason}</p>
                  {order.cancellation.stockDisposition && (
                    <p className="mt-1 text-xs">Stock disposition: {humanize(order.cancellation.stockDisposition)}</p>
                  )}
                </div>
              )}
              {order.invoiceId && (
                <Link
                  to={`/${role}/invoices/${order.invoiceId}`}
                  className="block rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm font-semibold text-brand-800"
                >
                  View linked invoice
                </Link>
              )}
            </CardBody>
          </Card>

          {role === 'admin' && !isTerminal && allowed.length > 0 && (
            <Card>
              <CardHeader title="Process order" description="Only the transitions the service allows are offered." />
              <CardBody className="space-y-4">
                <Field id="status" label="Next status" required>
                  <SelectInput
                    id="status"
                    value={status}
                    onChange={(event) => setStatus(event.target.value as OrderStatus)}
                  >
                    <option value="">Choose a status</option>
                    {ORDER_STATUSES.filter((value) => allowed.includes(value)).map((value) => (
                      <option key={value} value={value}>
                        {humanize(value)}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field id="status-note" label="Internal note" hint="Optional; stored on the timeline.">
                  <Textarea id="status-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
                </Field>
                <Button className="w-full" disabled={!status} loading={update.isPending} onClick={() => update.mutate()}>
                  <RefreshCcw className="h-4 w-4" /> Update status
                </Button>
              </CardBody>
            </Card>
          )}

          {!isTerminal && canCancel && (
            <Card>
              <CardHeader title="Cancel order" />
              <CardBody>
                <p className="mb-4 text-sm leading-6 text-slate-600">
                  Cancellation is recorded on the timeline and releases or restores any reserved stock.
                </p>
                <Button variant="danger" className="w-full" onClick={() => setCancelOpen(true)}>
                  <Ban className="h-4 w-4" /> Cancel this order
                </Button>
              </CardBody>
            </Card>
          )}

          <div className="rounded-2xl bg-ink p-5 text-white">
            <Truck className="h-5 w-5 text-medical-300" />
            <p className="mt-3 text-sm font-bold">Questions about this order?</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Message your account team and include {order.orderNumber}.
            </p>
            <Link to={`/${role}/messages`} className="mt-4 inline-flex text-sm font-bold text-medical-300">
              Open messages
            </Link>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelOrder.mutate()}
        loading={cancelOrder.isPending}
        title="Cancel this order?"
        description="This is recorded permanently on the order timeline and cannot be undone from this screen."
        confirmLabel="Cancel order"
        danger
      >
        <Field id="cancel-reason" label="Cancellation reason" required>
          <Textarea
            id="cancel-reason"
            rows={3}
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="e.g. Customer requested a different delivery date"
          />
        </Field>
      </ConfirmDialog>

      <Modal
        open={reorderOpen}
        onClose={() => setReorderOpen(false)}
        title="Repeat this order"
        description="The service creates a new order re-priced today. The original order, its timeline and invoice are untouched."
        footer={
          <>
            <Button variant="ghost" onClick={() => setReorderOpen(false)}>
              Cancel
            </Button>
            <Button loading={reorder.isPending} onClick={() => reorder.mutate()}>
              <PackageCheck className="h-4 w-4" /> Create repeat order
            </Button>
          </>
        }
      >
        <Field id="reorder-notes" label="Notes" hint="Optional context for the agency.">
          <Textarea id="reorder-notes" rows={3} value={reorderNotes} onChange={(event) => setReorderNotes(event.target.value)} />
        </Field>
      </Modal>
    </>
  );
}
