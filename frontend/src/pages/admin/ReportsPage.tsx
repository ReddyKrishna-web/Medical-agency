import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, FileSpreadsheet, RefreshCcw } from 'lucide-react';
import { api, apiBlob, saveBlob } from '@/lib/api';
import { buildExportParams } from '@/lib/payloads';
import { useToast } from '@/contexts/ToastContext';
import { errorMessage, formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import { humanize } from '@/lib/status';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, SelectInput, TextInput } from '@/components/ui/Form';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import type { ExportType } from '@/types/api';

const EXPORT_TYPES: ExportType[] = ['orders', 'customers', 'products', 'salesmen', 'inventory', 'invoices', 'payments'];

/** The API exposes on-screen reports for these types only; the rest are CSV exports. */
type ViewType = 'orders' | 'customers' | 'products' | 'salesmen' | 'inventory';
const VIEW_TYPES: ViewType[] = ['orders', 'customers', 'products', 'salesmen', 'inventory'];

const TITLES: Record<ExportType, string> = {
  orders: 'Orders report',
  customers: 'Customers report',
  products: 'Products report',
  salesmen: 'Sales representatives report',
  inventory: 'Inventory report',
  invoices: 'Invoices report',
  payments: 'Payments report',
};

type CellKind = 'text' | 'number' | 'money' | 'date' | 'status';

interface ReportColumn {
  key: string;
  label: string;
  kind?: CellKind;
}

/** Curated columns per report so document ids and JSON blobs never reach the table. */
const REPORT_COLUMNS: Record<ViewType, ReportColumn[]> = {
  orders: [
    { key: 'orderNumber', label: 'Order' },
    { key: 'customerName', label: 'Customer' },
    { key: 'status', label: 'Status', kind: 'status' },
    { key: 'itemCount', label: 'Lines', kind: 'number' },
    { key: 'units', label: 'Units', kind: 'number' },
    { key: 'grandTotal', label: 'Value', kind: 'money' },
    { key: 'createdAt', label: 'Placed', kind: 'date' },
  ],
  customers: [
    { key: 'businessName', label: 'Business' },
    { key: 'city', label: 'City' },
    { key: 'status', label: 'Status', kind: 'status' },
    { key: 'orderCount', label: 'Orders', kind: 'number' },
    { key: 'orderValue', label: 'Value', kind: 'money' },
    { key: 'lastOrderAt', label: 'Last order', kind: 'date' },
  ],
  products: [
    { key: 'productName', label: 'Product' },
    { key: 'sku', label: 'SKU' },
    { key: 'unitsSold', label: 'Units sold', kind: 'number' },
    { key: 'revenue', label: 'Revenue', kind: 'money' },
    { key: 'stockOnHand', label: 'On hand', kind: 'number' },
    { key: 'stockValue', label: 'Stock value', kind: 'money' },
    { key: 'earliestExpiry', label: 'Earliest expiry', kind: 'date' },
  ],
  salesmen: [
    { key: 'name', label: 'Representative' },
    { key: 'employeeCode', label: 'Code' },
    { key: 'assignedCustomers', label: 'Customers', kind: 'number' },
    { key: 'orders', label: 'Orders', kind: 'number' },
    { key: 'revenue', label: 'Revenue', kind: 'money' },
    { key: 'averageOrderValue', label: 'Average order', kind: 'money' },
  ],
  inventory: [
    { key: 'productName', label: 'Product' },
    { key: 'batchNumber', label: 'Batch' },
    { key: 'quantityAvailable', label: 'Available', kind: 'number' },
    { key: 'expiryDate', label: 'Expires', kind: 'date' },
    { key: 'stockValue', label: 'Stock value', kind: 'money' },
    { key: 'location', label: 'Location' },
    { key: 'status', label: 'Status', kind: 'status' },
  ],
};

const numberish = (value: unknown) => (typeof value === 'number' ? value : Number(value));

const moneyish = (key: string) => /amount|revenue|total|value|price|cost|paid|due|tax/i.test(key);

function cell(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return moneyish(key) ? formatCurrency(value) : formatNumber(value);
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}/.test(value) ? formatDate(value) : value;
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const labelFor = (key: string): string =>
  key
    .replaceAll('_', ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase());


/** Adapts the real nested report shapes to a table + bar chart. */
function extract(type: ExportType, payload: unknown) {
  switch (type) {
    case 'orders': {
      const value = (payload ?? {}) as { orders?: Array<Record<string, unknown>>; daily?: Array<Record<string, unknown>>; totals?: Record<string, unknown> };
      return {
        rows: value.orders ?? [],
        totals: value.totals ?? {},
        chart: (value.daily ?? []).map((point) => ({ label: String(point.date ?? ''), value: numberish(point.value) })),
      };
    }
    case 'customers': {
      const value = (payload ?? {}) as { customers?: Array<Record<string, unknown>>; byStatus?: Array<{ _id?: string; count?: number }> };
      return {
        rows: value.customers ?? [],
        totals: (payload as { totals?: Record<string, unknown> }).totals ?? {},
        chart: (value.byStatus ?? []).map((point) => ({ label: humanize(point._id), value: numberish(point.count) })),
      };
    }
    case 'products': {
      const value = (payload ?? {}) as { products?: Array<Record<string, unknown>>; totals?: Record<string, unknown> };
      return {
        rows: value.products ?? [],
        totals: value.totals ?? {},
        chart: (value.products ?? []).slice(0, 15).map((row) => ({ label: String(row.productName ?? ''), value: numberish(row.revenue) })),
      };
    }
    case 'salesmen': {
      const value = (payload ?? {}) as { salesmen?: Array<Record<string, unknown>> };
      return {
        rows: value.salesmen ?? [],
        totals: {},
        chart: (value.salesmen ?? []).map((row) => ({ label: String(row.employeeCode ?? ''), value: numberish(row.revenue) })),
      };
    }
    case 'inventory':
    default: {
      const value = (payload ?? {}) as { items?: Array<Record<string, unknown>>; totals?: Record<string, unknown> };
      return {
        rows: value.items ?? [],
        totals: value.totals ?? {},
        chart: (value.items ?? []).slice(0, 20).map((row) => ({ label: String(row.batchNumber ?? ''), value: numberish(row.quantityAvailable) })),
      };
    }
  }
}

