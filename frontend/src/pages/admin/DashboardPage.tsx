import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  FileBarChart,
  Package,
  Send,
  ShoppingBag,
  Truck,
  Users,
  UserRoundCheck,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { mapDashboard } from '@/lib/adapters';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { humanize } from '@/lib/status';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
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
function ChartCard({ title, description, points, loading, error, onRetry, kind = 'line', dataKey = 'count', valueFormatter }: ChartCardProps) {
  const formatValue = (value: number) => (valueFormatter ? valueFormatter(Number(value)) : formatNumber(value));
  return (
    <Card className="min-h-80">
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
          <div className="h-64 w-full" aria-label={title}>
            <ResponsiveContainer width="100%" height="100%">
              {kind === 'bar' ? (
                <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={formatValue} width={64} allowDecimals={false} />
                  <Tooltip formatter={(value) => formatValue(Number(value))} contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }} />
                  <Bar dataKey={dataKey} fill="#1f82f5" radius={[6, 6, 0, 0]} maxBarSize={42} />
                </BarChart>
              ) : (
                <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={formatValue} width={64} allowDecimals={false} />
                  <Tooltip formatter={(value) => formatValue(Number(value))} contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }} />
                  <Line type="monotone" dataKey={dataKey} stroke="#1f82f5" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
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

const statusCount = (status: string, breakdown: Array<{ status: string; count: number }>) =>
  breakdown.find((row) => row.status === status)?.count ?? 0;

const metricValue = (value?: number) => (value === undefined ? '—' : value);

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

  const inventoryPoints: SeriesPoint[] = ['EXPIRED', 'OUT_OF_STOCK', 'LOW_STOCK', 'OK'].map((status) => ({
    label: humanize(status),
    count: (inventory.data?.items ?? []).filter((item) => item.status === status).length,
    value: (inventory.data?.items ?? [])
      .filter((item) => item.status === status)
      .reduce((total, item) => total + item.quantityAvailable, 0),
  }));

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        <StatCard label="Customer accounts" value={m?.catalog.visibleCustomers} icon={Users} loading={dashboard.isLoading} hint="Visible to your role" />
        <StatCard label="Sales representatives" value={m?.metrics?.totalSalesmen} icon={UserRoundCheck} tone="purple" loading={dashboard.isLoading} hint="Sales accounts in the agency" />
        <StatCard label="Active products" value={m?.catalog.activeProducts} icon={Boxes} tone="blue" loading={dashboard.isLoading} hint="Orderable catalog records" />
        <StatCard label="Orders in range" value={m?.orders.total} icon={ShoppingBag} tone="blue" loading={dashboard.isLoading} hint="Created in the selected period" />
        <StatCard label="Orders today" value={m?.metrics?.todayOrders} icon={ClipboardCheck} tone="blue" loading={dashboard.isLoading} hint="Created today" />
        <StatCard label="Open orders" value={m?.orders.open} icon={ClipboardCheck} tone="amber" loading={dashboard.isLoading} hint="Not delivered or cancelled" />
        <StatCard label="Processing" value={m?.metrics?.processingOrders} icon={Truck} tone="purple" loading={dashboard.isLoading} hint="Confirmed through packed" />
        <StatCard label="Dispatched" value={m?.metrics?.dispatchedOrders} icon={Send} tone="blue" loading={dashboard.isLoading} hint="Out for delivery" />
        <StatCard label="Delivered" value={m?.orders.delivered} icon={CheckCircle2} tone="green" loading={dashboard.isLoading} hint="Completed in range" />
        <StatCard label="Delivered revenue" value={m?.orders.revenue} icon={DollarSign} tone="green" loading={dashboard.isLoading} hint="Server-calculated order value" />
        <StatCard
          label="This month"
          value={metricValue(m?.metrics?.monthlyRevenue)}
          icon={DollarSign}
          tone="blue"
          loading={dashboard.isLoading}
          hint={`${formatNumber(m?.metrics?.monthlyOrders)} orders this month`}
        />
        <StatCard label="Low-stock products" value={m?.metrics?.lowStock} icon={AlertTriangle} tone="amber" loading={dashboard.isLoading} hint="Below the agency threshold" />
        <StatCard label="Out of stock" value={m?.metrics?.outOfStock} icon={AlertTriangle} tone="amber" loading={dashboard.isLoading} hint="No sellable units" />
        <StatCard label="Expiring units" value={m?.metrics?.expiringSoon} icon={Package} tone="amber" loading={dashboard.isLoading} hint="Inside the configured window" />
        <StatCard label="Outstanding" value={m?.finance.outstandingAmount} icon={DollarSign} tone="blue" loading={dashboard.isLoading} hint="Amount due on issued invoices" />
        <StatCard label="Follow-ups due" value={m?.metrics?.followUpsDue} icon={CalendarClock} tone="amber" loading={dashboard.isLoading} hint="Scheduled actions" />
      </div>

      {dashboard.error && (
        <div className="mt-5">
          <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ChartCard
          title="Orders per day"
          description="Daily order counts for the default reporting window."
          points={daily}
          loading={orders.isLoading}
          error={orders.error}
          onRetry={() => void orders.refetch()}
          dataKey="count"
        />
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
        <ChartCard
          title="Batch stock position"
          description="Real batch counts per status from the inventory report."
          points={inventoryPoints}
          loading={inventory.isLoading}
          error={inventory.error}
          onRetry={() => void inventory.refetch()}
          kind="bar"
        />
        <Card className="min-h-80">
          <CardHeader title="Order status breakdown" description="Count and value per status in the reporting window." />
          <CardBody className="space-y-3">
            {dashboard.isLoading ? (
              <LoadingState rows={4} />
            ) : (m?.orderStatusBreakdown ?? []).length === 0 ? (
              <EmptyState title="No orders in this window" description="Widen the reporting range on the reports screen." className="py-10" />
            ) : (
              (m?.orderStatusBreakdown ?? []).map((row) => (
                <div key={row.status} className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-700">{humanize(row.status)}</span>
                  <span className="flex items-center gap-4 text-sm">
                    <span className="font-bold text-slate-800">{formatNumber(row.count)}</span>
                    <span className="w-28 text-right text-slate-500">{formatCurrency(row.value)}</span>
                  </span>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/admin/orders" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft hover:border-brand-200">
          <ShoppingBag className="h-5 w-5 text-brand-700" />
          <p className="mt-3 font-extrabold text-ink">Process orders</p>
          <p className="mt-1 text-sm text-slate-500">Review, confirm, pack and dispatch.</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-700">
            Open queue <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
        <Link to="/admin/customers" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft hover:border-brand-200">
          <Users className="h-5 w-5 text-medical-700" />
          <p className="mt-3 font-extrabold text-ink">Customer approvals</p>
          <p className="mt-1 text-sm text-slate-500">Approve, reject and assign shops.</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-700">
            Manage customers <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
        <Link to="/admin/inventory" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft hover:border-brand-200">
          <Boxes className="h-5 w-5 text-amber-700" />
          <p className="mt-3 font-extrabold text-ink">Stock and expiry</p>
          <p className="mt-1 text-sm text-slate-500">Receive stock and review expiry signals.</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-700">
            Open inventory <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
        <Link to="/admin/salesmen" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft hover:border-brand-200">
          <Send className="h-5 w-5 text-brand-700" />
          <p className="mt-3 font-extrabold text-ink">Sales team</p>
          <p className="mt-1 text-sm text-slate-500">Issue credentials and assign accounts.</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-700">
            Open salesmen <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      </div>
    </>
  );
}
