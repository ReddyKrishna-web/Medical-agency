import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Download, FileUp, Plus, UploadCloud } from 'lucide-react';
import { apiBlob, apiMeta, apiSend, saveBlob } from '@/lib/api';
import { mapRequirements } from '@/lib/adapters';
import { buildRequirementFormData } from '@/lib/payloads';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useDebounce } from '@/hooks/useDebounce';
import { errorMessage, fileSize, formatDate } from '@/lib/utils';
import { REQUIREMENT_STATUSES, humanize } from '@/lib/status';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, SelectInput, TextInput, Textarea } from '@/components/ui/Form';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { InlineError } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import type { Requirement } from '@/types/api';

export default function RequirementsListPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'customer';
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState('');
  const debounced = useDebounce(search);

  const query = useQuery({
    queryKey: ['requirements', { page, status, search: debounced }],
    queryFn: async () => {
      const { data, meta } = await apiMeta<unknown>('/requirements', {
        params: { page, limit: 20, status: status || undefined, search: debounced || undefined },
      });
      return { rows: mapRequirements(data), total: Number(meta.total ?? 0) };
    },
    placeholderData: (previous) => previous,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['requirements'] });

  // Multipart: the field name must be `file`, and `notes` is required by the schema.
  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Choose a file before uploading.');
      if (!title.trim()) throw new Error('A short title is required.');
      if (!notes.trim()) throw new Error('Notes are required so the agency can triage the document.');
      return apiSend<unknown>('post', '/requirements', buildRequirementFormData({ file, title, notes }));
    },
    onSuccess: () => {
      invalidate();
      setOpen(false);
      setFile(null);
      setTitle('');
      setNotes('');
      setSubmitError('');
      showToast('success', 'Requirement uploaded');
    },
    onError: (error) => {
      const message = errorMessage(error, 'Upload failed.');
      setSubmitError(message);
      showToast('error', 'Requirement not uploaded', message);
    },
  });

  const download = async (requirement: Requirement) => {
    try {
      // The download route is authenticated, so it must be fetched, not linked.
      const blob = await apiBlob(`/requirements/${requirement.id}/file`);
      saveBlob(blob, requirement.file.originalName || 'requirement-file');
    } catch (error) {
      showToast('error', 'File download failed', errorMessage(error));
    }
  };

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? rows.length;

  const columns: Column<Requirement>[] = [
    {
      key: 'title',
      header: 'Requirement',
      render: (item) => (
        <div>
          <p className="text-[13.5px] font-medium text-charcoal">{item.title}</p>
          <p className="mt-0.5 text-xs text-muted">{item.file.originalName}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (item) =>
        role === 'customer'
          ? 'Your organisation'
          : item.customerId && typeof item.customerId === 'object'
            ? item.customerId.businessName
            : '—',
    },
    { key: 'status', header: 'Status', render: (item) => <Badge value={item.status} /> },
    { key: 'uploaded', header: 'Uploaded', render: (item) => formatDate(item.createdAt) },
    {
      key: 'file',
      header: 'File',
      render: (item) => (
        <button
          className="inline-flex items-center gap-1.5 font-semibold text-brand-700"
          onClick={(event) => {
            event.stopPropagation();
            void download(item);
          }}
        >
          <Download className="h-4 w-4" /> {fileSize(item.file.sizeBytes)}
        </button>
      ),
      mobileLabel: false,
    },
    {
      key: 'action',
      header: '',
      render: (item) => (
        <Link
          to={`/${role}/requirements/${item.id}`}
          onClick={(event) => event.stopPropagation()}
          className="font-semibold text-brand-700"
        >
          Review
        </Link>
      ),
      mobileLabel: false,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Procurement intake"
        title="Requirements"
        description={
          role === 'customer'
            ? 'Upload a document when a catalogue order is not enough.'
            : 'Review uploaded requirements and convert accepted requests into orders.'
        }
        actions={
          <Button
            onClick={() => {
              setFile(null);
              setTitle('');
              setNotes('');
              setSubmitError('');
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Upload requirement
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 rounded-lg border border-line bg-white p-4 sm:grid-cols-[1fr_200px]">
        <TextInput
          aria-label="Search requirements"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search title or notes"
        />
        <SelectInput
          aria-label="Filter by status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {REQUIREMENT_STATUSES.map((value) => (
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
          onRowClick={(item) => navigate(`/${role}/requirements/${item.id}`)}
          emptyTitle="No requirements found"
          emptyDescription={
            role === 'customer' ? 'Upload a procurement document to start a review.' : 'Customer uploads will appear here.'
          }
          emptyAction={
            <Button
              size="sm"
              onClick={() => setOpen(true)}
            >
              <ClipboardCheck className="h-4 w-4" /> Upload requirement
            </Button>
          }
          footer={<Pagination page={page} limit={20} total={total} onPageChange={setPage} />}
        />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Upload a requirement"
        description="The service stores the file privately and creates a review record."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={upload.isPending} disabled={!file || !title.trim() || !notes.trim()} onClick={() => upload.mutate()}>
              <FileUp className="h-4 w-4" /> Upload requirement
            </Button>
          </>
        }
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            upload.mutate();
          }}
        >
          <Field id="requirement-file" label="Document" required hint="One file, validated by content before storage.">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-navy-300 bg-ivory px-5 py-8 text-center transition-colors hover:border-brand-400 hover:bg-sage/40">
              <UploadCloud className="h-8 w-8 text-brand-600" />
              <span className="mt-3 text-[13px] font-medium text-charcoal">{file ? file.name : 'Choose a file'}</span>
              {file && <span className="mt-1 text-xs text-muted">{fileSize(file.size)}</span>}
              <input
                type="file"
                className="sr-only"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setSubmitError('');
                }}
              />
            </label>
          </Field>
          <Field id="requirement-title" label="Short title" required>
            <TextInput
              id="requirement-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Q3 clinic restock list"
            />
          </Field>
          <Field id="requirement-notes" label="Notes" required hint="Required by the API. Explain what the document contains.">
            <Textarea
              id="requirement-notes"
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          {submitError && <InlineError message={submitError} />}
        </form>
      </Modal>
    </>
  );
}
