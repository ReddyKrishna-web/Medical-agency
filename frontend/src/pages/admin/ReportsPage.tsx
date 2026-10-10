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
import { Field, SelectInput, TextInput } from '@/components/ui/Form';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import type { ExportType } from '@/types/api';

const EXPORT_TYPES: ExportType[] = ['orders', 'customers', 'products', 'salesmen', 'inventory', 'invoices', 'payments'];

const TITLES: Record<ExportType, string> = {
  orders: 'Orders report',
  customers: 'Customers report',
  products: 'Products report',
  salesmen: 'Sales representatives report',
  inventory: 'Inventory report',
  invoices: 'Invoices report',
  payments: 'Payments report',
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

  const query = useQuery({
    queryKey: ['reports', type, { from, to }],
    queryFn: () => api<unknown>(`/reports/${type}`, { params: { from: from || undefined, to: to || undefined } }),
    placeholderData: (previous) => previous,
    retry: false,
  });

  const { rows, totals, chart } = extract(type, query.data);

  const keys = Array.from(new Set(rows.slice(0, 20).flatMap((row) => Object.keys(row)))).slice(0, 9);
  const columns: Column<Record<string, unknown>>[] = keys.map((key) => ({
    key,
    header: key.replaceAll('_', ' '),
    render: (row) => cell(key, row[key]),
  }));

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
              <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{key.replaceAll('_', ' ')}</p>
                <p className="mt-2 text-xl font-extrabold text-ink">{cell(key, value)}</p>
              </div>
            ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden">
          <CardHeader
            title={TITLES[type]}
            description={`${rows.length} row${rows.length === 1 ? '' : 's'} returned for the selected filters`}
            action={<FileSpreadsheet className="h-5 w-5 text-slate-400" />}
          />
          <DataTable
            columns={columns}
            rows={rows}
            getKey={(row) => String(row.id ?? row.employeeCode ?? row.invoiceNumber ?? row.businessName ?? '')}
            loading={query.isLoading}
            error={query.error}
            onRetry={() => void query.refetch()}
            emptyTitle="No report data"
            emptyDescription="The service returned no rows for these date filters."
          />
        </Card>

        <Card>
          <CardHeader title="Comparison view" description="Only labelled numeric values are charted." />
          <CardBody className="h-96">
            {query.isLoading ? (
              <LoadingState rows={5} />
            ) : query.error ? (
              <ErrorState error={query.error} onRetry={() => void query.refetch()} />
            ) : chart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#1f82f5" radius={[0, 6, 6, 0]} />
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
      </div>

      <p className="mt-5 text-xs leading-5 text-slate-400">
        CSV downloads are generated by <code>GET /reports/export</code> and fetched with the session token. No CSV is
        assembled from decorative frontend data.
      </p>
    </>
  );
}
