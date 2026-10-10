import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, Search } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { apiMeta } from '@/lib/api';
import { mapCustomers } from '@/lib/adapters';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/Form';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import type { Customer } from '@/types/api';

export default function CustomersPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);

  // A salesman only ever sees the accounts assigned to them.
  const query = useQuery({
    queryKey: ['customers', { page, search: debounced, scope: 'salesman' }],
    queryFn: async () => {
      const { data, meta } = await apiMeta<unknown>('/customers', { params: { page, limit: 20, search: debounced || undefined } });
      return { rows: mapCustomers(data), total: Number(meta.total ?? 0) };
    },
    placeholderData: (previous) => previous,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? rows.length;

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Organisation',
      render: (customer) => (
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <Building2 className="h-4 w-4" />
          </span>
          <div>
            <p className="font-bold text-slate-800">{customer.businessName}</p>
            <p className="text-xs text-slate-400">{customer.address?.city || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (customer) => (
        <div>
          <p>{customer.ownerName}</p>
          <p className="text-xs text-slate-400">{customer.phone || 'No phone recorded'}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (customer) => <Badge value={customer.status} /> },
    { key: 'since', header: 'Added', render: (customer) => formatDate(customer.createdAt), mobileLabel: false },
    {
      key: 'actions',
      header: '',
      render: (customer) => (
        <Link
          to={`/salesman/customers/${customer.id}`}
          onClick={(event) => event.stopPropagation()}
          className="font-semibold text-brand-700"
        >
          Open
        </Link>
      ),
      mobileLabel: false,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Sales coverage"
        title="My customers"
        description="Accounts assigned to you by the agency administrator."
      />

      <Card className="mb-4 p-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
          <TextInput
            aria-label="Search assigned customers"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search business, owner, phone or GST"
            className="pl-10"
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={rows}
          getKey={(customer) => customer.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          onRowClick={(customer) => navigate(`/salesman/customers/${customer.id}`)}
          emptyTitle="No assigned customers"
          emptyDescription="Customers assigned to your account by the agency administrator will appear here."
          emptyAction={
            <Button variant="outline" onClick={() => navigate('/salesman/messages')}>
              Contact your team
            </Button>
          }
          footer={<Pagination page={page} limit={20} total={total} onPageChange={setPage} />}
        />
      </Card>
    </>
  );
}
