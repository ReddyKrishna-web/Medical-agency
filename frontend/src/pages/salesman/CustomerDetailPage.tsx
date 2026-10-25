import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, CalendarClock, MessageSquare, NotebookPen, PackagePlus, Phone, Send, UserRound } from 'lucide-react';
import { api, apiMeta, apiSend } from '@/lib/api';
import { mapCustomer, mapFollowUps, mapOrders } from '@/lib/adapters';
import { buildCustomerNotePayload, buildFollowUpCreatePayload, buildSendMessagePayload, type FollowUpFormValues } from '@/lib/payloads';
import { useToast } from '@/contexts/ToastContext';
import { errorMessage, formatDate } from '@/lib/utils';
import { humanize } from '@/lib/status';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, SelectInput, TextInput, Textarea } from '@/components/ui/Form';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import type { FollowUpType } from '@/types/api';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FollowUpFormValues>({ customerId: id ?? '', title: '', notes: '', type: 'CALL', dueAt: '' });
  const [message, setMessage] = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState<'NOTE' | 'CALL'>('NOTE');

  const customer = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => mapCustomer(await api<unknown>(`/customers/${id}`)),
    enabled: Boolean(id),
  });

  const orders = useQuery({
    queryKey: ['orders', 'customer', id],
    queryFn: async () => {
      const { data } = await apiMeta<unknown>('/orders', { params: { customerId: id, limit: 10 } });
      return mapOrders(data);
    },
    enabled: Boolean(id),
  });

  const followUps = useQuery({
    queryKey: ['follow-ups', { customerId: id }],
    queryFn: async () => {
      const { data } = await apiMeta<unknown>('/follow-ups', { params: { customerId: id, limit: 20, sort: 'dueAt' } });
      return mapFollowUps(data);
    },
    enabled: Boolean(id),
  });

  // `receiverId` is the customer *user* id, not the customer document id.
  const receiverId = customer.data?.userId || undefined;

  const saveFollowUp = useMutation({
    mutationFn: () => apiSend<unknown>('post', '/follow-ups', buildFollowUpCreatePayload({ ...form, customerId: id ?? '' })),
    onSuccess: () => {
      setForm({ customerId: id ?? '', title: '', notes: '', type: 'CALL', dueAt: '' });
      void queryClient.invalidateQueries({ queryKey: ['follow-ups'] });
      showToast('success', 'Follow-up created');
    },
    onError: (error) => showToast('error', 'Follow-up not created', errorMessage(error)),
  });

  const addNote = useMutation({
    mutationFn: () => {
      if (!id) throw new Error('Customer id is missing.');
      return apiSend<unknown>('post', `/customers/${id}/notes`, buildCustomerNotePayload(noteText, noteType));
    },
    onSuccess: () => {
      setNoteText('');
      setNoteType('NOTE');
      void queryClient.invalidateQueries({ queryKey: ['customer', id] });
      showToast('success', 'Customer note saved');
    },
    onError: (error) => showToast('error', 'Note not saved', errorMessage(error)),
  });

  const sendMessage = useMutation({
    mutationFn: () => {
      if (!receiverId) throw new Error('This customer has no messaging account.');
      return apiSend<unknown>('post', '/messages', buildSendMessagePayload({ receiverId, body: message }));
    },
    onSuccess: () => {
      setMessage('');
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      showToast('success', 'Message sent');
    },
    onError: (error) => showToast('error', 'Message not sent', errorMessage(error)),
  });

  if (customer.isLoading) return <LoadingState rows={6} />;
  if (customer.error) return <ErrorState error={customer.error} onRetry={() => void customer.refetch()} />;
  const record = customer.data;
  if (!record) return <EmptyState title="Customer not found" />;

  const orderRows = orders.data ?? [];
  const followRows = followUps.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Assigned account"
        title={record.businessName}
        description={`${record.ownerName}${record.phone ? ` - ${record.phone}` : ''}`}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(`/salesman/create-order?customer=${record.id}`)}>
              <PackagePlus className="h-4 w-4" /> Create order
            </Button>
            {record.phone && (
              <a href={`tel:${record.phone}`}>
                <Button variant="secondary">
                  <Phone className="h-4 w-4" /> Call customer
                </Button>
              </a>
            )}
          </>
        }
      />

      <div className="mb-5">
        <Link to="/salesman/customers" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-navy-700 hover:text-brand-700">
          <ArrowLeft className="h-4 w-4" /> My customers
        </Link>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Account details" action={<Badge value={record.status} />} />
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <div className="flex gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-sage text-brand-700">
                  <Building2 className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[11px] uppercase tracking-[.1em] text-muted">Organisation</p>
                  <p className="mt-1 text-[13.5px] font-medium text-charcoal">{record.businessName}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-sage text-brand-700">
                  <UserRound className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[11px] uppercase tracking-[.1em] text-muted">Primary contact</p>
                  <p className="mt-1 text-[13.5px] font-medium text-charcoal">{record.ownerName || '—'}</p>
                </div>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[.1em] text-muted">Phone</p>
                <p className="mt-1 text-[13.5px] font-medium text-charcoal">{record.phone || 'Not recorded'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[.1em] text-muted">Alternate phone</p>
                <p className="mt-1 text-[13.5px] font-medium text-charcoal">{record.alternatePhone || '—'}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-[11px] uppercase tracking-[.1em] text-muted">Registered address</p>
                <p className="mt-1 whitespace-pre-line text-[13px] leading-6 text-navy-700">
                  {[
                    record.address.line1,
                    record.address.line2,
                    [record.address.city, record.address.state, record.address.postalCode].filter(Boolean).join(', '),
                    record.address.country,
                  ]
                    .filter(Boolean)
                    .join('\n')}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[.1em] text-muted">GST number</p>
                <p className="mt-1 text-[13.5px] font-medium text-charcoal">{record.gstNumber || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[.1em] text-muted">Drug licence</p>
                <p className="mt-1 text-[13.5px] font-medium text-charcoal">{record.drugLicenseNumber || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[.1em] text-muted">Credit limit</p>
                <p className="mt-1 text-[13.5px] font-medium text-charcoal">{record.creditLimit}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[.1em] text-muted">Approved</p>
                <p className="mt-1 text-[13.5px] font-medium text-charcoal">{formatDate(record.approvedAt)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[.1em] text-muted">Last contact</p>
                <p className="mt-1 text-[13.5px] font-medium text-charcoal">
                  {record.lastContactAt ? `${humanize(record.lastContactType)} · ${formatDate(record.lastContactAt, 'dd MMM yyyy, HH:mm')}` : 'No contact recorded'}
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Recent orders"
              action={
                <Link to={`/salesman/orders?customer=${record.id}`} className="text-[13px] font-medium text-brand-700">
                  View all
                </Link>
              }
            />
            <CardBody className="p-0">
              {orderRows.length ? (
                <ul className="divide-y divide-line/70">
                  {orderRows.map((order) => (
                    <li key={order.id}>
                      <Link
                        to={`/salesman/orders/${order.id}`}
                        className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-ivory"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-brand-700">{order.orderNumber}</p>
                          <p className="mt-0.5 text-[11px] text-muted">{formatDate(order.createdAt)}</p>
                        </div>
                        <Badge value={order.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="No orders yet"
                  description="Create an order for this assigned customer when they are ready."
                  className="py-8"
                  action={
                    <Button size="sm" onClick={() => navigate(`/salesman/create-order?customer=${record.id}`)}>
                      Create order
                    </Button>
                  }
                />
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Customer notes" description="Attributable CRM history; not visible as a customer message." />
            <CardBody>
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  addNote.mutate();
                }}
              >
                <Field id="customer-note" label="Add a note" required>
                  <Textarea id="customer-note" rows={3} maxLength={1000} value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Record a call outcome, visit detail or account change." />
                </Field>
                <div className="flex gap-2">
                  <SelectInput aria-label="Note type" value={noteType} onChange={(event) => setNoteType(event.target.value as 'NOTE' | 'CALL')} className="w-32">
                    <option value="NOTE">Note</option>
                    <option value="CALL">Call</option>
                  </SelectInput>
                  <Button type="submit" loading={addNote.isPending} disabled={noteText.trim().length < 2} className="flex-1"><NotebookPen className="h-4 w-4" /> Save note</Button>
                </div>
              </form>
              {record.accountNotes.length > 0 && (
                <ul className="mt-4 max-h-64 space-y-3 overflow-y-auto border-t border-line pt-4">
                  {[...record.accountNotes].reverse().map((note, index) => (
                    <li key={note.id || `${note.at}-${index}`} className="rounded-md bg-ivory p-3">
                      <p className="text-[13px] leading-6 text-navy-700">{note.text}</p>
                      <p className="mt-1 text-[10px] font-medium text-muted">{humanize(note.byRole)} · {formatDate(note.at, 'dd MMM yyyy, HH:mm')}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Add a follow-up" description="A dated task for your account workflow." />
            <CardBody>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveFollowUp.mutate();
                }}
              >
                <Field id="follow-title" label="Title" required>
                  <TextInput
                    id="follow-title"
                    value={form.title}
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                    placeholder="Confirm the next order"
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="follow-date" label="Due" required>
                    <TextInput
                      id="follow-date"
                      type="datetime-local"
                      value={form.dueAt}
                      onChange={(event) => setForm({ ...form, dueAt: event.target.value })}
                    />
                  </Field>
                  <Field id="follow-type" label="Type">
                    <SelectInput
                      id="follow-type"
                      value={form.type}
                      onChange={(event) => setForm({ ...form, type: event.target.value as FollowUpType })}
                    >
                      {(['CALL', 'VISIT', 'WHATSAPP', 'EMAIL', 'OTHER'] as FollowUpType[]).map((value) => (
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
                    rows={3}
                    value={form.notes}
                    onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  />
                </Field>
                <Button type="submit" className="w-full" disabled={!form.title.trim() || !form.dueAt} loading={saveFollowUp.isPending}>
                  <CalendarClock className="h-4 w-4" /> Save follow-up
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Message customer" description="Sends through the real messaging API." />
            <CardBody>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  sendMessage.mutate();
                }}
              >
                <Field id="customer-message" label="Message" required>
                  <Textarea
                    id="customer-message"
                    rows={4}
                    maxLength={4000}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                </Field>
                <Button type="submit" className="w-full" disabled={!message.trim() || !receiverId} loading={sendMessage.isPending}>
                  <Send className="h-4 w-4" /> Send message
                </Button>
              </form>
              {receiverId && (
                <Link to={`/salesman/messages?with=${receiverId}`} className="mt-4 flex items-center justify-center gap-2 text-[13px] font-medium text-brand-700">
                  <MessageSquare className="h-4 w-4" /> Open conversation
                </Link>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Follow-up history" />
            <CardBody className="p-0">
              {followRows.length ? (
                <ul className="divide-y divide-line/70">
                  {followRows.map((item) => (
                    <li key={item.id} className="px-5 py-3">
                      <div className="flex justify-between gap-2">
                        <p className="text-[13.5px] font-medium text-charcoal">{item.title}</p>
                        <Badge value={item.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {humanize(item.type)} - due {formatDate(item.dueAt)}
                      </p>
                      {item.notes && <p className="mt-2 line-clamp-2 text-xs leading-5 text-navy-700">{item.notes}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No follow-ups" className="py-8" />
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
