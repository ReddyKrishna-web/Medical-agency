import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Edit3, Plus, Search, UserCheck, X } from 'lucide-react';
import { apiMeta, apiSend } from '@/lib/api';
import { mapCustomers, mapSalesmen } from '@/lib/adapters';
import {
  buildCustomerCreatePayload,
  buildCustomerStatusPayload,
  buildCustomerUpdatePayload,
  type CustomerCreateFormValues,
  type CustomerUpdateFormValues,
} from '@/lib/payloads';
import { useToast } from '@/contexts/ToastContext';
import { useDebounce } from '@/hooks/useDebounce';
import { errorMessage, formatCurrency, formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, SelectInput, TextInput, Textarea } from '@/components/ui/Form';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { CUSTOMER_STATUSES, humanize } from '@/lib/status';
import type { Customer, CustomerStatus } from '@/types/api';

const emptyAddress = { line1: '', line2: '', city: '', state: '', country: '', postalCode: '' };

const emptyCreate: CustomerCreateFormValues = {
  name: '',
  email: '',
  phone: '',
  password: '',
  businessName: '',
  ownerName: '',
  alternatePhone: '',
  address: emptyAddress,
  gstNumber: '',
  drugLicenseNumber: '',
  shopType: '',
  creditLimit: '',
  assignedSalesmanId: '',
  status: 'APPROVED',
  notes: '',
};

const emptyUpdate: CustomerUpdateFormValues = {
  businessName: '',
  ownerName: '',
  phone: '',
  alternatePhone: '',
  gstNumber: '',
  drugLicenseNumber: '',
  shopType: '',
  address: emptyAddress,
  creditLimit: '',
  assignedSalesmanId: '',
  notes: '',
};

