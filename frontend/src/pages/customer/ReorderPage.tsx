import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, History, RefreshCw, ShoppingBag } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { apiMeta, apiSend } from '@/lib/api';
import { mapOrder, mapOrders } from '@/lib/adapters';
import { buildReorderPayload } from '@/lib/payloads';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useToast } from '@/contexts/ToastContext';
import { errorMessage, formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/Form';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, EmptyState, LoadingState } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Pagination';
import type { Order } from '@/types/api';

const REPEATABLE = new Set(['DISPATCHED', 'DELIVERED']);

export default function ReorderPage() {
  useDocumentTitle('Repeat order');
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);

  const orders = useQuery({
    queryKey: ['orders', 'customer', 'reorder', { page, search: debounced }],
    queryFn: async () => {
      const { data, meta } = await apiMeta<unknown>('/orders', {
        params: { page, limit: 12, search: debounced || undefined, sort: '-createdAt' },
      });
      return { rows: mapOrders(data), total: Number(meta.total ?? 0) };
    },
    placeholderData: (previous) => previous,
  });

  /**
   * `POST /orders/reorder` creates a brand new order re-priced today. The source
   * order, its timeline and its invoice are never modified.
   */
  const reorder = useMutation({
    mutationFn: (order: Order) => apiSend<unknown>('post', '/orders/reorder', buildReorderPayload(order.id)),
    onSuccess: (raw, order) => {
      const created = mapOrder(raw);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      showToast(
        'success',
        'Repeat order created',
        `${order.orderNumber} was copied into ${created.orderNumber}. The original order is unchanged.`,
      );
      navigate(`/customer/orders/${created.id}`);
    },
    onError: (error) => showToast('error', 'Could not create the repeat order', errorMessage(error)),
  });

  const allRows = orders.data?.rows ?? [];
  const rows = allRows.filter((order) => REPEATABLE.has(order.status));

  return (
    <>
      <PageHeader
        eyebrow="Fast repeat procurement"
        title="Repeat an order"
        description="Choose a fulfilled order and the service will re-price the same lines as a new order. Historical orders are never modified."
        actions={
          <Button variant="outline" onClick={() => void orders.refetch()} loading={orders.isFetching}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <Card className="mb-5 p-4">
        <label className="sr-only" htmlFor="reorder-search">
          Search previous orders
        </label>
        <TextInput
          id="reorder-search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search order number or customer"
        />
      </Card>

      {orders.isLoading ? (
        <LoadingState rows={5} />
      ) : orders.error ? (
        <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={History}
          title="No fulfilled orders to repeat yet"
          description="Once an order is dispatched or delivered, its product list appears here for one-click repeat ordering."
          action={
            <Button onClick={() => navigate('/customer/create-order')}>
              <ShoppingBag className="h-4 w-4" /> Create a new order
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((order) => (
            <Card key={order.id} className="overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-700">Previous order</p>
                  <h2 className="mt-1 text-lg font-extrabold text-ink">{order.orderNumber}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatDate(order.createdAt, 'dd MMM yyyy, HH:mm')} - {order.items.length} line items
                  </p>
                </div>
                <div className="text-right">
                  <Badge value={order.status} />
                  <p className="mt-2 text-sm font-extrabold text-ink">{formatCurrency(order.grandTotal, order.currency)}</p>
                </div>
              </div>
              <CardBody>
                <ul className="mb-4 space-y-2">
                  {order.items.slice(0, 4).map((item) => (
                    <li key={item.productId} className="flex justify-between gap-4 text-sm">
                      <span className="min-w-0 truncate text-slate-700">
                        {item.productName}
                        <span className="text-xs text-slate-400"> ({item.sku})</span>
                      </span>
                      <span className="shrink-0 font-semibold text-slate-500">{formatNumber(item.quantity)}</span>
                    </li>
                  ))}
                  {order.items.length > 4 && (
                    <li className="text-xs font-semibold text-slate-400">+ {order.items.length - 4} more line items</li>
                  )}
                </ul>
                <Button className="w-full" loading={reorder.isPending} onClick={() => reorder.mutate(order)}>
                  <RefreshCw className="h-4 w-4" /> Repeat this order <ArrowRight className="h-4 w-4" />
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {(orders.data?.total ?? 0) > 12 && <Pagination page={page} limit={12} total={orders.data?.total ?? 0} onPageChange={setPage} />}
    </>
  );
}
