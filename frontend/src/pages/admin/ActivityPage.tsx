import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity as ActivityIcon, Search } from 'lucide-react';
import { apiMeta } from '@/lib/api';
import { mapActivityLogs } from '@/lib/adapters';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { SelectInput, TextInput } from '@/components/ui/Form';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import type { ActivityLog } from '@/types/api';

/** `ActivityLogModel.entity` values recorded by the services. */
const ENTITIES = [
  'Order',
  'Invoice',
  'Payment',
  'Customer',
  'Salesman',
  'Product',
  'Category',
  'Inventory',
  'Batch',
  'FollowUp',
  'RequirementUpload',
  'Message',
  'User',
  'Agency',
];

const actorOf = (log: ActivityLog) => {
  const actor = log.actorUserId;
  if (!actor) return undefined;
  return typeof actor === 'object' ? actor.name ?? actor.email : undefined;
};

export default function ActivityPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [entity, setEntity] = useState('');
  const debounced = useDebounce(search);

  const query = useQuery({
    queryKey: ['activity', { page, search: debounced, entity }],
    queryFn: async () => {
      const { data, meta } = await apiMeta<unknown>('/activity', {
        params: { page, limit: 25, search: debounced || undefined, entity: entity || undefined },
      });
      return { rows: mapActivityLogs(data), total: Number(meta.total ?? 0) };
    },
    placeholderData: (previous) => previous,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? rows.length;

  const columns: Column<ActivityLog>[] = [
    { key: 'when', header: 'When', render: (item) => formatDate(item.createdAt, 'dd MMM yyyy, HH:mm') },
    { key: 'action', header: 'Action', render: (item) => <Badge value={item.action} tone="blue" /> },
    {
      key: 'entity',
      header: 'Entity',
      render: (item) => (
        <div>
          <p className="font-semibold">{item.entity || '—'}</p>
          {item.entityId && <p className="text-xs text-slate-400">{item.entityId.slice(-8)}</p>}
        </div>
      ),
    },
    {
      key: 'summary',
      header: 'Summary',
      render: (item) => (
        <div>
          <p>{item.summary || 'Activity recorded'}</p>
          <p className="mt-1 text-xs text-slate-400">
            {actorOf(item) ? `by ${actorOf(item)}` : 'system'}
            {item.actorRole ? ` (${item.actorRole})` : ''}
          </p>
        </div>
      ),
    },
    { key: 'actor', header: 'Actor role', render: (item) => item.actorRole || '—', mobileLabel: false },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Audit trail"
        title="Activity log"
        description="Service-recorded administrative and operational activity, scoped to what your role may read."
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
            <TextInput
              aria-label="Search activity"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search action or summary"
              className="pl-10"
            />
          </div>
          <SelectInput
            aria-label="Filter by entity"
            value={entity}
            onChange={(event) => {
              setEntity(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All entities</option>
            {ENTITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectInput>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={rows}
          getKey={(item) => item.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          emptyTitle="No activity found"
          emptyDescription="Administrative events appear here as the service records them."
          emptyAction={<ActivityIcon className="h-4 w-4" />}
          footer={<Pagination page={page} limit={25} total={total} onPageChange={setPage} />}
        />
      </Card>
    </>
  );
}
