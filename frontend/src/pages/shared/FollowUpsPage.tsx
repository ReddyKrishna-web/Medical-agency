import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, Edit3, Plus, Search } from 'lucide-react';
import { apiMeta, apiSend } from '@/lib/api';
import { mapCustomers, mapFollowUps } from '@/lib/adapters';
import {
  buildFollowUpCreatePayload,
  buildFollowUpStatusPayload,
  buildFollowUpUpdatePayload,
  type FollowUpFormValues,
} from '@/lib/payloads';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useDebounce } from '@/hooks/useDebounce';
import { errorMessage, formatDate, toDateTimeInput } from '@/lib/utils';
import { FOLLOW_UP_STATUSES, FOLLOW_UP_TARGET_STATUSES, FOLLOW_UP_TYPES, humanize } from '@/lib/status';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, SelectInput, TextInput, Textarea } from '@/components/ui/Form';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import type { FollowUp, FollowUpStatus, FollowUpType } from '@/types/api';

const customerNameOf = (followUp: FollowUp) =>
  followUp.customerId && typeof followUp.customerId === 'object' ? followUp.customerId.businessName : '—';

const isOverdue = (followUp: FollowUp) =>
  followUp.status === 'PENDING' && Boolean(followUp.dueAt) && new Date(followUp.dueAt).getTime() < Date.now();

