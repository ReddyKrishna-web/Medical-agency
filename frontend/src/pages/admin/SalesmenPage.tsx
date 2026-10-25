import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BriefcaseBusiness, Copy, Edit3, Plus, Search, UserPlus, Users } from 'lucide-react';
import { apiMeta, apiSend } from '@/lib/api';
import { mapCustomers, mapProvisionedSalesman, mapSalesmen } from '@/lib/adapters';
import {
  buildAssignCustomersPayload,
  buildSalesmanCreatePayload,
  buildSalesmanStatusPayload,
  buildSalesmanUpdatePayload,
  type SalesmanCreateFormValues,
  type SalesmanUpdateFormValues,
} from '@/lib/payloads';
import { useToast } from '@/contexts/ToastContext';
import { useDebounce } from '@/hooks/useDebounce';
import { errorMessage, formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import { SALESMAN_STATUSES, humanize } from '@/lib/status';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, SelectInput, TextInput, Textarea } from '@/components/ui/Form';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import type { Customer, Salesman, SalesmanProvisioned, SalesmanStatus } from '@/types/api';

const emptyCreate: SalesmanCreateFormValues = {
  name: '',
  email: '',
  phone: '',
  employeeCode: '',
  territory: '',
  monthlyTarget: '',
  notes: '',
};

const emptyUpdate: SalesmanUpdateFormValues = {
  employeeCode: '',
  territory: '',
  phone: '',
  monthlyTarget: '',
  notes: '',
};

