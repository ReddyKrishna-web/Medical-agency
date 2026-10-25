import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight, CalendarClock, CheckCircle2, ContactRound, IndianRupee, PackagePlus, ShoppingBag, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, apiMeta } from '@/lib/api';
import { mapCustomers, mapDashboard, mapFollowUps, mapOrders } from '@/lib/adapters';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import { humanize } from '@/lib/status';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import type { DailyPoint } from '@/types/api';

export default function SalesmanDashboard() {
  const { user } = useAuth();
  useDocumentTitle('Sales overview');

  const metrics = useQuery({
    queryKey: ['reports', 'dashboard', 'salesman'],
    queryFn: async () => mapDashboard(await api<unknown>('/reports/dashboard')),
  });

  const trend = useQuery({
    queryKey: ['reports', 'orders', 'salesman'],
    queryFn: () => api<{ daily?: DailyPoint[] }>('/reports/orders'),
    retry: false,
  });

  const customers = useQuery({
    queryKey: ['customers', { page: 1 }],
    queryFn: async () => {
      const { data } = await apiMeta<unknown>('/customers', { params: { page: 1, limit: 6 } });
      return mapCustomers(data);
    },
  });

  const orders = useQuery({
    queryKey: ['orders', 'salesman', 'dashboard'],
    queryFn: async () => {
      const { data } = await apiMeta<unknown>('/orders', { params: { page: 1, limit: 6, sort: '-createdAt' } });
      return mapOrders(data);
    },
  });

  const followUps = useQuery({
    queryKey: ['follow-ups', { page: 1 }],
    queryFn: async () => {
      const { data } = await apiMeta<unknown>('/follow-ups', { params: { page: 1, limit: 6, status: 'PENDING', sort: 'dueAt' } });
      return mapFollowUps(data);
    },
  });

  const m = metrics.data;
  const orderRows = orders.data ?? [];
  const customerRows = customers.data ?? [];
  const followRows = followUps.data ?? [];
  const chart = (trend.data?.daily ?? []).map((point) => ({ label: point.date, count: point.count }));

  return (
    <>
      <PageHeader
        eyebrow="Sales workspace"
        title={`Welcome back, ${user?.name?.split(' ')[0] ?? 'sales representative'}`}
        description="Your assigned accounts, orders and follow-up metrics from the live database."
        actions={
          <>
            <Link to="/salesman/create-order">
              <Button>
                <PackagePlus className="h-4 w-4" /> Create order
              </Button>
            </Link>
            <Link to="/salesman/follow-ups">
              <Button variant="outline">
                <CalendarClock className="h-4 w-4" /> Follow-ups
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Assigned customers" value={m?.catalog.visibleCustomers} icon={Users} loading={metrics.isLoading} hint="Accounts in your portfolio" />
        <StatCard label="Orders in range" value={m?.orders.total} icon={ShoppingBag} tone="blue" loading={metrics.isLoading} hint="Reporting window" />
        <StatCard label="Orders today" value={m?.metrics?.todayOrders} icon={Activity} tone="blue" loading={metrics.isLoading} hint="Created today" />
        <StatCard label="Open orders" value={m?.orders.open} icon={Activity} tone="amber" loading={metrics.isLoading} hint="Awaiting agency action" />
        <StatCard label="Follow-ups due" value={m?.metrics?.followUpsDue ?? m?.followUps.pending} icon={CalendarClock} tone="amber" loading={metrics.isLoading} hint="Pending scheduled actions" />
        <StatCard label="Delivered" value={m?.orders.delivered} icon={CheckCircle2} tone="green" loading={metrics.isLoading} hint="Completed in range" />
        <StatCard
          label="Delivered revenue"
          value={m?.orders.revenue === undefined ? undefined : formatCurrency(m.orders.revenue)}
          icon={IndianRupee}
          tone="purple"
          loading={metrics.isLoading}
          hint="Server-calculated value"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <Card className="min-h-80">
          <CardHeader title="Order activity" description="Daily order counts for the default reporting window." />
          <CardBody>
            {trend.isLoading ? (
              <LoadingState rows={5} />
            ) : trend.error ? (
              <ErrorState error={trend.error} onRetry={() => void trend.refetch()} />
            ) : chart.length === 0 ? (
              <EmptyState
                title="No order activity yet"
                description="Orders for your assigned accounts appear here once they are created."
                className="py-10"
              />
            ) : (
              <div className="h-64" aria-label="Salesman order activity chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E5DE" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#5F665F' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: '#5F665F' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#E5E5DE', fontSize: 12 }} />
                    <Bar dataKey="count" fill="#35584B" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Upcoming follow-ups"
            action={
              <Link to="/salesman/follow-ups" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                All <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          <CardBody className="p-0">
            {followUps.isLoading ? (
              <LoadingState rows={4} />
            ) : followUps.error ? (
              <ErrorState error={followUps.error} onRetry={() => void followUps.refetch()} />
            ) : followRows.length === 0 ? (
              <EmptyState title="No follow-ups due" description="Schedule the next action from a customer profile." className="py-10" />
            ) : (
              <ul className="divide-y divide-line/70">
                {followRows.map((item) => (
                  <li key={item.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium text-charcoal">
                          {item.customerId && typeof item.customerId === 'object'
                            ? item.customerId.businessName
                            : 'Customer'}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted">{item.title}</p>
                      </div>
                      <Badge value={item.type} tone="slate" />
                    </div>
                    <p className="mt-2 text-xs font-semibold text-brand-700">Due {formatDate(item.dueAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader
            title="Recent orders"
            action={
              <Link to="/salesman/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          <CardBody className="p-0">
            {orders.isLoading ? (
              <LoadingState rows={4} />
            ) : orders.error ? (
              <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
            ) : orderRows.length === 0 ? (
              <EmptyState title="No orders yet" description="Create an order for an assigned customer to get started." className="py-10" />
            ) : (
              <ul className="divide-y divide-line/70">
                {orderRows.map((order) => (
                  <li key={order.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <Link to={`/salesman/orders/${order.id}`} className="text-[13px] font-medium text-brand-700">
                        {order.orderNumber}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {order.customerName} - {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <span className="text-[13px] font-medium text-charcoal">{formatCurrency(order.grandTotal, order.currency)}</span>
                    <Badge value={order.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="My customers"
            action={
              <Link to="/salesman/customers" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          <CardBody className="p-0">
            {customers.isLoading ? (
              <LoadingState rows={4} />
            ) : customers.error ? (
              <ErrorState error={customers.error} onRetry={() => void customers.refetch()} />
            ) : customerRows.length === 0 ? (
              <EmptyState
                icon={ContactRound}
                title="No assigned customers"
                description="The agency administrator assigns customer accounts to salesmen."
                className="py-10"
              />
            ) : (
              <ul className="divide-y divide-line/70">
                {customerRows.map((customer) => (
                  <li key={customer.id} className="flex items-center gap-3 px-5 py-4">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-navy-50 text-brand-700">
                      <ContactRound className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/salesman/customers/${customer.id}`}
                        className="truncate text-[13.5px] font-medium text-charcoal hover:text-brand-700"
                      >
                        {customer.businessName}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {customer.phone || humanize(customer.status)}
                      </p>
                    </div>
                    <Link to={`/salesman/customers/${customer.id}`} className="text-sm font-semibold text-brand-700">
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <p className="mt-6 text-xs text-muted">
        {formatNumber(m?.orders.total)} orders and {formatNumber(m?.metrics?.followUpsDue ?? m?.followUps.pending)} pending
        follow-ups in the current reporting window.
      </p>
    </>
  );
}