export default function FollowUpsPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'salesman';
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FollowUp | null>(null);
  const [form, setForm] = useState<FollowUpFormValues>({ customerId: '', title: '', notes: '', type: 'CALL', dueAt: '' });

  const debounced = useDebounce(search);

  const query = useQuery({
    queryKey: ['follow-ups', { page, search: debounced, status, type }],
    queryFn: async () => {
      // `FOLLOW_UP_SORT_FIELDS` allows sorting by `dueAt`.
      const { data, meta } = await apiMeta<unknown>('/follow-ups', {
        params: {
          page,
          limit: 20,
          sort: 'dueAt',
          search: debounced || undefined,
          status: status || undefined,
          type: type || undefined,
        },
      });
      return { rows: mapFollowUps(data), total: Number(meta.total ?? 0) };
    },
    placeholderData: (previous) => previous,
  });

  const customers = useQuery({
    queryKey: ['customers', { followups: true }],
    queryFn: async () => mapCustomers((await apiMeta<unknown>('/customers', { params: { page: 1, limit: 100 } })).data),
    enabled: role !== 'customer',
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!editing) return;
    const customerId = editing.customerId && typeof editing.customerId === 'object' ? editing.customerId.id : '';
    setForm((current) => ({
      ...current,
      customerId: customerId || current.customerId,
      title: editing.title,
      notes: editing.notes ?? '',
      type: editing.type,
      dueAt: toDateTimeInput(editing.dueAt),
    }));
  }, [editing]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['follow-ups'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const save = useMutation({
    mutationFn: () =>
      editing
        ? apiSend<unknown>(
            'patch',
            `/follow-ups/${editing.id}`,
            buildFollowUpUpdatePayload({ title: form.title, notes: form.notes, type: form.type, dueAt: form.dueAt }),
          )
        : apiSend<unknown>('post', '/follow-ups', buildFollowUpCreatePayload(form)),
    onSuccess: () => {
      invalidate();
      setOpen(false);
      setEditing(null);
      showToast('success', editing ? 'Follow-up updated' : 'Follow-up created');
    },
    onError: (error) => showToast('error', 'Could not save follow-up', errorMessage(error)),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, next, note }: { id: string; next: FollowUpStatus; note?: string }) =>
      apiSend('post', `/follow-ups/${id}/status`, buildFollowUpStatusPayload(next, note)),
    onSuccess: () => {
      invalidate();
      showToast('success', 'Follow-up status updated');
    },
    onError: (error) => showToast('error', 'Status not updated', errorMessage(error)),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? rows.length;

  const openNew = () => {
    setEditing(null);
    setForm({ customerId: '', title: '', notes: '', type: 'CALL', dueAt: '' });
    setOpen(true);
  };

  const columns: Column<FollowUp>[] = [
    {
      key: 'title',
      header: 'Follow-up',
      render: (item) => (
        <div>
          <p className="text-[13.5px] font-medium text-charcoal">{item.title}</p>
          <p className="mt-1 line-clamp-1 text-xs text-muted">{item.notes || 'No notes added'}</p>
        </div>
      ),
    },
    { key: 'customer', header: 'Customer', render: customerNameOf },
    { key: 'type', header: 'Type', render: (item) => humanize(item.type), mobileLabel: false },
    {
      key: 'due',
      header: 'Due',
      render: (item) => (
        <span className={isOverdue(item) ? 'font-semibold text-red-600' : undefined}>{formatDate(item.dueAt, 'dd MMM yyyy, HH:mm')}</span>
      ),
    },
    { key: 'status', header: 'Status', render: (item) => <Badge value={item.status} /> },
    {
      key: 'actions',
      header: '',
      render: (item) => (
        <div className="flex items-center gap-2">
          {item.status === 'PENDING' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                updateStatus.mutate({ id: item.id, next: 'COMPLETED' });
              }}
            >
              <CheckCircle2 className="h-4 w-4" /> Complete
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              setEditing(item);
              setOpen(true);
            }}
          >
            <Edit3 className="h-4 w-4" /> Edit
          </Button>
        </div>
      ),
      mobileLabel: false,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Account activity"
        title="Follow-ups"
        description="Dated customer actions, sorted by due date. A customer must have an assigned salesman before one can be scheduled."
        actions={
          role !== 'customer' ? (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> New follow-up
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 rounded-lg border border-line bg-white p-4 sm:grid-cols-[1fr_180px_160px]">
        <div className="relative">
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-muted" />
          <TextInput
            aria-label="Search follow-ups"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search title or notes"
            className="pl-10"
          />
        </div>
        <SelectInput
          aria-label="Filter by status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {FOLLOW_UP_STATUSES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </SelectInput>
        <SelectInput
          aria-label="Filter by type"
          value={type}
          onChange={(event) => {
            setType(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All types</option>
          {FOLLOW_UP_TYPES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </SelectInput>
      </div>

      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={rows}
          getKey={(item) => item.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          emptyTitle="No follow-ups"
          emptyDescription={role === 'customer' ? 'Your account team records follow-ups here.' : 'Schedule the next customer action.'}
          emptyAction={
            role !== 'customer' ? (
              <Button size="sm" onClick={openNew}>
                <CalendarClock className="h-4 w-4" /> Create follow-up
              </Button>
            ) : undefined
          }
          footer={<Pagination page={page} limit={20} total={total} onPageChange={setPage} />}
        />
      </Card>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        title={editing ? 'Edit follow-up' : 'New follow-up'}
        description="This action is recorded against the assigned customer account."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button loading={save.isPending} disabled={!form.title.trim() || !form.dueAt || (!editing && !form.customerId)} onClick={() => save.mutate()}>
              {editing ? 'Save changes' : 'Create follow-up'}
            </Button>
          </>
        }
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <Field id="follow-customer" label="Customer" required>
            <SelectInput
              id="follow-customer"
              value={form.customerId}
              onChange={(event) => setForm({ ...form, customerId: event.target.value })}
              disabled={Boolean(editing)}
            >
              <option value="">Choose customer</option>
              {(customers.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.businessName}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field id="follow-title" label="Title" required>
            <TextInput
              id="follow-title"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="What needs to happen?"
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="follow-due" label="Due" required>
            <TextInput
              id="follow-due"
              type="datetime-local"
              value={form.dueAt ?? ''}
              onChange={(event) => setForm({ ...form, dueAt: event.target.value })}
            />
          </Field>
            <Field id="follow-type" label="Type" required>
              <SelectInput
                id="follow-type"
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value as FollowUpType })}
              >
                {FOLLOW_UP_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {humanize(value)}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <Field id="follow-notes" label="Notes" hint="Optional">
            <Textarea
              id="follow-notes"
              rows={4}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </Field>
          {editing && (
            <div className="rounded-md bg-ivory p-3 text-xs leading-5 text-muted">
              Current status: <strong>{humanize(editing.status)}</strong>. Changing status uses the dedicated status
              action so the service can validate the transition.
            </div>
          )}
        </form>
      </Modal>

      {editing && (
        <Card className="mt-4 p-4">
          <p className="text-sm text-[13.5px] font-medium text-charcoal">Change status</p>
          <p className="mt-1 text-xs text-muted">
            The service only accepts PENDING to COMPLETED or CANCELLED, and a completed follow-up can no longer change.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {FOLLOW_UP_TARGET_STATUSES.filter((value) => value !== editing.status).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={value === 'CANCELLED' ? 'danger' : 'outline'}
                onClick={() => updateStatus.mutate({ id: editing.id, next: value })}
              >
                {humanize(value)}
              </Button>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
