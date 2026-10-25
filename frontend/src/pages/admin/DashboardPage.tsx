import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarClock,
  FileBarChart,
  Send,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { mapDashboard } from '@/lib/adapters';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { humanize } from '@/lib/status';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState, Skeleton } from '@/components/ui/States';
import { usePrefersReducedMotion } from '@/components/motion/Motion';
import type { DailyPoint } from '@/types/api';

interface SeriesPoint {
  label: string;
  count: number;
  value: number;
}

interface ChartCardProps {
  title: string;
  description: string;
  points: SeriesPoint[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  kind?: 'line' | 'bar';
  dataKey?: 'count' | 'value';
  valueFormatter?: (value: number) => string;
}

/** Daily points are `{ date, count, value }` from `GET /reports/orders`. */
function ChartCard({
  title,
  description,
  points,
  loading,
  error,
  onRetry,
  kind = 'line',
  dataKey = 'count',
  valueFormatter,
}: ChartCardProps) {
  const formatValue = (value: number) => (valueFormatter ? valueFormatter(Number(value)) : formatNumber(value));
  const reduceMotion = usePrefersReducedMotion();
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        {loading ? (
          <LoadingState rows={5} />
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : points.length === 0 ? (
          <EmptyState
            title="No report data yet"
            description="This chart stays empty until the authorized aggregates contain data for the selected period."
            className="py-10"
          />
        ) : (
          <div className="h-60 w-full" aria-label={title}>
            <ResponsiveContainer width="100%" height="100%">
              {kind === 'bar' ? (
                <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E5DE" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#6E756E' }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#6E756E' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={formatValue}
                    width={64}
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(value) => formatValue(Number(value))}
                    contentStyle={{ borderRadius: 8, borderColor: '#E5E5DE', fontSize: 12 }}
                  />
                  <Bar dataKey={dataKey} fill="#35584B" radius={[4, 4, 0, 0]} maxBarSize={42} isAnimationActive={!reduceMotion} />
                </BarChart>
              ) : (
                <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E5DE" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#6E756E' }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#6E756E' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={formatValue}
                    width={64}
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(value) => formatValue(Number(value))}
                    contentStyle={{ borderRadius: 8, borderColor: '#E5E5DE', fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey={dataKey}
                    stroke="#557DA8"
                    strokeWidth={2}
                    dot={points.length === 1 ? { r: 3, fill: '#557DA8', strokeWidth: 0 } : false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={!reduceMotion}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

const toSeries = (points: DailyPoint[] | undefined): SeriesPoint[] =>
  (points ?? []).map((point) => ({ label: point.date, count: point.count, value: point.value }));

const metricValue = (value?: number) => (value === undefined ? undefined : value);

export default function AdminDashboard() {
  useDocumentTitle('Command center');

  const dashboard = useQuery({
    queryKey: ['reports', 'dashboard', 'admin'],
    queryFn: async () => mapDashboard(await api<unknown>('/reports/dashboard')),
  });

  const orders = useQuery({
    queryKey: ['reports', 'orders', 'admin'],
    queryFn: () => api<{ daily?: DailyPoint[] }>('/reports/orders'),
    retry: false,
  });

  const inventory = useQuery({
    queryKey: ['reports', 'inventory', 'admin'],
    queryFn: () =>
      api<{ items?: Array<{ batchNumber: string; status: string; quantityAvailable: number }> }>('/reports/inventory'),
    retry: false,
  });

  const m = dashboard.data;
  const daily = toSeries(orders.data?.daily);
  const loading = dashboard.isLoading;

  const inventoryPoints: SeriesPoint[] = ['EXPIRED', 'OUT_OF_STOCK', 'LOW_STOCK', 'OK'].map((status) => ({
    label: humanize(status),
    count: (inventory.data?.items ?? []).filter((item) => item.status === status).length,
    value: (inventory.data?.items ?? [])
      .filter((item) => item.status === status)
      .reduce((total, item) => total + item.quantityAvailable, 0),
  }));

  const attention = [
    { label: 'Low stock products', value: m?.metrics?.lowStock, to: '/admin/inventory', tone: 'amber' as const },
    { label: 'Out of stock', value: m?.metrics?.outOfStock, to: '/admin/inventory', tone: 'red' as const },
    { label: 'Expiring units', value: m?.metrics?.expiringSoon, to: '/admin/inventory', tone: 'amber' as const },
    { label: 'Follow-ups due', value: m?.metrics?.followUpsDue, to: '/admin/salesmen', tone: 'neutral' as const },
  ];

  const workspace = [
    { label: 'Customer accounts', value: m?.catalog.visibleCustomers },
    { label: 'Sales representatives', value: m?.metrics?.totalSalesmen },
    { label: 'Active products', value: m?.catalog.activeProducts },
    { label: 'Orders in range', value: m?.orders.total },
    { label: 'Processing', value: m?.metrics?.processingOrders },
    { label: 'Delivered', value: m?.orders.delivered },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Agency administration"
        title="Command center"
        description={`Live aggregates for ${m?.agency.name ?? 'your agency'}, computed from authorized records.`}
        actions={
          <Link to="/admin/reports">
            <Button variant="outline">
              <FileBarChart className="h-4 w-4" /> Open reports
            </Button>
          </Link>
        }
      />

      {dashboard.error && (
        <div className="mb-5">
          <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
        </div>
      )}

      <Card>
        <dl className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
          {[
            { label: 'Delivered revenue', value: m?.orders.revenue, currency: true, hint: 'In the reporting window' },
            { label: 'Open orders', value: m?.orders.open, hint: 'Not delivered or cancelled' },
            { label: 'Orders today', value: m?.metrics?.todayOrders, hint: `${formatNumber(m?.metrics?.monthlyOrders)} this month` },
            { label: 'Outstanding', value: m?.finance.outstandingAmount, currency: true, hint: 'Due on issued invoices' },
          ].map((item) => (
            <div key={item.label} className="p-5">
              <dt className="text-[11px] font-medium uppercase tracking-[.12em] text-muted">{item.label}</dt>
              {loading ? (
                <Skeleton className="mt-3 h-8 w-24" />
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

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ChartCard
          title="Orders per day"
          description="Daily order counts for the default reporting window."
          points={daily}
          loading={orders.isLoading}
          error={orders.error}
          onRetry={() => void orders.refetch()}
          dataKey="count"
        />

        <Card>
          <CardHeader title="Needs attention" description="Inventory and field activity that may need action." />
          <CardBody className="p-0">
            <ul className="divide-y divide-line/70">
              {attention.map((item) => (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-ivory"
                  >
                    <span className="flex items-center gap-2.5 text-sm text-charcoal">
                      <span
                        aria-hidden
                        className={
                          item.tone === 'red'
                            ? 'h-1.5 w-1.5 rounded-full bg-red-500'
                            : item.tone === 'amber'
                              ? 'h-1.5 w-1.5 rounded-full bg-amber-500'
                              : 'h-1.5 w-1.5 rounded-full bg-navy-400'
                        }
                      />
                      {item.label}
                    </span>
                    <span className="flex items-center gap-3">
                      {loading ? (
                        <Skeleton className="h-5 w-8" />
                      ) : (
                        <span className="text-sm font-semibold tabular-nums text-charcoal">
                          {metricValue(item.value) === undefined ? '—' : formatNumber(item.value)}
                        </span>
                      )}
                      <ArrowRight className="h-3.5 w-3.5 text-navy-400" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ChartCard
          title="Order value per day"
          description="Server-calculated grand totals for the same window."
          points={daily}
          loading={orders.isLoading}
          error={orders.error}
          onRetry={() => void orders.refetch()}
          dataKey="value"
          valueFormatter={(value) => formatCurrency(value)}
        />

        <Card>
          <CardHeader title="Order status" description="Count and value per status in the reporting window." />
          <CardBody className="space-y-3">
            {dashboard.isLoading ? (
              <LoadingState rows={4} />
            ) : (m?.orderStatusBreakdown ?? []).length === 0 ? (
              <EmptyState title="No orders in this window" description="Widen the reporting range on the reports screen." className="py-10" />
            ) : (
              (m?.orderStatusBreakdown ?? []).map((row) => (
                <div key={row.status} className="flex items-center justify-between gap-3 border-b border-line/60 pb-3 last:border-0 last:pb-0">
                  <span className="text-sm text-charcoal">{humanize(row.status)}</span>
                  <span className="flex items-center gap-4 text-sm tabular-nums">
                    <span className="font-semibold text-charcoal">{formatNumber(row.count)}</span>
                    <span className="w-24 text-right text-muted">{formatCurrency(row.value)}</span>
                  </span>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Workspace at a glance"
          description="A compact view of the accounts and catalogue behind the work."
          action={
            <Link to="/admin/products" className="text-[13px] font-medium text-brand-700 hover:text-brand-800">
              Open catalogue
            </Link>
          }
        />
        <dl className="grid grid-cols-2 divide-line sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
          {workspace.map((item) => (
            <div key={item.label} className="px-5 py-4">
              <dt className="text-[11px] uppercase tracking-[.1em] text-muted">{item.label}</dt>
              <dd className="mt-1.5 text-lg font-semibold tabular-nums text-charcoal">
                {loading ? <Skeleton className="h-5 w-10" /> : metricValue(item.value) === undefined ? '—' : formatNumber(item.value)}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { to: '/admin/orders', icon: ShoppingBag, title: 'Process orders', text: 'Review, confirm, pack and dispatch.', action: 'Open queue' },
          { to: '/admin/customers', icon: Users, title: 'Customer account status', text: 'Activate, disable and assign shops.', action: 'Manage customers' },
          { to: '/admin/inventory', icon: Boxes, title: 'Stock and expiry', text: 'Receive stock and review expiry signals.', action: 'Open inventory' },
          { to: '/admin/salesmen', icon: Send, title: 'Sales team', text: 'Issue credentials and assign accounts.', action: 'Open salesmen' },
        ].map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="group rounded-xl border border-line bg-white p-5 transition-colors hover:border-brand-300"
          >
            <span className="grid h-9 w-9 place-items-center rounded-md bg-sage text-brand-700">
              <item.icon className="h-4 w-4" />
            </span>
            <p className="mt-3 text-[14px] font-semibold text-charcoal">{item.title}</p>
            <p className="mt-1 text-[13px] leading-6 text-muted">{item.text}</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-700">
              {item.action}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" /> {formatNumber(m?.metrics?.followUpsDue)} follow-ups due
        </span>
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" /> {formatNumber(m?.metrics?.lowStock)} low-stock products
        </span>
      </div>
    </>
  );
}
