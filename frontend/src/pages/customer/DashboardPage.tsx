import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  FileText,
  MessageSquareText,
  Package,
  PackagePlus,
  RefreshCcw,
} from 'lucide-react';
import { api, apiMeta } from '@/lib/api';
import { mapDashboard, mapOrders, mapRequirements } from '@/lib/adapters';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import type { Order } from '@/types/api';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function CustomerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  useDocumentTitle('Customer overview');

  const metrics = useQuery({
    queryKey: ['reports', 'dashboard', 'customer'],
    queryFn: async () => mapDashboard(await api<unknown>('/reports/dashboard')),
  });

  const orders = useQuery({
    queryKey: ['orders', 'customer', 'dashboard'],
    queryFn: async () => {
      const { data } = await apiMeta<unknown>('/orders', { params: { page: 1, limit: 5, sort: '-createdAt' } });
      return mapOrders(data);
    },
  });

  const requirements = useQuery({
    queryKey: ['requirements', 'customer', 'dashboard'],
    queryFn: async () => {
      const { data } = await apiMeta<unknown>('/requirements', { params: { page: 1, limit: 5 } });
      return mapRequirements(data);
    },
  });

  const m = metrics.data;
  const businessName = user?.customer?.businessName ?? 'your organisation';

  const columns: Column<Order>[] = [
    {
      key: 'number',
      header: 'Order',
      render: (order) => (
        <Link to={`/customer/orders/${order.id}`} className="font-medium text-brand-700">
          {order.orderNumber}
        </Link>
      ),
    },
    { key: 'date', header: 'Date', render: (order) => formatDate(order.createdAt) },
    {
      key: 'total',
      header: 'Grand total',
      render: (order) => <span className="font-semibold">{formatCurrency(order.grandTotal, order.currency)}</span>,
    },
    { key: 'status', header: 'Status', render: (order) => <Badge value={order.status} /> },
  ];

  const newOrderLink = (
    <Link to="/customer/create-order">
      <Button size="sm">
        <PackagePlus className="h-4 w-4" /> Create order
      </Button>
    </Link>
  );

  const quickActions = [
    { to: '/customer/create-order', label: 'Create order', icon: PackagePlus },
    { to: '/customer/reorder', label: 'Repeat an order', icon: RefreshCcw },
    { to: '/customer/requirements', label: 'Upload requirement', icon: FileText },
    { to: '/customer/messages', label: 'Message the agency', icon: MessageSquareText },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Customer workspace"
        title={greeting()}
        description={`Your live procurement overview for ${businessName}.`}
        actions={
          <Link to="/customer/create-order">
            <Button>
              <PackagePlus className="h-4 w-4" /> Create order
            </Button>
          </Link>
        }
      />

      <Card>
        <dl className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
          {[
            { label: 'Orders in range', value: m?.orders.total, hint: 'From the reporting window' },
            { label: 'Open orders', value: m?.orders.open, hint: 'Not delivered or cancelled' },
            { label: 'Delivered', value: m?.orders.delivered, hint: 'Completed in this window' },
            { label: 'Delivered value', value: m?.orders.revenue, currency: true, hint: 'Server-calculated order value' },
          ].map((item) => (
            <div key={item.label} className="p-5">
              <dt className="text-[11px] font-medium uppercase tracking-[.12em] text-muted">{item.label}</dt>
              {metrics.isLoading ? (
                <Skeleton className="mt-3 h-8 w-20" />
              ) : (
                <dd className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] text-charcoal">
                  {item.value === undefined
                    ? '—'
                    : item.currency
                      ? formatCurrency(item.value)
                      : formatNumber(item.value)}
                </dd>
              )}
              <p className="mt-2 text-xs text-muted">{item.hint}</p>
            </div>
          ))}
        </dl>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <Card className="overflow-hidden">
          <CardHeader
            title="Recent orders"
            action={
              <Link to="/customer/orders" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700">
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          <DataTable
            columns={columns}
            rows={orders.data ?? []}
            getKey={(order) => order.id}
            loading={orders.isLoading}
            error={orders.error}
            onRetry={() => void orders.refetch()}
            onRowClick={(order) => navigate(`/customer/orders/${order.id}`)}
            emptyTitle="No orders yet"
            emptyDescription="Create your first order to see it here."
            emptyAction={newOrderLink}
          />
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Quick actions" action={<Package className="h-4 w-4 text-navy-400" />} />
            <CardBody className="grid grid-cols-2 gap-2">
              {quickActions.map((action) => (
                <Link
                  key={action.to}
                  to={action.to}
                  className="flex min-h-20 flex-col justify-between rounded-lg border border-line p-3 text-[13px] font-medium text-charcoal transition-colors hover:border-brand-300 hover:bg-ivory"
                >
                  <action.icon className="h-4 w-4 text-brand-700" /> {action.label}
                </Link>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent requirements" action={<FileText className="h-4 w-4 text-navy-400" />} />
            <CardBody className="p-0">
              {(requirements.data ?? []).length ? (
                <ul className="divide-y divide-line/70">
                  {(requirements.data ?? []).slice(0, 4).map((item) => (
                    <li key={item.id}>
                      <Link to={`/customer/requirements/${item.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-ivory">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-charcoal">{item.title}</p>
                          <p className="mt-0.5 text-xs text-muted">{formatDate(item.createdAt)}</p>
                        </div>
                        <Badge value={item.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="No requirements"
                  description="Upload a document when a catalogue order is not enough."
                  action={
                    <Link to="/customer/requirements">
                      <Button size="sm" variant="outline">
                        <FileText className="h-4 w-4" /> Upload requirement
                      </Button>
                    </Link>
                  }
                  className="py-8"
                />
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {metrics.error && (
        <div className="mt-5">
          <ErrorState error={metrics.error} onRetry={() => void metrics.refetch()} />
        </div>
      )}

      <p className="mt-6 text-xs leading-5 text-muted">
        {formatNumber(m?.orders.total)} orders worth {formatCurrency(m?.orders.revenue)} in the current reporting window.
        {m?.metrics?.unpaidAmount !== undefined
          ? ` Outstanding balance ${formatCurrency(m.metrics.unpaidAmount)}.`
          : ''}{' '}
        Figures come from the authenticated reports endpoint and are never estimated when a metric is missing.
      </p>
    </>
  );
}