export default function CustomersPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [salesman, setSalesman] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [rejecting, setRejecting] = useState<Customer | null>(null);
  const [note, setNote] = useState('');
  const [createForm, setCreateForm] = useState<CustomerCreateFormValues>(emptyCreate);
  const [updateForm, setUpdateForm] = useState<CustomerUpdateFormValues>(emptyUpdate);

  const debounced = useDebounce(search);

  const query = useQuery({
    queryKey: ['customers', { page, search: debounced, status, assignedSalesmanId: salesman }],
    queryFn: async () => {
      const { data, meta } = await apiMeta<unknown>('/customers', {
        params: {
          page,
          limit: 20,
          search: debounced || undefined,
          status: status || undefined,
          assignedSalesmanId: salesman || undefined,
        },
      });
      return { rows: mapCustomers(data), total: Number(meta.total ?? 0) };
    },
    placeholderData: (previous) => previous,
  });

  const salesmen = useQuery({
    queryKey: ['salesmen', { limit: 200 }],
    queryFn: async () => mapSalesmen((await apiMeta<unknown>('/salesmen', { params: { limit: 200 } })).data),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!editing) return;
    setUpdateForm({
      businessName: editing.businessName,
      ownerName: editing.ownerName,
      phone: editing.phone,
      alternatePhone: editing.alternatePhone ?? '',
      gstNumber: editing.gstNumber ?? '',
      drugLicenseNumber: editing.drugLicenseNumber ?? '',
      shopType: editing.shopType ?? '',
      address: { ...emptyAddress, ...editing.address },
      creditLimit: String(editing.creditLimit ?? 0),
      assignedSalesmanId: editing.assignedSalesmanId ?? '',
      notes: editing.notes ?? '',
    });
  }, [editing]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['customers'] });
  };

  const create = useMutation({
    mutationFn: () => apiSend<unknown>('post', '/customers', buildCustomerCreatePayload(createForm)),
    onSuccess: () => {
      invalidate();
      setCreating(false);
      setCreateForm(emptyCreate);
      showToast('success', 'Customer created', 'They can sign in immediately with the password you set.');
    },
    onError: (error) => showToast('error', 'Customer not created', errorMessage(error)),
  });

  const update = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error('No customer selected.');
      // `updateCustomerSchema` requires at least one field and rejects `''`.
        const payload = buildCustomerUpdatePayload(updateForm, {
        businessName: editing.businessName,
        ownerName: editing.ownerName,
        phone: editing.phone,
        alternatePhone: editing.alternatePhone ?? '',
        gstNumber: editing.gstNumber ?? '',
        drugLicenseNumber: editing.drugLicenseNumber ?? '',
        shopType: editing.shopType ?? '',
        creditLimit: String(editing.creditLimit ?? 0),
        assignedSalesmanId: editing.assignedSalesmanId ?? '',
        notes: editing.notes ?? '',
      });
      if (!Object.keys(payload).length) throw new Error('No changes to save.');
      return apiSend<unknown>('patch', `/customers/${editing.id}`, payload);
    },
    onSuccess: () => {
      invalidate();
      setEditing(null);
      showToast('success', 'Customer updated');
    },
    onError: (error) => showToast('error', 'Customer not updated', errorMessage(error)),
  });

  // `customerStatusSchema` takes `{ status, note }`.
  const statusChange = useMutation({
    mutationFn: ({ id, value, note: reason }: { id: string; value: CustomerStatus; note?: string }) =>
      apiSend('post', `/customers/${id}/status`, buildCustomerStatusPayload(value, reason)),
    onSuccess: (raw) => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      const result = raw as { status?: string } | undefined;
      showToast('success', 'Customer status updated', result?.status ? humanize(result.status) : undefined);
    },
    onError: (error) => showToast('error', 'Status not updated', errorMessage(error)),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? rows.length;

  const columns: Column<Customer>[] = [
    {
      key: 'business',
      header: 'Business',
      render: (item) => (
        <div>
          <p className="font-bold text-slate-800">{item.businessName}</p>
          <p className="text-xs text-slate-400">{item.ownerName}</p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Phone',
      render: (item) => (
        <div>
          <p>{item.phone || '—'}</p>
          {item.alternatePhone && <p className="text-xs text-slate-400">{item.alternatePhone}</p>}
        </div>
      ),
    },
    { key: 'city', header: 'City', render: (item) => item.address?.city || '—', mobileLabel: false },
    { key: 'status', header: 'Status', render: (item) => <Badge value={item.status} /> },
    {
      key: 'salesman',
      header: 'Assigned salesman',
      render: (item) =>
        item.assignedSalesman?.employeeCode ? (
          <span className="font-semibold text-slate-700">{item.assignedSalesman.employeeCode}</span>
        ) : (
          <span className="text-slate-400">Unassigned</span>
        ),
      mobileLabel: false,
    },
    {
      key: 'lastOrder',
      header: 'Last order',
      // Only rendered when the endpoint supplies it; never derived client-side.
      render: (item) =>
        item.lastOrderAt ? (
          <div>
            <p className="font-semibold">{formatDate(item.lastOrderAt)}</p>
            {item.lastOrderNumber && <p className="text-xs text-slate-400">{item.lastOrderNumber}</p>}
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        ),
      mobileLabel: false,
    },
    {
      key: 'credit',
      header: 'Credit',
      render: (item) => (
        <span className="text-xs">
          {formatCurrency(item.creditUsed)} / {formatCurrency(item.creditLimit)}
        </span>
      ),
      mobileLabel: false,
    },
    {
      key: 'actions',
      header: '',
      render: (item) => (
        <div className="flex flex-wrap items-center gap-3">
          {item.status === 'PENDING' && (
            <>
              <button
                className="inline-flex items-center gap-1 font-semibold text-medical-700"
                onClick={(event) => {
                  event.stopPropagation();
                  statusChange.mutate({ id: item.id, value: 'APPROVED' });
                }}
              >
                <Check className="h-3.5 w-3.5" /> Approve
              </button>
              <button
                className="inline-flex items-center gap-1 font-semibold text-red-600"
                onClick={(event) => {
                  event.stopPropagation();
                  setNote('');
                  setRejecting(item);
                }}
              >
                <X className="h-3.5 w-3.5" /> Reject
              </button>
            </>
          )}
          {item.status === 'ACTIVE' && (
            <button
              className="font-semibold text-slate-500"
              onClick={(event) => {
                event.stopPropagation();
                statusChange.mutate({ id: item.id, value: 'DISABLED' });
              }}
            >
              Disable
            </button>
          )}
          {item.status === 'DISABLED' && (
            <button
              className="inline-flex items-center gap-1 font-semibold text-medical-700"
              onClick={(event) => {
                event.stopPropagation();
                statusChange.mutate({ id: item.id, value: 'ACTIVE' });
              }}
            >
              <UserCheck className="h-3.5 w-3.5" /> Activate
            </button>
          )}
          <button
            className="inline-flex items-center gap-1 font-semibold text-brand-700"
            onClick={(event) => {
              event.stopPropagation();
              setEditing(item);
            }}
          >
            <Edit3 className="h-3.5 w-3.5" /> Edit
          </button>
        </div>
      ),
      mobileLabel: false,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Account management"
        title="Customers"
        description="Approve registrations, keep business details current and assign an account team."
        actions={
          <Button
            onClick={() => {
              setCreateForm(emptyCreate);
              setCreating(true);
            }}
          >
            <Plus className="h-4 w-4" /> New customer
          </Button>
        }
      />

      <Card className="mb-5 p-4">
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
            <TextInput
              aria-label="Search customers"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Business, owner, phone, GST"
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
            {CUSTOMER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {humanize(value)}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            aria-label="Filter by assigned salesman"
            value={salesman}
            onChange={(event) => {
              setSalesman(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All salesmen</option>
            {(salesmen.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.employeeCode}
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
          emptyTitle="No customers match these filters"
          emptyDescription="Pending registrations appear here for approval."
          footer={<Pagination page={page} limit={20} total={total} onPageChange={setPage} />}
        />
      </Card>

      {/* ------------------------------------------------------ create modal */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        size="lg"
        title="Create a customer account"
        description="The role is always CUSTOMER; admins cannot mint staff from this screen."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button loading={create.isPending} onClick={() => create.mutate()}>
              Create customer
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
            <Field id="create-name" label="Contact name" required>
              <TextInput
                id="create-name"
                value={createForm.name}
                onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
              />
            </Field>
            <Field id="create-business" label="Business name" required>
              <TextInput
                id="create-business"
                value={createForm.businessName}
                onChange={(event) => setCreateForm({ ...createForm, businessName: event.target.value })}
              />
            </Field>
            <Field id="create-email" label="Login email" required>
              <TextInput
                id="create-email"
                type="email"
                value={createForm.email}
                onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
              />
            </Field>
            <Field id="create-phone" label="Phone" required>
              <TextInput
                id="create-phone"
                type="tel"
                value={createForm.phone}
                onChange={(event) => setCreateForm({ ...createForm, phone: event.target.value })}
              />
            </Field>
            <Field id="create-owner" label="Owner name" hint="Defaults to the contact name">
              <TextInput
                id="create-owner"
                value={createForm.ownerName}
                onChange={(event) => setCreateForm({ ...createForm, ownerName: event.target.value })}
              />
            </Field>
            <Field id="create-alt-phone" label="Alternate phone" hint="Optional">
              <TextInput
                id="create-alt-phone"
                type="tel"
                value={createForm.alternatePhone}
                onChange={(event) => setCreateForm({ ...createForm, alternatePhone: event.target.value })}
              />
            </Field>
            <Field id="create-password" label="Initial password" required hint="The user is flagged to change it.">
              <TextInput
                id="create-password"
                type="text"
                value={createForm.password}
                onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })}
              />
            </Field>
            <Field id="create-status" label="Initial status" hint="PENDING keeps the account inactive until approval.">
              <SelectInput
                id="create-status"
                value={createForm.status}
                onChange={(event) =>
                  setCreateForm({ ...createForm, status: event.target.value as CustomerCreateFormValues['status'] })
                }
              >
                <option value="APPROVED">Approved</option>
                <option value="ACTIVE">Active</option>
                <option value="PENDING">Pending</option>
              </SelectInput>
            </Field>
            <Field id="create-gst" label="GST number" hint="Optional">
              <TextInput
                id="create-gst"
                value={createForm.gstNumber}
                onChange={(event) => setCreateForm({ ...createForm, gstNumber: event.target.value })}
              />
            </Field>
            <Field id="create-license" label="Drug licence number" hint="Optional">
              <TextInput
                id="create-license"
                value={createForm.drugLicenseNumber}
                onChange={(event) => setCreateForm({ ...createForm, drugLicenseNumber: event.target.value })}
              />
            </Field>
            <Field id="create-shop" label="Shop type" hint="Optional">
              <TextInput
                id="create-shop"
                value={createForm.shopType}
                onChange={(event) => setCreateForm({ ...createForm, shopType: event.target.value })}
              />
            </Field>
            <Field id="create-credit" label="Credit limit" hint="Optional">
              <TextInput
                id="create-credit"
                type="number"
                min="0"
                step="0.01"
                value={createForm.creditLimit}
                onChange={(event) => setCreateForm({ ...createForm, creditLimit: event.target.value })}
              />
            </Field>
            <Field id="create-salesman" label="Assigned salesman" hint="Optional">
              <SelectInput
                id="create-salesman"
                value={createForm.assignedSalesmanId}
                onChange={(event) => setCreateForm({ ...createForm, assignedSalesmanId: event.target.value })}
              >
                <option value="">Unassigned</option>
                {(salesmen.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.employeeCode}
                    {item.territory ? ` - ${item.territory}` : ''}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>

          <fieldset className="space-y-4 border-t border-slate-200 pt-5">
            <legend className="text-xs font-bold uppercase tracking-[.16em] text-medical-700">Registered address</legend>
            <Field id="create-line1" label="Address line 1" required>
              <TextInput
                id="create-line1"
                value={createForm.address.line1}
                onChange={(event) => setCreateForm({ ...createForm, address: { ...createForm.address, line1: event.target.value } })}
              />
            </Field>
            <Field id="create-line2" label="Address line 2" hint="Optional">
              <TextInput
                id="create-line2"
                value={createForm.address.line2}
                onChange={(event) => setCreateForm({ ...createForm, address: { ...createForm.address, line2: event.target.value } })}
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="create-city" label="City" required>
                <TextInput
                  id="create-city"
                  value={createForm.address.city}
                  onChange={(event) => setCreateForm({ ...createForm, address: { ...createForm.address, city: event.target.value } })}
                />
              </Field>
              <Field id="create-state" label="State" required>
                <TextInput
                  id="create-state"
                  value={createForm.address.state}
                  onChange={(event) => setCreateForm({ ...createForm, address: { ...createForm.address, state: event.target.value } })}
                />
              </Field>
              <Field id="create-country" label="Country" required>
                <TextInput
                  id="create-country"
                  value={createForm.address.country}
                  onChange={(event) => setCreateForm({ ...createForm, address: { ...createForm.address, country: event.target.value } })}
                />
              </Field>
              <Field id="create-postal" label="Postal code" required>
                <TextInput
                  id="create-postal"
                  value={createForm.address.postalCode}
                  onChange={(event) => setCreateForm({ ...createForm, address: { ...createForm.address, postalCode: event.target.value } })}
                />
              </Field>
            </div>
          </fieldset>

          <Field id="create-notes" label="Internal notes" hint="Optional">
            <Textarea
              id="create-notes"
              rows={2}
              value={createForm.notes}
              onChange={(event) => setCreateForm({ ...createForm, notes: event.target.value })}
            />
          </Field>
        </form>
      </Modal>

      {/* ------------------------------------------------------- edit modal */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing ? `Edit ${editing.businessName}` : 'Edit customer'}
        description="Only changed fields are sent; the API rejects an empty update body."
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
            <Field id="edit-business" label="Business name" required>
              <TextInput
                id="edit-business"
                value={updateForm.businessName}
                onChange={(event) => setUpdateForm({ ...updateForm, businessName: event.target.value })}
              />
            </Field>
            <Field id="edit-owner" label="Owner name">
              <TextInput
                id="edit-owner"
                value={updateForm.ownerName}
                onChange={(event) => setUpdateForm({ ...updateForm, ownerName: event.target.value })}
              />
            </Field>
            <Field id="edit-phone" label="Phone">
              <TextInput
                id="edit-phone"
                type="tel"
                value={updateForm.phone}
                onChange={(event) => setUpdateForm({ ...updateForm, phone: event.target.value })}
              />
            </Field>
            <Field id="edit-alt-phone" label="Alternate phone" hint="Optional">
              <TextInput
                id="edit-alt-phone"
                type="tel"
                value={updateForm.alternatePhone}
                onChange={(event) => setUpdateForm({ ...updateForm, alternatePhone: event.target.value })}
              />
            </Field>
            <Field id="edit-gst" label="GST number" hint="Optional">
              <TextInput
                id="edit-gst"
                value={updateForm.gstNumber}
                onChange={(event) => setUpdateForm({ ...updateForm, gstNumber: event.target.value })}
              />
            </Field>
            <Field id="edit-license" label="Drug licence number" hint="Optional">
              <TextInput
                id="edit-license"
                value={updateForm.drugLicenseNumber}
                onChange={(event) => setUpdateForm({ ...updateForm, drugLicenseNumber: event.target.value })}
              />
            </Field>
            <Field id="edit-shop" label="Shop type" hint="Optional">
              <TextInput
                id="edit-shop"
                value={updateForm.shopType}
                onChange={(event) => setUpdateForm({ ...updateForm, shopType: event.target.value })}
              />
            </Field>
            <Field id="edit-credit" label="Credit limit">
              <TextInput
                id="edit-credit"
                type="number"
                min="0"
                step="0.01"
                value={updateForm.creditLimit}
                onChange={(event) => setUpdateForm({ ...updateForm, creditLimit: event.target.value })}
              />
            </Field>
          </div>

          <Field
            id="edit-salesman"
            label="Assigned salesman"
            hint="Changing this reassigns the account on the service and moves it in the follow-up queue."
          >
            <SelectInput
              id="edit-salesman"
              value={updateForm.assignedSalesmanId ?? ''}
              onChange={(event) => setUpdateForm({ ...updateForm, assignedSalesmanId: event.target.value || null })}
            >
              <option value="">Unassigned</option>
              {(salesmen.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.employeeCode}
                  {item.territory ? ` - ${item.territory}` : ''}
                </option>
              ))}
            </SelectInput>
          </Field>

          <fieldset className="space-y-4 border-t border-slate-200 pt-5">
            <legend className="text-xs font-bold uppercase tracking-[.16em] text-medical-700">Registered address</legend>
            <Field id="edit-line1" label="Address line 1" required>
              <TextInput
                id="edit-line1"
                value={updateForm.address?.line1}
                onChange={(event) => setUpdateForm({ ...updateForm, address: { ...updateForm.address, line1: event.target.value } })}
              />
            </Field>
            <Field id="edit-line2" label="Address line 2" hint="Optional">
              <TextInput
                id="edit-line2"
                value={updateForm.address?.line2}
                onChange={(event) => setUpdateForm({ ...updateForm, address: { ...updateForm.address, line2: event.target.value } })}
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="edit-city" label="City" required>
                <TextInput
                  id="edit-city"
                  value={updateForm.address?.city}
                  onChange={(event) => setUpdateForm({ ...updateForm, address: { ...updateForm.address, city: event.target.value } })}
                />
              </Field>
              <Field id="edit-state" label="State" required>
                <TextInput
                  id="edit-state"
                  value={updateForm.address?.state}
                  onChange={(event) => setUpdateForm({ ...updateForm, address: { ...updateForm.address, state: event.target.value } })}
                />
              </Field>
              <Field id="edit-country" label="Country" required>
                <TextInput
                  id="edit-country"
                  value={updateForm.address?.country}
                  onChange={(event) => setUpdateForm({ ...updateForm, address: { ...updateForm.address, country: event.target.value } })}
                />
              </Field>
              <Field id="edit-postal" label="Postal code" required>
                <TextInput
                  id="edit-postal"
                  value={updateForm.address?.postalCode}
                  onChange={(event) => setUpdateForm({ ...updateForm, address: { ...updateForm.address, postalCode: event.target.value } })}
                />
              </Field>
            </div>
          </fieldset>

          <Field id="edit-notes" label="Internal notes" hint="Optional">
            <Textarea
              id="edit-notes"
              rows={2}
              value={updateForm.notes}
              onChange={(event) => setUpdateForm({ ...updateForm, notes: event.target.value })}
            />
          </Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Reject this registration"
        description="The reason is stored as the account status note and emailed to the requester."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={statusChange.isPending}
              onClick={() => {
                if (!rejecting) return;
                statusChange.mutate({ id: rejecting.id, value: 'REJECTED', note }, { onSuccess: () => setRejecting(null) });
              }}
            >
              Reject registration
            </Button>
          </>
        }
      >
        <Field id="reject-note" label="Reason" hint="Sent to the applicant and stored on the record.">
          <Textarea
            id="reject-note"
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Drug licence number could not be verified"
          />
        </Field>
      </Modal>

    </>
  );
}