export default function SalesmenPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Salesman | null>(null);
  const [createForm, setCreateForm] = useState<SalesmanCreateFormValues>(emptyCreate);
  const [updateForm, setUpdateForm] = useState<SalesmanUpdateFormValues>(emptyUpdate);
  const [assigning, setAssigning] = useState<Salesman | null>(null);
  const [assignIds, setAssignIds] = useState<string[]>([]);
  const [suspending, setSuspending] = useState<{ salesman: Salesman; next: SalesmanStatus } | null>(null);
  const [note, setNote] = useState('');
  const [credential, setCredential] = useState<SalesmanProvisioned | null>(null);

  const debounced = useDebounce(search);

  const query = useQuery({
    queryKey: ['salesmen', { page, search: debounced, status }],
    queryFn: async () => {
      const { data, meta } = await apiMeta<unknown>('/salesmen', {
        params: { page, limit: 20, search: debounced || undefined, status: status || undefined },
      });
      return { rows: mapSalesmen(data), total: Number(meta.total ?? 0) };
    },
    placeholderData: (previous) => previous,
  });

  const assignableCustomers = useQuery({
    queryKey: ['customers', { assign: true }],
    queryFn: async () => mapCustomers((await apiMeta<unknown>('/customers', { params: { page: 1, limit: 100 } })).data),
    enabled: Boolean(assigning),
  });

  useEffect(() => {
    if (!editing) return;
    setUpdateForm({
      employeeCode: editing.employeeCode,
      territory: editing.territory ?? '',
      phone: editing.phone ?? '',
      monthlyTarget: editing.monthlyTarget === undefined ? '' : String(editing.monthlyTarget),
      notes: editing.notes ?? '',
    });
  }, [editing]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['salesmen'] });
    void queryClient.invalidateQueries({ queryKey: ['customers'] });
  };

  const create = useMutation({
    mutationFn: () => apiSend<unknown>('post', '/salesmen', buildSalesmanCreatePayload(createForm)),
    onSuccess: (raw) => {
      const provisioned = mapProvisionedSalesman(raw);
      invalidate();
      setOpen(false);
      setCreateForm(emptyCreate);
      if (provisioned.temporaryPassword) {
        // Shown exactly once, then discarded from component state.
        setCredential(provisioned);
      } else {
        showToast('success', 'Sales representative created', provisioned.employeeCode);
      }
    },
    onError: (error) => showToast('error', 'Sales representative not created', errorMessage(error)),
  });

  const update = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error('No sales representative selected.');
      return apiSend<unknown>('patch', `/salesmen/${editing.id}`, buildSalesmanUpdatePayload(updateForm));
    },
    onSuccess: () => {
      invalidate();
      setEditing(null);
      showToast('success', 'Sales representative updated');
    },
    onError: (error) => showToast('error', 'Sales representative not updated', errorMessage(error)),
  });

  const statusChange = useMutation({
    mutationFn: ({ id, next, note: reason }: { id: string; next: SalesmanStatus; note?: string }) =>
      apiSend('post', `/salesmen/${id}/status`, buildSalesmanStatusPayload(next, reason)),
    onSuccess: () => {
      invalidate();
      showToast('success', 'Sales representative status updated');
      setSuspending(null);
      setNote('');
    },
    onError: (error) => {
      showToast('error', 'Status not updated', errorMessage(error));
      setSuspending(null);
    },
  });

  // `POST /salesmen/:id/assign-customers` replaces the whole assignment set.
  const assign = useMutation({
    mutationFn: () => {
      if (!assigning) throw new Error('No sales representative selected.');
      return apiSend<unknown>('post', `/salesmen/${assigning.id}/assign-customers`, buildAssignCustomersPayload(assignIds));
    },
    onSuccess: () => {
      invalidate();
      setAssigning(null);
      setAssignIds([]);
      showToast('success', 'Customer assignment updated');
    },
    onError: (error) => showToast('error', 'Assignment not saved', errorMessage(error)),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? rows.length;

  const openAssign = (salesman: Salesman) => {
    setEditing(null);
    setAssigning(salesman);
    setAssignIds(salesman.customerIds ?? []);
  };

  const columns: Column<Salesman>[] = [
    {
      key: 'rep',
      header: 'Representative',
      render: (item) => (
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <BriefcaseBusiness className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-medium text-charcoal">{employeeName(item)}</p>
            <p className="truncate text-xs text-muted">{employeeEmail(item)}</p>
          </div>
        </div>
      ),
    },
    { key: 'code', header: 'Employee code', render: (item) => <code className="whitespace-nowrap text-[11px] text-navy-700">{item.employeeCode}</code> },
    { key: 'territory', header: 'Territory', render: (item) => item.territory || '—', mobileLabel: false },
    {
      key: 'phone',
      header: 'Phone',
      render: (item) => item.phone || '—',
      mobileLabel: false,
    },
    {
      key: 'customers',
      header: 'Assigned customers',
      render: (item) => (
        <button
          className="inline-flex items-center gap-1.5 font-semibold text-brand-700"
          onClick={(event) => {
            event.stopPropagation();
            openAssign(item);
          }}
        >
          <Users className="h-3.5 w-3.5" /> {formatNumber(item.assignedCustomerCount)}
        </button>
      ),
      mobileLabel: false,
    },
    {
      key: 'target',
      header: 'Monthly target',
      render: (item) => (item.monthlyTarget === undefined ? '—' : formatCurrency(item.monthlyTarget)),
      mobileLabel: false,
    },
    { key: 'joined', header: 'Joined', render: (item) => formatDate(item.joinedAt ?? item.createdAt), mobileLabel: false },
    { key: 'status', header: 'Status', render: (item) => <Badge value={item.status} /> },
    {
      key: 'actions',
      header: '',
      render: (item) => (
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="inline-flex items-center gap-1 font-semibold text-brand-700"
            onClick={(event) => {
              event.stopPropagation();
              setEditing(item);
            }}
          >
            <Edit3 className="h-3.5 w-3.5" /> Edit
          </button>
          {item.status === 'ACTIVE' ? (
            <button
              className="text-[13px] font-medium text-navy-700"
              onClick={(event) => {
                event.stopPropagation();
                setNote('');
                setSuspending({ salesman: item, next: 'INACTIVE' });
              }}
            >
              Deactivate
            </button>
          ) : (
            <button
              className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700"
              onClick={(event) => {
                event.stopPropagation();
                statusChange.mutate({ id: item.id, next: 'ACTIVE' });
              }}
            >
              <UserPlus className="h-3.5 w-3.5" /> Activate
            </button>
          )}
        </div>
      ),
      mobileLabel: false,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Sales team"
        title="Sales representatives"
        description="The service issues the sign-in credential once, at creation. This screen never sets a password."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setCreateForm(emptyCreate);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New representative
          </Button>
        }
      />

      <Card className="mb-5 p-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-muted" />
            <TextInput
              aria-label="Search sales representatives"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Employee code, territory or phone"
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
            {SALESMAN_STATUSES.map((value) => (
              <option key={value} value={value}>
                {humanize(value)}
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
          emptyTitle="No sales representatives"
          emptyDescription="Create the first account to assign customers to."
          footer={<Pagination page={page} limit={20} total={total} onPageChange={setPage} />}
        />
      </Card>

      {/* -------------------------------------------------------- create */}
      <Modal
        open={open && !editing}
        onClose={() => setOpen(false)}
        title="Create a sales representative"
        description="No password is sent from the browser. The service returns a one-time temporary password."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={create.isPending} onClick={() => create.mutate()}>
              Create representative
            </Button>
          </>
        }
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="rep-name" label="Full name" required>
              <TextInput
                id="rep-name"
                value={createForm.name}
                onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
              />
            </Field>
            <Field id="rep-email" label="Work email" required>
              <TextInput
                id="rep-email"
                type="email"
                value={createForm.email}
                onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
              />
            </Field>
            <Field id="rep-phone" label="Phone" required>
              <TextInput
                id="rep-phone"
                type="tel"
                value={createForm.phone}
                onChange={(event) => setCreateForm({ ...createForm, phone: event.target.value })}
              />
            </Field>
            <Field id="rep-code" label="Employee code" hint="Generated by the service when blank">
              <TextInput
                id="rep-code"
                value={createForm.employeeCode}
                onChange={(event) => setCreateForm({ ...createForm, employeeCode: event.target.value })}
              />
            </Field>
            <Field id="rep-territory" label="Territory" hint="Optional">
              <TextInput
                id="rep-territory"
                value={createForm.territory}
                onChange={(event) => setCreateForm({ ...createForm, territory: event.target.value })}
              />
            </Field>
            <Field id="rep-target" label="Monthly target" hint="Optional">
              <TextInput
                id="rep-target"
                type="number"
                min="0"
                step="0.01"
                value={createForm.monthlyTarget}
                onChange={(event) => setCreateForm({ ...createForm, monthlyTarget: event.target.value })}
              />
            </Field>
          </div>
          <Field id="rep-notes" label="Notes" hint="Optional">
            <Textarea
              id="rep-notes"
              rows={3}
              value={createForm.notes}
              onChange={(event) => setCreateForm({ ...createForm, notes: event.target.value })}
            />
          </Field>
        </form>
      </Modal>

      {/* ----------------------------------------------------------- edit */}
      <Modal
        open={Boolean(editing) && !open}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.employeeCode}` : 'Edit representative'}
        description="Email and name are owned by the account record and cannot be changed here."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button loading={update.isPending} onClick={() => update.mutate()}>
              Save changes
            </Button>
          </>
        }
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate();
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="edit-rep-code" label="Employee code">
              <TextInput
                id="edit-rep-code"
                value={updateForm.employeeCode}
                onChange={(event) => setUpdateForm({ ...updateForm, employeeCode: event.target.value })}
              />
            </Field>
            <Field id="edit-rep-territory" label="Territory">
              <TextInput
                id="edit-rep-territory"
                value={updateForm.territory}
                onChange={(event) => setUpdateForm({ ...updateForm, territory: event.target.value })}
              />
            </Field>
            <Field id="edit-rep-phone" label="Phone">
              <TextInput
                id="edit-rep-phone"
                type="tel"
                value={updateForm.phone}
                onChange={(event) => setUpdateForm({ ...updateForm, phone: event.target.value })}
              />
            </Field>
            <Field id="edit-rep-target" label="Monthly target">
              <TextInput
                id="edit-rep-target"
                type="number"
                min="0"
                step="0.01"
                value={updateForm.monthlyTarget}
                onChange={(event) => setUpdateForm({ ...updateForm, monthlyTarget: event.target.value })}
              />
            </Field>
          </div>
          <Field id="edit-rep-notes" label="Notes">
            <Textarea
              id="edit-rep-notes"
              rows={3}
              value={updateForm.notes}
              onChange={(event) => setUpdateForm({ ...updateForm, notes: event.target.value })}
            />
          </Field>
        </form>
      </Modal>

      {/* ------------------------------------------------------- assignment */}
      <Modal
        open={Boolean(assigning)}
        onClose={() => setAssigning(null)}
        size="md"
        title={assigning ? `Assigned customers - ${assigning.employeeCode}` : 'Assigned customers'}
        description="This replaces the whole assignment set on the service."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssigning(null)}>
              Cancel
            </Button>
            <Button loading={assign.isPending} onClick={() => assign.mutate()}>
              Save assignment
            </Button>
          </>
        }
      >
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {(assignableCustomers.data ?? []).map((customer: Customer) => {
            const checked = assignIds.includes(customer.id);
            return (
              <li key={customer.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line p-3 transition-colors hover:bg-ivory">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-line text-brand-600"
                    checked={checked}
                    onChange={(event) =>
                      setAssignIds((current) =>
                        event.target.checked
                          ? [...current, customer.id]
                          : current.filter((value) => value !== customer.id),
                      )
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-charcoal">{customer.businessName}</span>
                    <span className="block truncate text-xs text-muted">
                      {customer.ownerName} - {customer.address?.city || '—'}
                    </span>
                  </span>
                  <Badge value={customer.status} />
                </label>
              </li>
            );
          })}
          {!assignableCustomers.isLoading && !(assignableCustomers.data ?? []).length && (
            <li className="rounded-lg bg-ivory p-4 text-[13px] text-muted">No customer accounts are available.</li>
          )}
        </ul>
      </Modal>

      <ConfirmDialog
        open={Boolean(suspending)}
        onClose={() => setSuspending(null)}
        onConfirm={() => {
          if (!suspending) return;
          statusChange.mutate({ id: suspending.salesman.id, next: suspending.next, note });
        }}
        loading={statusChange.isPending}
        title="Deactivate this representative?"
        description="They can no longer sign in. Existing orders and messages are preserved."
        confirmLabel="Deactivate"
        danger
      />

      {/* ------------------------------------------- one-time credential */}
      <Modal
        open={Boolean(credential)}
        onClose={() => setCredential(null)}
        title="Temporary password issued"
        description="This is shown exactly once. Copy it now; it cannot be retrieved again."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                if (!credential?.temporaryPassword) return;
                void navigator.clipboard?.writeText(credential.temporaryPassword);
                showToast('success', 'Copied to clipboard');
              }}
            >
              <Copy className="h-4 w-4" /> Copy
            </Button>
            <Button
              onClick={() => {
                // Cleared from state as soon as the administrator dismisses it.
                setCredential(null);
              }}
            >
              I have saved it
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-[13px] leading-6 text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              <strong>Password change required.</strong> {employeeNameOf(credential)} must replace this password at first
              sign-in. It is never displayed again, and the service will not email it.
            </p>
          </div>
          <Field id="temporary-password" label="Temporary password">
            <TextInput id="temporary-password" readOnly value={credential?.temporaryPassword ?? ''} className="font-mono" />
          </Field>
          {credential?.employeeCode && (
            <p className="text-[13px] text-muted">
              Employee code: <strong>{credential.employeeCode}</strong>
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}

/** `userId` is populated by the service, so the name and email live in `user`. */
function employeeName(salesman: Salesman): string {
  return salesman.user?.name || employeeEmail(salesman) || 'Sales representative';
}

function employeeEmail(salesman: Salesman): string {
  return salesman.user?.email ?? '';
}

function employeeNameOf(credential: SalesmanProvisioned | null): string {
  if (!credential) return 'The new representative';
  return credential.employeeCode ? `The representative (${credential.employeeCode})` : 'The new representative';
}
