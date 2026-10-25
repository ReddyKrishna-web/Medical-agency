import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { apiMeta } from '@/lib/api';
import { mapInvoices } from '@/lib/adapters';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate } from '@/lib/utils';
import { INVOICE_STATUSES, humanize } from '@/lib/status';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectInput, TextInput } from '@/components/ui/Form';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import type { Invoice } from '@/types/api';

export default function InvoicesListPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'customer';
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const debounced = useDebounce(search);

  const query = useQuery({
    queryKey: ['invoices', { page, search: debounced, status }],
    queryFn: async () => {
      const { data, meta } = await apiMeta<unknown>('/invoices', {
        params: { page, limit: 20, search: debounced || undefined, status: status || undefined },
      });
      return { rows: mapInvoices(data), total: Number(meta.total ?? 0) };
    },
    placeholderData: (previous) => previous,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? rows.length;

  const columns: Column<Invoice>[] = [
    {
      key: 'invoice',
      header: 'Invoice',
      render: (invoice) => (
        <div>
          <p className="text-[13.5px] font-medium text-charcoal">{invoice.invoiceNumber}</p>
          <p className="mt-0.5 text-xs text-muted">Order {invoice.orderNumber}</p>
        </div>
      ),
    },
    { key: 'customer', header: 'Customer', render: (invoice) => invoice.customerName },
    { key: 'issued', header: 'Issued', render: (invoice) => formatDate(invoice.issuedAt) },
    { key: 'due', header: 'Due', render: (invoice) => formatDate(invoice.dueAt), mobileLabel: false },
    { key: 'status', header: 'Status', render: (invoice) => <Badge value={invoice.status} /> },
    {
      key: 'total',
      header: 'Grand total',
      render: (invoice) => (
        <span className="text-[13.5px] font-medium text-charcoal">{formatCurrency(invoice.grandTotal, invoice.currency)}</span>
      ),
      mobileLabel: false,
    },
    {
      key: 'dueAmount',
      header: 'Amount due',
      render: (invoice) => (
        <span className={invoice.amountDue > 0 ? 'font-medium text-amber-700' : 'text-muted'}>
          {formatCurrency(invoice.amountDue, invoice.currency)}
        </span>
      ),
      mobileLabel: false,
    },
    {
      key: 'action',
      header: '',
      render: (invoice) => (
        <span className="flex items-center gap-3">
          <Link to={`/${role}/invoices/${invoice.id}`} className="font-semibold text-brand-700">
            View
          </Link>
          <Link
            to={`/${role}/invoices/${invoice.id}?print=1`}
            className="text-muted transition-colors hover:text-charcoal"
            aria-label={`Print ${invoice.invoiceNumber}`}
          >
            <Printer className="h-4 w-4" />
          </Link>
        </span>
      ),
      mobileLabel: false,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Invoices"
        description="Account-scoped invoice records generated when the service completes a delivery."
      />

      <div className="mb-4 grid gap-3 rounded-lg border border-line bg-white p-4 sm:grid-cols-[1fr_220px]">
        <TextInput
          aria-label="Search invoices"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search invoice or order number"
        />
        <SelectInput
          aria-label="Filter by invoice status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {INVOICE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </SelectInput>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <DataTable
          columns={columns}
          rows={rows}
          getKey={(invoice) => invoice.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          onRowClick={(invoice) => navigate(`/${role}/invoices/${invoice.id}`)}
          emptyTitle="No invoices found"
          emptyDescription="Invoices become available once an order is delivered."
          footer={<Pagination page={page} limit={20} total={total} onPageChange={setPage} />}
        />
      </div>
    </>
  );
}