export default function ReportsPage() {
  const { showToast } = useToast();
  const [type, setType] = useState<ExportType>('orders');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const onScreen = (VIEW_TYPES as ExportType[]).includes(type);

  const query = useQuery({
    queryKey: ['reports', type, { from, to }],
    queryFn: () => api<unknown>(`/reports/${type}`, { params: { from: from || undefined, to: to || undefined } }),
    placeholderData: (previous) => previous,
    retry: false,
    enabled: onScreen,
  });

  const { rows, totals, chart } = extract(type, query.data);

  const columns: Column<Record<string, unknown>>[] = (onScreen ? REPORT_COLUMNS[type as ViewType] : []).map(
    (column) => ({
      key: column.key,
      header: column.label,
      render: (row) => {
        const value = row[column.key];
        if (column.kind === 'status') {
          return value ? <Badge value={String(value)} /> : <span className="text-muted">—</span>;
        }
        if (column.kind === 'money' || column.kind === 'number' || column.kind === 'date') {
          return <span className="whitespace-nowrap tabular-nums">{cell(column.key, value)}</span>;
        }
        return <span className="block max-w-[260px] truncate">{cell(column.key, value)}</span>;
      },
    }),
  );

  const exportCsv = async () => {
    setExporting(true);
    try {
      // The export route is authenticated, so it is fetched as a blob.
      const blob = await apiBlob('/reports/export', { params: buildExportParams(type, from, to) });
      saveBlob(blob, `supply-medicals-${type}-${new Date().toISOString().slice(0, 10)}.csv`);
      showToast('success', 'CSV export downloaded');
    } catch (error) {
      showToast('error', 'Export unavailable', errorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Business intelligence"
        title="Reports"
        description="Date-filtered operational reports returned by the service, with real CSV exports."
        actions={
          <Button onClick={() => void exportCsv()} loading={exporting}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <Card className="mb-5 p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="report-type" label="Report">
            <SelectInput id="report-type" value={type} onChange={(event) => setType(event.target.value as ExportType)}>
              {EXPORT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {TITLES[value]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field id="report-start" label="From">
            <TextInput id="report-start" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field id="report-end" label="To">
            <TextInput id="report-end" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={() => void query.refetch()}>
              <RefreshCcw className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </div>
      </Card>

      {Object.keys(totals).length > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(totals)
            .slice(0, 8)
            .map(([key, value]) => (
              <div key={key} className="rounded-lg border border-line bg-white p-4">
                <p className="text-[10px] font-medium uppercase tracking-[.12em] text-muted">{labelFor(key)}</p>
                <p className="mt-1.5 text-[18px] font-semibold tabular-nums text-charcoal">{cell(key, value)}</p>
              </div>
            ))}
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader
            title={TITLES[type]}
            description={
              onScreen
                ? `${rows.length} row${rows.length === 1 ? '' : 's'} returned for the selected filters`
                : 'On-screen report unavailable — use Export CSV'
            }
            action={<FileSpreadsheet className="h-5 w-5 text-navy-400" />}
          />
          {onScreen ? (
            <DataTable
              columns={columns}
              rows={rows}
              getKey={(row) => String(row.id ?? row._id ?? row.employeeCode ?? row.orderNumber ?? row.batchNumber ?? '')}
              minWidth="720px"
              loading={query.isLoading}
              error={query.error}
              onRetry={() => void query.refetch()}
              emptyTitle="No report data"
              emptyDescription="The service returned no rows for these date filters."
            />
          ) : (
            <EmptyState
              icon={FileSpreadsheet}
              title="This report is export-only"
              description="The service exposes invoices and payments as CSV exports, not as an on-screen report. Use Export CSV to download the same data."
              action={
                <Button onClick={() => void exportCsv()} loading={exporting}>
                  <Download className="h-4 w-4" /> Export CSV
                </Button>
              }
            />
          )}
      </Card>

      {onScreen && (
        <Card className="mt-5">
          <CardHeader title="Comparison view" description="Only labelled numeric values are charted." />
          <CardBody className="h-72">
              {query.isLoading ? (
                <LoadingState rows={5} />
              ) : query.error ? (
                <ErrorState error={query.error} onRetry={() => void query.refetch()} />
              ) : chart.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e5de" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#5f665f' }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={104}
                      tick={{ fontSize: 10, fill: '#5f665f' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value) => formatNumber(Number(value))}
                      contentStyle={{ borderRadius: 8, borderColor: '#e5e5de', fontSize: 12 }}
                    />
                    <Bar dataKey="value" fill="#35584b" barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="No chartable values"
                  description="This report may contain only totals or document-level rows."
                />
              )}
          </CardBody>
        </Card>
      )}

      <p className="mt-5 text-xs leading-5 text-muted">
        CSV downloads are generated by <code>GET /reports/export</code> and fetched with the session token. No CSV is
        assembled from decorative frontend data.
      </p>
    </>
  );
}
