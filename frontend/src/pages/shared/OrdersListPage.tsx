import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Eye, PackagePlus, ShoppingBag } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { apiMeta } from '@/lib/api';
import { mapOrders } from '@/lib/adapters';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import { ORDER_STATUSES, humanize } from '@/lib/status';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { SelectInput, TextInput } from '@/components/ui/Form';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import type { Order } from '@/types/api';

export default function OrdersListPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'customer';
  const navigate = useNavigate();
  const [urlParams] = useSearchParams();
  const customerId = urlParams.get('customer') || '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const debounced = useDebounce(search);

  const query = useQuery({
    queryKey: ['orders', role, { page, search: debounced, status, customerId }],
    queryFn: async () => {
      const { data, meta } = await apiMeta<unknown>('/orders', {
        params: {
          page,
          limit: 20,
          search: debounced || undefined,
          status: status || undefined,
          customerId: customerId || undefined,
        },
      });
      return { rows: mapOrders(data), total: Number(meta.total ?? 0) };
    },
    placeholderData: (previous) => previous,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? rows.length;

  const columns: Column<Order>[] = [
    {
      key: 'number',
      header: 'Order',
      render: (order) => (
        <div>
          <p className="font-bold text-slate-800">{order.orderNumber}</p>
          <p className="mt-0.5 text-xs text-slate-400">{formatDate(order.createdAt, 'dd MMM yyyy, HH:mm')}</p>
        </div>
      ),
    },
    { key: 'customer', header: 'Customer', render: (order) => order.customerName },
    {
      key: 'items',
      header: 'Lines',
      render: (order) => `${order.items.length} line${order.items.length === 1 ? '' : 's'}`,
      mobileLabel: false,
    },
    { key: 'status', header: 'Status', render: (order) => <Badge value={order.status} /> },
    {
      key: 'total',
      header: 'Grand total',
      render: (order) => (
        <span className="font-semibold text-slate-800">{formatCurrency(order.grandTotal, order.currency)}</span>
      ),
      mobileLabel: false,
    },
    {
      key: 'action',
      header: '',
      render: (order) => (
        <Link
          to={`/${role}/orders/${order.id}`}
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-900"
        >
          <Eye className="h-4 w-4" /> View
        </Link>
      ),
      mobileLabel: false,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Procurement"
        title="Orders"
        description="Live status, commercial totals and fulfilment progress for the orders you can see."
        actions={
          <Link to={`/${role}/create-order`}>
            <Button>
              <PackagePlus className="h-4 w-4" /> New order
            </Button>
          </Link>
        }
      />

      {customerId && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
          <span>Showing orders for one customer account.</span>
          <Link to={`/${role}/orders`} className="font-semibold">
            Clear filter
          </Link>
        </div>
      )}

      <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft sm:grid-cols-[1fr_220px]">
        <TextInput
          aria-label="Search orders"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search order number or customer"
        />
        <SelectInput
          aria-label="Filter by status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </SelectInput>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <DataTable
          columns={columns}
          rows={rows}
          getKey={(order) => order.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          onRowClick={(order) => navigate(`/${role}/orders/${order.id}`)}
          emptyTitle="No orders found"
          emptyDescription={
            debounced || status
              ? 'Try clearing your search or status filter.'
              : 'Orders created in this workspace will appear here.'
          }
          emptyAction={
            !debounced && !status ? (
              <Link to={`/${role}/create-order`}>
                <Button variant="outline">
                  <ShoppingBag className="h-4 w-4" /> Create first order
                </Button>
              </Link>
            ) : undefined
          }
          footer={<Pagination page={page} limit={20} total={total} onPageChange={setPage} />}
        />
      </div>

      <p className="mt-3 text-xs text-slate-400">{formatNumber(total)} matching orders returned by the service.</p>
    </>
  );
}
