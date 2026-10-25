import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, Download, FileText, PackagePlus, ScanSearch, Search, Sparkles, XCircle } from 'lucide-react';
import { api, apiBlob, apiMeta, apiSend, saveBlob } from '@/lib/api';
import { mapOrder, mapProducts, mapRequirement } from '@/lib/adapters';
import { buildRequirementStatusPayload } from '@/lib/payloads';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { errorMessage, fileSize, formatDate } from '@/lib/utils';
import { humanize } from '@/lib/status';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, SelectInput, TextInput, Textarea } from '@/components/ui/Form';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import type { AiStatus, RequirementStatus } from '@/types/api';

const REVIEW_STATUSES: RequirementStatus[] = ['IN_REVIEW', 'ACCEPTED', 'REJECTED'];

export default function RequirementDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const role = user?.role ?? 'customer';
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RequirementStatus | ''>('');
  const [note, setNote] = useState('');
  const [convertOpen, setConvertOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Array<{ productId: string; quantity: number; name: string }>>([]);

  const query = useQuery({
    queryKey: ['requirement', id],
    queryFn: async () => mapRequirement(await api<unknown>(`/requirements/${id}`)),
    enabled: Boolean(id),
  });

  const products = useQuery({
    queryKey: ['products', { requirement: true, search }],
    queryFn: async () => mapProducts((await apiMeta<unknown>('/products', { params: { search: search || undefined, limit: 20 } })).data),
    enabled: convertOpen,
  });

  const aiStatus = useQuery({
    queryKey: ['ai', 'status'],
    queryFn: () => api<AiStatus>('/ai/status'),
    enabled: role === 'admin' || role === 'salesman',
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['requirement', id] });
    void queryClient.invalidateQueries({ queryKey: ['requirements'] });
  };

  // `requirementStatusSchema` accepts `{ status, note }`.
  const update = useMutation({
    mutationFn: () => {
      if (!status) throw new Error('Choose a status.');
      return apiSend<unknown>('post', `/requirements/${id}/status`, buildRequirementStatusPayload(status, note));
    },
    onSuccess: () => {
      invalidate();
      showToast('success', 'Requirement status updated');
      setStatus('');
      setNote('');
    },
    onError: (error) => showToast('error', 'Status not updated', errorMessage(error)),
  });

  const extract = useMutation({
    mutationFn: () => apiSend<unknown>('post', `/requirements/${id}/extract`, {}),
    onSuccess: () => {
      invalidate();
      showToast('success', 'Product lines extracted', 'Review every match before creating an order. No order was submitted.');
    },
    onError: (error) => showToast('error', 'Extraction not available', errorMessage(error)),
  });

  // The response is `{ order, requirementId, orderNumber }`.
  const convert = useMutation({
    mutationFn: () => {
      if (!lines.length) throw new Error('Select at least one product.');
      return apiSend<unknown>('post', `/requirements/${id}/convert-order`, { items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })) });
    },
    onSuccess: (raw) => {
      const result = raw as { order?: unknown; orderNumber?: string } | undefined;
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      setConvertOpen(false);
      setLines([]);
      showToast('success', 'Requirement converted', `Order ${result?.orderNumber ?? ''} was created.`);
      const order = mapOrder(result?.order);
      if (order.id) navigate(`/${role}/orders/${order.id}`);
    },
    onError: (error) => showToast('error', 'Could not convert requirement', errorMessage(error)),
  });

  const download = async () => {
    if (!requirement?.file?.originalName) return;
    try {
      const blob = await apiBlob(`/requirements/${id}/file`);
      saveBlob(blob, requirement.file.originalName);
    } catch (error) {
      showToast('error', 'File download failed', errorMessage(error));
    }
  };

  if (query.isLoading) return <LoadingState rows={6} />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const requirement = query.data;
  if (!requirement) return <EmptyState title="Requirement not found" />;

  const customerName =
    requirement.customerId && typeof requirement.customerId === 'object' ? requirement.customerId.businessName : '—';
  const canReview = role === 'admin' || role === 'salesman';
  const canConvert = canReview && requirement.status !== 'CONVERTED' && requirement.status !== 'REJECTED';

  return (
    <>
      <PageHeader
        eyebrow="Requirement review"
        title={requirement.title}
        description={`Uploaded ${formatDate(requirement.createdAt)} by ${customerName}`}
        actions={
          <Button variant="outline" onClick={() => void download()}>
            <Download className="h-4 w-4" /> Download file
          </Button>
        }
      />

      <div className="mb-5">
        <Link
          to={`/${role}/requirements`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-navy-700 hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" /> All requirements
        </Link>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Document" description="Metadata returned by the service." />
            <CardBody>
              <div className="flex items-center gap-4 rounded-lg bg-ivory p-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-line bg-white text-brand-700">
                  <FileText className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-charcoal">{requirement.file.originalName}</p>
                  <p className="mt-1 text-xs text-muted">
                    {fileSize(requirement.file.sizeBytes)} - {requirement.file.mimeType} - uploaded{' '}
                    {formatDate(requirement.file.uploadedAt || requirement.createdAt)}
                  </p>
                </div>
                <Button className="ml-auto" variant="outline" size="sm" onClick={() => void download()}>
                  Open
                </Button>
              </div>
              {requirement.notes && (
                <p className="mt-6 whitespace-pre-wrap text-[13px] leading-7 text-navy-700">{requirement.notes}</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="AI-assisted product extraction"
              description="Creates candidate lines only. It never submits an order."
              action={<Badge value={requirement.extraction.status} />}
            />
            <CardBody>
              {requirement.extraction.status === 'NOT_REQUESTED' ? (
                <p className="text-[13px] leading-6 text-navy-700">Run extraction to read CSV requirements deterministically. PDF, image and Excel extraction requires a configured AI provider.</p>
              ) : requirement.extraction.status === 'FAILED' ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-[13px] leading-6 text-amber-900"><p className="font-semibold">Extraction did not complete</p><p className="mt-1">The service recorded <code>{requirement.extraction.errorCode ?? 'FAILED'}</code>. Configure the provider or use a CSV file; nothing was invented.</p></div>
              ) : requirement.extraction.items.length === 0 ? (
                <p className="text-[13px] text-muted">No candidate lines were found. Enter products manually during conversion.</p>
              ) : (
                <>
                  <div className="mb-4 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-[13px] leading-6 text-amber-900">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p><strong>Human verification required.</strong> Low-confidence or unmatched lines are marked “Needs verification”. Select only the products and quantities you have checked.</p>
                  </div>
                  <ul className="space-y-3">
                    {requirement.extraction.items.map((item, index) => {
                      const selected = Boolean(item.productId && lines.some((line) => line.productId === item.productId));
                      return (
                        <li key={item.id || `${item.rawText}-${index}`} className="flex flex-col gap-3 rounded-lg border border-line p-4 sm:flex-row sm:items-center">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13.5px] font-medium text-charcoal">{item.productName || item.rawText}</p>
                            <p className="mt-1 text-xs text-muted">Document text: {item.rawText} · Extracted quantity: {item.quantity ?? '—'}</p>
                            <div className="mt-2 flex flex-wrap gap-2"><Badge value={`${Math.round(item.confidence * 100)}% confidence`} tone={item.needsVerification ? 'amber' : 'green'} />{item.needsVerification && <Badge value="NEEDS VERIFICATION" tone="red" />}</div>
                            {item.reason && <p className="mt-2 text-xs text-amber-700">{item.reason}</p>}
                          </div>
                          <Button variant={selected ? 'secondary' : 'outline'} disabled={!item.productId || !item.quantity} onClick={() => setLines(selected ? lines.filter((line) => line.productId !== item.productId) : [...lines, { productId: item.productId!, quantity: item.quantity!, name: item.productName || item.rawText }])}>
                            {selected ? 'Remove' : 'Use line'}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Review state" description="Status and review record maintained by the service." />
            <CardBody>
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-md bg-sage text-brand-700">
                  <ClipboardCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm text-[13.5px] font-medium text-charcoal">Status: {humanize(requirement.status)}</p>
                  <p className="mt-1 text-xs text-muted">Last updated {formatDate(requirement.updatedAt ?? requirement.createdAt)}</p>
                </div>
              </div>
              {requirement.review?.note && (
                <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-[13px] leading-6 text-amber-900">
                  <strong>Review note</strong>
                  <p className="mt-1">{requirement.review.note}</p>
                  {requirement.review.at && <p className="mt-1 text-xs">Recorded {formatDate(requirement.review.at)}</p>}
                </div>
              )}
              {requirement.convertedOrderId && (
                <Link
                  to={`/${role}/orders/${requirement.convertedOrderId}`}
                  className="mt-5 block rounded-md border border-brand-200 bg-sage/60 p-4 text-[13px] font-medium text-brand-800"
                >
                  View the converted order
                </Link>
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24">
          <Card>
            <CardHeader title="Status" />
            <CardBody>
              <div className="mb-5">
                <Badge value={requirement.status} />
              </div>
              {canReview && (
                <div className="space-y-4">
                  <Field id="requirement-status" label="Update status" required>
                    <SelectInput
                      id="requirement-status"
                      value={status}
                      onChange={(event) => setStatus(event.target.value as RequirementStatus)}
                    >
                      <option value="">Choose status</option>
                      {REVIEW_STATUSES.map((value) => (
                        <option key={value} value={value}>
                          {humanize(value)}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field id="review-note" label="Review note" hint="Stored on the requirement and shown to the customer.">
                    <Textarea
                      id="review-note"
                      rows={3}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </Field>
                  <Button className="w-full" disabled={!status} loading={update.isPending} onClick={() => update.mutate()}>
                    <CheckCircle2 className="h-4 w-4" /> Save review
                  </Button>
                </div>
              )}
              {canReview && (
                <div className="mt-5 border-t border-line pt-5">
                  <Button className="w-full" variant="outline" onClick={() => extract.mutate()} loading={extract.isPending} disabled={requirement.status === 'CONVERTED'}>
                    <ScanSearch className="h-4 w-4" /> Extract product lines
                  </Button>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    {requirement.file.extension === '.csv'
                      ? 'CSV is parsed deterministically without an external provider.'
                      : aiStatus.data?.requirementExtraction?.configured
                        ? `Provider: ${aiStatus.data.model ?? 'configured'}. Output always requires human verification.`
                        : 'OCR/document extraction is not configured. The server will not fabricate lines; CSV remains available.'}
                  </p>
                </div>
              )}
              {canConvert && (
                <Button className="mt-5 w-full" onClick={() => setConvertOpen(true)}>
                  <PackagePlus className="h-4 w-4" /> Convert to order
                </Button>
              )}
            </CardBody>
          </Card>

          <div className="rounded-lg border border-brand-100 bg-sage/50 p-5">
            <p className="text-[13.5px] font-semibold text-brand-900">Need more context?</p>
            <p className="mt-1 text-xs leading-5 text-brand-800/70">
              Message the account team with this requirement reference before conversion.
            </p>
            <Link to={`/${role}/messages`} className="mt-3 inline-flex text-[13px] font-medium text-brand-800">
              Open messages
            </Link>
          </div>
        </aside>
      </div>

      <Modal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        size="lg"
        title="Convert requirement to order"
        description="Select products and quantities. The service resolves the customer, pricing, tax and stock."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConvertOpen(false)}>
              Cancel
            </Button>
            <Button loading={convert.isPending} disabled={!lines.length} onClick={() => convert.mutate()}>
              <PackagePlus className="h-4 w-4" /> Create order
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Field id="convert-search" label="Find products">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted" />
              <TextInput
                id="convert-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search the catalogue"
                className="pl-9"
              />
            </div>
          </Field>

          <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
            {products.isLoading ? (
              <LoadingState rows={3} />
            ) : (products.data ?? []).length ? (
              (products.data ?? []).map((product) => {
                const existing = lines.find((line) => line.productId === product.id);
                return (
                  <button
                    type="button"
                    key={product.id}
                    onClick={() =>
                      setLines(
                        existing
                          ? lines.map((line) =>
                              line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
                            )
                          : [...lines, { productId: product.id, quantity: 1, name: product.name }],
                      )
                    }
                    className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-ivory"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded bg-sage text-brand-700">
                      <PackagePlus className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-charcoal">{product.name}</span>
                    {existing && <Badge tone="green">{existing.quantity}</Badge>}
                  </button>
                );
              })
            ) : (
              <p className="p-3 text-[13px] text-muted">No products matched that search.</p>
            )}
          </div>

          {lines.length > 0 && (
            <div className="space-y-2 rounded-lg bg-ivory p-3">
              {lines.map((line) => (
                <div key={line.productId} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{line.name}</span>
                  <input
                    type="number"
                    min="1"
                    aria-label={`Quantity for ${line.name}`}
                    value={line.quantity}
                    onChange={(event) =>
                      setLines(
                        lines.map((item) =>
                          item.productId === line.productId
                            ? { ...item, quantity: Math.max(1, Number(event.target.value) || 1) }
                            : item,
                        ),
                      )
                    }
                    className="w-20 rounded-md border border-line bg-white p-2 text-center text-sm text-charcoal"
                  />
                  <button
                    type="button"
                    onClick={() => setLines(lines.filter((item) => item.productId !== line.productId))}
                    className="rounded-md p-2 text-red-600 transition-colors hover:bg-red-50"
                    aria-label={`Remove ${line.name}`}
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
