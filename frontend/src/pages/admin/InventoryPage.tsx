import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, Boxes, History, PackagePlus, SlidersHorizontal } from 'lucide-react';
import { apiMeta, apiSend } from '@/lib/api';
import { mapBatches, mapInventoryMovements, mapInventoryRows, mapProducts } from '@/lib/adapters';
import { buildAdjustStockPayload, buildReceiveStockPayload, buildUpdateBatchPayload, type ReceiveStockFormValues } from '@/lib/payloads';
import { useToast } from '@/contexts/ToastContext';
import { errorMessage, formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox, Field, SelectInput, TextInput, Textarea } from '@/components/ui/Form';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Info } from 'lucide-react';
import type { Batch, InventoryMovement, InventoryRow } from '@/types/api';

type Tab = 'stock' | 'batches' | 'movements';

const emptyReceive: ReceiveStockFormValues = {
  productId: '',
  batchNumber: '',
  quantity: '',
  unitCost: '',
  expiryDate: '',
  mfgDate: '',
  supplier: '',
  manufacturer: '',
  location: '',
  reorderLevel: '',
  note: '',
};

export default function InventoryPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('stock');
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [batch, setBatch] = useState<Batch | null>(null);
  const [batchForm, setBatchForm] = useState({ supplier: '', manufacturer: '', location: '', note: '', isActive: true });
  const [receiving, setReceiving] = useState(false);
  const [receiveForm, setReceiveForm] = useState<ReceiveStockFormValues>(emptyReceive);
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);
  const [adjustForm, setAdjustForm] = useState({ delta: '', reason: '', note: '' });

  const params = {
    page,
    limit: 20,
    search: search || undefined,
    lowStock: filter === 'lowStock' ? true : undefined,
    outOfStock: filter === 'outOfStock' ? true : undefined,
    expiring: filter === 'expiring' ? true : undefined,
    expired: filter === 'expired' ? true : undefined,
  };

  const products = useQuery({
    queryKey: ['products', { inventory: true }],
    queryFn: async () => mapProducts((await apiMeta<unknown>('/products', { params: { page: 1, limit: 300 } })).data),
    staleTime: 60_000,
  });

  const stock = useQuery({
    queryKey: ['inventory', params],
    queryFn: async () => {
      const { data, meta } = await apiMeta<unknown>('/inventory', { params });
      return { rows: mapInventoryRows(data), total: Number(meta.total ?? 0) };
    },
    placeholderData: (previous) => previous,
    enabled: tab === 'stock',
  });

  const batches = useQuery({
    queryKey: ['batches', params],
    queryFn: async () => {
      const { data, meta } = await apiMeta<unknown>('/batches', { params });
      return { rows: mapBatches(data), total: Number(meta.total ?? 0) };
    },
    placeholderData: (previous) => previous,
    enabled: tab === 'batches',
  });

  const movements = useQuery({
    queryKey: ['inventory-movements', { page, search }],
    queryFn: async () => {
      const { data, meta } = await apiMeta<unknown>('/inventory/movements', { params: { page, limit: 20, search: search || undefined, sort: '-createdAt' } });
      return { rows: mapInventoryMovements(data), total: Number(meta.total ?? 0) };
    },
    placeholderData: (previous) => previous,
    enabled: tab === 'movements',
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    void queryClient.invalidateQueries({ queryKey: ['batches'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
    void queryClient.invalidateQueries({ queryKey: ['reports', 'inventory'] });
  };

  const receive = useMutation({
    mutationFn: () => apiSend('post', '/inventory/batches', buildReceiveStockPayload(receiveForm)),
    onSuccess: () => {
      invalidate();
      setReceiving(false);
      setReceiveForm(emptyReceive);
      showToast('success', 'Stock received', 'A batch and its inventory row were updated by the service.');
    },
    onError: (error) => showToast('error', 'Stock not received', errorMessage(error)),
  });

  // `adjustStockSchema` is keyed on the inventory row, so the row is chosen first.
  const adjust = useMutation({
    mutationFn: () => {
      if (!adjusting) throw new Error('No inventory row selected.');
      const delta = Number(adjustForm.delta);
      if (!Number.isInteger(delta) || delta === 0) throw new Error('Enter a non-zero whole number of units.');
      return apiSend(
        'post',
        '/inventory/adjust',
        buildAdjustStockPayload({ inventoryId: adjusting.id, delta, reason: adjustForm.reason, note: adjustForm.note }),
      );
    },
    onSuccess: () => {
      invalidate();
      setAdjusting(null);
      setAdjustForm({ delta: '', reason: '', note: '' });
      showToast('success', 'Inventory adjusted', 'A signed movement was written to the stock ledger.');
    },
    onError: (error) => showToast('error', 'Adjustment not saved', errorMessage(error)),
  });

  // `PATCH /batches/:id` is the only batch mutation the service exposes.
  const saveBatch = useMutation({
    mutationFn: () => {
      if (!batch) throw new Error('No batch selected.');
      return apiSend('patch', `/batches/${batch.id}`, buildUpdateBatchPayload(batchForm));
    },
    onSuccess: () => {
      invalidate();
      setBatch(null);
      showToast('success', 'Batch updated', 'Supplier, manufacturer, location and quarantine state were saved.');
    },
    onError: (error) => showToast('error', 'Batch not updated', errorMessage(error)),
  });

  const stockColumns: Column<InventoryRow>[] = [
    {
      key: 'product',
      header: 'Product',
      className: 'max-w-[320px]',
      render: (item) => (
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <Boxes className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-medium text-charcoal">
              {item.product && typeof item.product === 'object' ? item.product.name : item.productId}
            </p>
            <p className="truncate text-xs text-muted">
              {item.product && typeof item.product === 'object' ? item.product.sku : ''} - batch {item.batchNumber}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'onHand',
      header: 'On hand',
      render: (item) => (
        <div className="whitespace-nowrap">
          <span className="tabular-nums">{formatNumber(item.quantityOnHand)}</span>
          <span className="block text-[11px] text-muted">
            {formatNumber(item.quantityAvailable)} available
            {item.quantityReserved > 0 && <> · {formatNumber(item.quantityReserved)} reserved</>}
            {' · '}reorder {formatNumber(item.reorderLevel)}
          </span>
        </div>
      ),
    },
    {
      key: 'expiry',
      header: 'Expires',
      render: (item) => (
        <span className={`whitespace-nowrap ${item.isExpired ? 'font-medium text-red-600' : ''}`}>
          {formatDate(item.expiryDate)}
        </span>
      ),
      mobileLabel: false,
    },
    {
      key: 'cost',
      header: 'Cost',
      render: (item) => <span className="whitespace-nowrap tabular-nums">{formatCurrency(item.unitCost)}</span>,
      mobileLabel: false,
    },
    {
      key: 'location',
      header: 'Location',
      render: (item) => <span className="whitespace-nowrap">{item.location || '—'}</span>,
      mobileLabel: false,
    },
    {
      key: 'signal',
      header: 'Signal',
      render: (item) => (
        <div className="flex flex-wrap gap-1">
          {item.isExpired && <Badge value="EXPIRED" />}
          {!item.isExpired && item.quantityAvailable <= 0 && <Badge value="OUT_OF_STOCK" />}
          {!item.isExpired && item.quantityAvailable > 0 && item.quantityAvailable <= item.reorderLevel && (
            <Badge value="LOW_STOCK" />
          )}
          {!item.isExpired && item.quantityAvailable > item.reorderLevel && <Badge value="IN_STOCK" />}
        </div>
      ),
      mobileLabel: false,
    },
    {
      key: 'actions',
      header: '',
      render: (item) => (
        <button
          className="font-semibold text-brand-700"
          onClick={(event) => {
            event.stopPropagation();
            setAdjusting(item);
            setAdjustForm({ delta: '', reason: '', note: '' });
          }}
        >
          Adjust
        </button>
      ),
      mobileLabel: false,
    },
  ];

  const batchColumns: Column<Batch>[] = [
    {
      key: 'batch',
      header: 'Batch',
      render: (item) => (
        <div>
          <p className="whitespace-nowrap text-[13px] font-medium text-charcoal">{item.batchNumber}</p>
          <p className="text-xs text-muted">
            {item.productId && typeof item.productId === 'object' ? item.productId.name : item.productId}
          </p>
        </div>
      ),
    },
    { key: 'manufacturer', header: 'Manufacturer', render: (item) => item.manufacturer || '—' },
    { key: 'supplier', header: 'Supplier', render: (item) => item.supplier || '—', mobileLabel: false },
    { key: 'mfg', header: 'Manufactured', render: (item) => formatDate(item.mfgDate), mobileLabel: false },
    {
      key: 'expiry',
      header: 'Expires',
      render: (item) => (
        <span className={`whitespace-nowrap ${item.isExpired ? 'font-medium text-red-600' : ''}`}>
          {formatDate(item.expiryDate)}
        </span>
      ),
    },
    { key: 'received', header: 'Received', render: (item) => formatDate(item.receivedAt), mobileLabel: false },
    { key: 'status', header: 'Status', render: (item) => <Badge value={item.isExpired ? 'EXPIRED' : item.status} /> },
    {
      key: 'actions',
      header: '',
      render: (item) => (
        <button
          className="font-semibold text-brand-700"
          onClick={(event) => {
            event.stopPropagation();
            setBatch(item);
            setBatchForm({
              supplier: item.supplier ?? '',
              manufacturer: item.manufacturer ?? '',
              location: '',
              note: item.note ?? '',
              // Quarantined batches are not sellable; the flag maps to isActive.
              isActive: item.status !== 'QUARANTINED' && !item.isExpired,
            });
          }}
        >
          Edit
        </button>
      ),
      mobileLabel: false,
    },
  ];

  const movementColumns: Column<InventoryMovement>[] = [
    { key: 'date', header: 'When', render: (item) => formatDate(item.createdAt, 'dd MMM yyyy, HH:mm') },
    { key: 'type', header: 'Movement', render: (item) => <Badge value={item.type} /> },
    { key: 'product', header: 'Product', render: (item) => <div><p className="text-[13px] font-medium text-charcoal">{item.productName || item.productId}</p><p className="text-xs text-muted">Batch {item.batchNumber}</p></div> },
    { key: 'quantity', header: 'Quantity', render: (item) => <span className={item.direction === 'IN' ? 'font-medium tabular-nums text-brand-700' : 'font-medium tabular-nums text-amber-700'}>{item.direction === 'IN' ? '+' : '−'}{formatNumber(item.quantity)}</span> },
    { key: 'balance', header: 'Balance after', render: (item) => `${formatNumber(item.balanceOnHand)} on hand / ${formatNumber(item.balanceReserved)} reserved`, mobileLabel: false },
    { key: 'reference', header: 'Reference', render: (item) => <div><p className="text-sm font-semibold">{item.referenceNumber || item.referenceType || 'Manual'}</p>{item.reason && <p className="text-xs text-muted">{item.reason}</p>}</div>, mobileLabel: false },
  ];

  const isStock = tab === 'stock';
  const isBatch = tab === 'batches';
  const rows = (isStock ? stock.data?.rows ?? [] : isBatch ? batches.data?.rows ?? [] : movements.data?.rows ?? []) as Array<InventoryRow | Batch | InventoryMovement>;
  const columns = (isStock ? stockColumns : isBatch ? batchColumns : movementColumns) as unknown as Column<InventoryRow | Batch | InventoryMovement>[];
  const total = isStock ? stock.data?.total ?? 0 : isBatch ? batches.data?.total ?? 0 : movements.data?.total ?? 0;
  const loading = isStock ? stock.isLoading : isBatch ? batches.isLoading : movements.isLoading;
  const error = isStock ? stock.error : isBatch ? batches.error : movements.error;
  const retry = () => void (isStock ? stock.refetch() : isBatch ? batches.refetch() : movements.refetch());

  return (
    <>
      <PageHeader
        eyebrow="Stock operations"
        title="Inventory"
        description="Receive batched stock and record signed adjustments against a specific inventory row."
        actions={
          <Button
            onClick={() => {
              setReceiveForm(emptyReceive);
              setReceiving(true);
            }}
          >
            <ArrowDownToLine className="h-4 w-4" /> Receive stock
          </Button>
        }
      />

      <Card className="mb-5 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <div role="tablist" aria-label="Inventory views" className="flex gap-1 rounded-md bg-parchment p-1">
            {(['stock', 'batches', 'movements'] as Tab[]).map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => {
                  setTab(value);
                  setPage(1);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize ${tab === value ? 'bg-white text-brand-700 shadow-soft' : 'text-navy-700'}`}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <TextInput
                aria-label="Search inventory"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={isStock ? 'Batch or location' : isBatch ? 'Batch, supplier or manufacturer' : 'Product, batch or reference'}
                className="w-64"
              />
            </div>
            {!isBatch && tab !== 'movements' && (
              <>
                <SlidersHorizontal className="h-4 w-4 text-muted" />
                <SelectInput
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value);
                    setPage(1);
                  }}
                  className="h-11 w-48"
                  aria-label="Inventory filter"
                >
                  <option value="">All stock</option>
                  <option value="lowStock">Low stock</option>
                  <option value="outOfStock">Out of stock</option>
                  <option value="expiring">Expiring soon</option>
                  <option value="expired">Expired</option>
                </SelectInput>
              </>
            )}
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          getKey={(item) => item.id}
          minWidth="1000px"
          loading={loading}
          error={error}
          onRetry={retry}
          emptyTitle={`No ${tab} found`}
          emptyDescription={tab === 'movements' ? 'Receive or adjust stock to create the first movement.' : 'Adjust the filter, or record a new stock receipt.'}
          footer={<Pagination page={page} limit={20} total={total} onPageChange={setPage} />}
        />
      </Card>

      <div className="mb-5 flex items-start gap-3 rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
        <Info className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          Adjustments are keyed on an <code className="rounded bg-white px-1">inventoryId</code>, not on a product or
          batch, because reserved units cannot be removed. The movements tab shows the signed stock ledger and the
          resulting on-hand/reserved balances.
        </p>
      </div>

      <Modal
        open={Boolean(batch)}
        onClose={() => setBatch(null)}
        title={batch ? `Edit batch ${batch.batchNumber}` : 'Edit batch'}
        description="Only batch metadata can be edited. Quantities move through a signed adjustment."
        footer={
          <>
            <Button variant="ghost" onClick={() => setBatch(null)}>
              Cancel
            </Button>
            <Button loading={saveBatch.isPending} onClick={() => saveBatch.mutate()}>
              Save batch
            </Button>
          </>
        }
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            saveBatch.mutate();
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="batch-supplier" label="Supplier">
              <TextInput
                id="batch-supplier"
                value={batchForm.supplier}
                onChange={(event) => setBatchForm({ ...batchForm, supplier: event.target.value })}
              />
            </Field>
            <Field id="batch-manufacturer" label="Manufacturer">
              <TextInput
                id="batch-manufacturer"
                value={batchForm.manufacturer}
                onChange={(event) => setBatchForm({ ...batchForm, manufacturer: event.target.value })}
              />
            </Field>
            <Field id="batch-location" label="Location" hint="Applied to the batch's inventory row.">
              <TextInput
                id="batch-location"
                value={batchForm.location}
                onChange={(event) => setBatchForm({ ...batchForm, location: event.target.value })}
              />
            </Field>
            <Field id="batch-note" label="Note" hint="Optional">
              <TextInput
                id="batch-note"
                value={batchForm.note}
                onChange={(event) => setBatchForm({ ...batchForm, note: event.target.value })}
              />
            </Field>
          </div>
          <Field
            id="batch-active"
            label="Sellable"
            hint="Clearing this quarantines the batch; the service stops treating it as available stock."
          >
            <Checkbox
              label="Batch is active"
              checked={batchForm.isActive}
              onChange={(event) => setBatchForm({ ...batchForm, isActive: event.target.checked })}
            />
          </Field>
          {batch && (
            <p className="rounded-md bg-ivory p-3 text-xs leading-5 text-muted">
              Expiry {formatDate(batch.expiryDate)}
              {batch.isExpired ? ' - this batch has already expired and cannot be reactivated.' : ''}
            </p>
          )}
        </form>
      </Modal>

      {/* ------------------------------------------------------ receive */}
      <Modal
        open={receiving}
        onClose={() => setReceiving(false)}
        size="lg"
        title="Receive stock"
        description="Creates or extends a batch and its inventory row. Expiry must be in the future."
        footer={
          <>
            <Button variant="ghost" onClick={() => setReceiving(false)}>
              Cancel
            </Button>
            <Button loading={receive.isPending} disabled={!receiveForm.productId || !receiveForm.batchNumber} onClick={() => receive.mutate()}>
              Receive batch
            </Button>
          </>
        }
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            receive.mutate();
          }}
        >
          <Field id="receive-product" label="Product" required>
            <SelectInput
              id="receive-product"
              value={receiveForm.productId}
              onChange={(event) => setReceiveForm({ ...receiveForm, productId: event.target.value })}
            >
              <option value="">Choose product</option>
              {(products.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} - {item.sku}
                </option>
              ))}
            </SelectInput>
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="receive-batch" label="Batch number" required>
              <TextInput
                id="receive-batch"
                value={receiveForm.batchNumber}
                onChange={(event) => setReceiveForm({ ...receiveForm, batchNumber: event.target.value })}
              />
            </Field>
            <Field id="receive-quantity" label="Quantity" required>
              <TextInput
                id="receive-quantity"
                type="number"
                min="1"
                value={receiveForm.quantity}
                onChange={(event) => setReceiveForm({ ...receiveForm, quantity: event.target.value })}
              />
            </Field>
            <Field id="receive-expiry" label="Expiry date" required>
              <TextInput
                id="receive-expiry"
                type="date"
                value={receiveForm.expiryDate}
                onChange={(event) => setReceiveForm({ ...receiveForm, expiryDate: event.target.value })}
              />
            </Field>
            <Field id="receive-mfg" label="Manufactured date" hint="Optional">
              <TextInput
                id="receive-mfg"
                type="date"
                value={receiveForm.mfgDate}
                onChange={(event) => setReceiveForm({ ...receiveForm, mfgDate: event.target.value })}
              />
            </Field>
            <Field id="receive-cost" label="Unit cost" hint="Optional">
              <TextInput
                id="receive-cost"
                type="number"
                min="0"
                step="0.01"
                value={receiveForm.unitCost}
                onChange={(event) => setReceiveForm({ ...receiveForm, unitCost: event.target.value })}
              />
            </Field>
            <Field id="receive-reorder" label="Reorder level" hint="Defaults to the agency threshold">
              <TextInput
                id="receive-reorder"
                type="number"
                min="0"
                value={receiveForm.reorderLevel}
                onChange={(event) => setReceiveForm({ ...receiveForm, reorderLevel: event.target.value })}
              />
            </Field>
            <Field id="receive-manufacturer" label="Manufacturer" hint="Optional">
              <TextInput
                id="receive-manufacturer"
                value={receiveForm.manufacturer}
                onChange={(event) => setReceiveForm({ ...receiveForm, manufacturer: event.target.value })}
              />
            </Field>
            <Field id="receive-supplier" label="Supplier" hint="Optional">
              <TextInput
                id="receive-supplier"
                value={receiveForm.supplier}
                onChange={(event) => setReceiveForm({ ...receiveForm, supplier: event.target.value })}
              />
            </Field>
            <Field id="receive-location" label="Location" hint="Optional">
              <TextInput
                id="receive-location"
                value={receiveForm.location}
                onChange={(event) => setReceiveForm({ ...receiveForm, location: event.target.value })}
              />
            </Field>
          </div>
          <Field id="receive-note" label="Note" hint="Optional">
            <TextInput
              id="receive-note"
              value={receiveForm.note}
              onChange={(event) => setReceiveForm({ ...receiveForm, note: event.target.value })}
            />
          </Field>
        </form>
      </Modal>

      {/* ------------------------------------------------------- adjust */}
      <Modal
        open={Boolean(adjusting)}
        onClose={() => setAdjusting(null)}
        title="Adjust inventory"
        description="A signed delta on this inventory row, with a mandatory reason."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdjusting(null)}>
              Cancel
            </Button>
            <Button loading={adjust.isPending} disabled={!adjustForm.delta || adjustForm.reason.trim().length < 3} onClick={() => adjust.mutate()}>
              Save adjustment
            </Button>
          </>
        }
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            adjust.mutate();
          }}
        >
          {adjusting && (
            <div className="rounded-lg bg-ivory p-4 text-[13px] text-navy-700">
              <p className="font-semibold text-charcoal">
                {adjusting.product && typeof adjusting.product === 'object' ? adjusting.product.name : adjusting.productId}
              </p>
              <p className="mt-1">
                Batch {adjusting.batchNumber} - on hand {formatNumber(adjusting.quantityOnHand)}, reserved{' '}
                {formatNumber(adjusting.quantityReserved)}, unreserved{' '}
                <strong>{formatNumber(adjusting.quantityOnHand - adjusting.quantityReserved)}</strong>
              </p>
            </div>
          )}
          <Field
            id="adjust-delta"
            label="Units to add or remove"
            required
            hint="Positive to add stock, negative to remove it. Reserved units cannot be removed."
          >
            <TextInput
              id="adjust-delta"
              type="number"
              step="1"
              value={adjustForm.delta}
              onChange={(event) => setAdjustForm({ ...adjustForm, delta: event.target.value })}
              placeholder="-3"
            />
          </Field>
          <Field id="adjust-reason" label="Reason" required hint="Recorded on the stock movement.">
            <Textarea
              id="adjust-reason"
              rows={3}
              value={adjustForm.reason}
              onChange={(event) => setAdjustForm({ ...adjustForm, reason: event.target.value })}
              placeholder="e.g. Physical stock count correction"
            />
          </Field>
          <Field id="adjust-note" label="Note" hint="Optional">
            <TextInput id="adjust-note" value={adjustForm.note} onChange={(event) => setAdjustForm({ ...adjustForm, note: event.target.value })} />
          </Field>
        </form>
      </Modal>
    </>
  );
}
