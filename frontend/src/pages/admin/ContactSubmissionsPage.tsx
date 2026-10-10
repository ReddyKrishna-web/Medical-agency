import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Mail, Phone, RefreshCcw, Search, Trash2 } from 'lucide-react';
import { apiMeta, apiSend } from '@/lib/api';
import { mapContactSubmissions } from '@/lib/adapters';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useToast } from '@/contexts/ToastContext';
import { errorMessage, formatDate } from '@/lib/utils';
import { humanize } from '@/lib/status';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { SelectInput, TextInput, Textarea } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import type { ContactSubmission, ContactSubmissionStatus } from '@/types/api';

const STATUSES: ContactSubmissionStatus[] = ['NEW', 'IN_REVIEW', 'CONTACTED', 'CLOSED', 'SPAM'];

export default function ContactSubmissionsPage() {
  useDocumentTitle('Contact enquiries');
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [topic, setTopic] = useState('');
  const [selected, setSelected] = useState<ContactSubmission | null>(null);
  const [deleting, setDeleting] = useState<ContactSubmission | null>(null);
  const [notes, setNotes] = useState('');
  const [editingStatus, setEditingStatus] = useState<ContactSubmissionStatus>('NEW');
  const debounced = useDebounce(search);

  const query = useQuery({
    queryKey: ['contact-submissions', { page, search: debounced, status, topic }],
    queryFn: async () => {
      const { data, meta } = await apiMeta<unknown>('/contact-submissions', {
        params: { page, limit: 20, search: debounced || undefined, status: status || undefined, topic: topic || undefined },
      });
      return { rows: mapContactSubmissions(data), total: Number(meta.total ?? 0) };
    },
    placeholderData: (previous) => previous,
  });

  const update = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('No enquiry selected.');
      return apiSend('patch', `/contact-submissions/${selected.id}`, { status: editingStatus, notes: notes.trim() || undefined });
    },
    onSuccess: () => {
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: ['contact-submissions'] });
      showToast('success', 'Enquiry updated');
    },
    onError: (error) => showToast('error', 'Enquiry not updated', errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => {
      if (!deleting) throw new Error('No enquiry selected.');
      return apiSend('delete', `/contact-submissions/${deleting.id}`);
    },
    onSuccess: () => {
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ['contact-submissions'] });
      showToast('success', 'Enquiry deleted');
    },
    onError: (error) => showToast('error', 'Enquiry not deleted', errorMessage(error)),
  });

  const open = (row: ContactSubmission) => {
    setSelected(row);
    setEditingStatus(row.status);
    setNotes(row.notes ?? '');
  };

  const columns: Column<ContactSubmission>[] = [
    { key: 'contact', header: 'Contact', render: (row) => <div><p className="font-bold text-slate-800">{row.name}</p><p className="text-xs text-slate-400">{row.email}</p></div> },
    { key: 'organisation', header: 'Organisation', render: (row) => row.organisation || '—', mobileLabel: false },
    { key: 'topic', header: 'Topic', render: (row) => <Badge value={row.topic} /> },
    { key: 'received', header: 'Received', render: (row) => formatDate(row.createdAt, 'dd MMM yyyy, HH:mm'), mobileLabel: false },
    { key: 'status', header: 'Status', render: (row) => <Badge value={row.status} /> },
    { key: 'actions', header: '', render: (row) => <span className="flex gap-3"><button className="font-semibold text-brand-700" onClick={(event) => { event.stopPropagation(); open(row); }}>Open</button><button className="text-red-600" aria-label="Delete enquiry" onClick={(event) => { event.stopPropagation(); setDeleting(row); }}><Trash2 className="h-4 w-4" /></button></span>, mobileLabel: false },
  ];

  const rows = query.data?.rows ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Business enquiries"
        title="Contact inbox"
        description="Review website enquiries. Do not record patient, prescription or other sensitive medical information here."
        actions={<Button variant="outline" onClick={() => void query.refetch()} loading={query.isFetching}><RefreshCcw className="h-4 w-4" /> Refresh</Button>}
      />

      <Card className="mb-5 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_200px_220px]">
          <div className="relative"><Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" /><TextInput aria-label="Search contact enquiries" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Name, email, organisation or message" className="pl-10" /></div>
          <SelectInput aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{STATUSES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</SelectInput>
          <SelectInput aria-label="Filter by topic" value={topic} onChange={(event) => { setTopic(event.target.value); setPage(1); }}><option value="">All topics</option>{['NEW_ORDER_ENQUIRY', 'PRODUCT_ENQUIRY', 'PRICING_REQUEST', 'PARTNERSHIP', 'COMPLAINT', 'SUPPORT', 'OTHER'].map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</SelectInput>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={rows}
          getKey={(row) => row.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          onRowClick={open}
          emptyTitle="No enquiries found"
          emptyDescription="Website contact submissions will appear here for agency review."
          emptyAction={<Inbox className="h-5 w-5" />}
          footer={<Pagination page={page} limit={20} total={query.data?.total ?? 0} onPageChange={setPage} />}
        />
      </Card>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Business enquiry" description={selected ? `${selected.name} · ${selected.email}` : ''} size="lg">
        {selected && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <a href={`mailto:${selected.email}`} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-brand-700"><Mail className="h-4 w-4" /> {selected.email}</a>
              {selected.phone && <a href={`tel:${selected.phone}`} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-brand-700"><Phone className="h-4 w-4" /> {selected.phone}</a>}
            </div>
            <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Topic</p><p className="mt-1 text-sm font-semibold text-slate-800">{humanize(selected.topic)}</p></div>
            <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Message</p><p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">{selected.message}</p></div>
            <SelectInput aria-label="Enquiry status" value={editingStatus} onChange={(event) => setEditingStatus(event.target.value as ContactSubmissionStatus)}>{STATUSES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</SelectInput>
            <Textarea aria-label="Internal notes" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Internal follow-up notes" />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setSelected(null)}>Cancel</Button><Button onClick={() => update.mutate()} loading={update.isPending} disabled={editingStatus === selected.status && notes.trim() === (selected.notes ?? '')}>Save enquiry</Button></div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={() => remove.mutate()} loading={remove.isPending} title="Delete this enquiry?" description="This permanently removes the submitted business contact record from the agency inbox. This cannot be undone." confirmLabel="Delete enquiry" danger />
    </>
  );
}
