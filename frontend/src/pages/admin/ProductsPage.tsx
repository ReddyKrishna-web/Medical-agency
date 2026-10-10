import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Link2, Package, Plus, Search } from 'lucide-react';
import { apiMeta, apiSend } from '@/lib/api';
import { mapCategories, mapProduct, mapProducts, productAvailability, productStock } from '@/lib/adapters';
import { buildProductPayload, type ProductFormValues } from '@/lib/payloads';
import { useToast } from '@/contexts/ToastContext';
import { useDebounce } from '@/hooks/useDebounce';
import { errorMessage, formatCurrency, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox, Field, SelectInput, TextInput, Textarea } from '@/components/ui/Form';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import type { Availability, Product } from '@/types/api';

const emptyForm: ProductFormValues = {
  name: '',
  sku: '',
  categoryId: '',
  brand: '',
  genericName: '',
  manufacturer: '',
  description: '',
  hsnCode: '',
  price: '',
  mrp: '',
  taxRate: '18',
  unit: 'UNIT',
  packSize: '',
  minOrderQuantity: '1',
  maxOrderQuantity: '',
  imageUrl: '',
  reorderLevel: '',
  tags: '',
  isActive: true,
  isFeatured: false,
};

/** `PRODUCT_AVAILABILITIES`; an unsupported value would be rejected by the API. */
const AVAILABILITY_OPTIONS: Array<{ value: Availability; label: string }> = [
  { value: 'IN_STOCK', label: 'In stock' },
  { value: 'LOW_STOCK', label: 'Low stock' },
  { value: 'OUT_OF_STOCK', label: 'Out of stock' },
];

export default function ProductsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [availability, setAvailability] = useState('');
  const [includeInactive, setIncludeInactive] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [archiving, setArchiving] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormValues>(emptyForm);

  const debouncedSearch = useDebounce(search);
  const debouncedBrand = useDebounce(brand);
  const debouncedManufacturer = useDebounce(manufacturer);

  const query = useQuery({
    queryKey: ['products', { page, search: debouncedSearch, categoryId: category, brand: debouncedBrand, manufacturer: debouncedManufacturer, availability, includeInactive }],
    queryFn: async () => {
      const { data, meta } = await apiMeta<unknown>('/products', {
        params: {
          page,
          limit: 20,
          search: debouncedSearch || undefined,
          categoryId: category || undefined,
          brand: debouncedBrand || undefined,
          manufacturer: debouncedManufacturer || undefined,
          availability: availability || undefined,
          includeInactive: includeInactive ? true : undefined,
        },
      });
      return { rows: mapProducts(data), total: Number(meta.total ?? 0) };
    },
    placeholderData: (previous) => previous,
  });

  const categories = useQuery({
    queryKey: ['categories', { limit: 200 }],
    queryFn: async () => mapCategories((await apiMeta<unknown>('/categories', { params: { limit: 200 } })).data),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!editing) return;
    setForm({
      name: editing.name,
      sku: editing.sku,
      categoryId: editing.categoryId ?? '',
      brand: editing.brand ?? '',
      genericName: editing.genericName ?? '',
      manufacturer: editing.manufacturer ?? '',
      description: editing.description ?? '',
      hsnCode: editing.hsnCode ?? '',
      price: String(editing.price),
      mrp: editing.mrp === undefined ? '' : String(editing.mrp),
      taxRate: String(editing.taxRate),
      unit: editing.unit,
      packSize: editing.packSize ?? '',
      minOrderQuantity: String(editing.minOrderQuantity ?? 1),
      maxOrderQuantity: editing.maxOrderQuantity === undefined ? '' : String(editing.maxOrderQuantity),
      imageUrl: editing.imageUrl ?? '',
      reorderLevel: editing.reorderLevel === undefined ? '' : String(editing.reorderLevel),
      tags: editing.tags.join(', '),
      isActive: editing.isActive,
      isFeatured: editing.isFeatured,
    });
  }, [editing]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  // `createProductSchema` is JSON: there is no product image upload endpoint.
  const save = useMutation({
    mutationFn: () => {
      const body = buildProductPayload(form);
      return editing ? apiSend<unknown>('patch', `/products/${editing.id}`, body) : apiSend<unknown>('post', '/products', body);
    },
    onSuccess: (raw) => {
      const saved = mapProduct(raw);
      invalidate();
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      showToast('success', editing ? 'Product updated' : 'Product created', `${saved.name} (${saved.sku})`);
    },
    onError: (error) => showToast('error', 'Product not saved', errorMessage(error)),
  });

  const archive = useMutation({
    mutationFn: () => apiSend('delete', `/products/${archiving?.id}`),
    onSuccess: () => {
      invalidate();
      showToast('success', 'Product archived', 'Archived products can no longer be ordered but keep their history.');
      setArchiving(null);
    },
    onError: (error) => {
      showToast('error', 'Product not archived', errorMessage(error));
      setArchiving(null);
    },
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? rows.length;

  const columns: Column<Product>[] = [
    {
      key: 'product',
      header: 'Product',
      render: (item) => (
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-brand-50 text-brand-700">
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt=""
                className="h-full w-full object-contain"
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <Package className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold text-slate-800">{item.name}</p>
            <p className="truncate text-xs text-slate-400">
              {[item.genericName, item.brand, item.manufacturer].filter(Boolean).join(' / ') || item.sku}
            </p>
          </div>
        </div>
      ),
    },
    { key: 'sku', header: 'SKU', render: (item) => <code className="text-xs text-slate-500">{item.sku}</code>, mobileLabel: false },
    { key: 'pack', header: 'Pack', render: (item) => item.packSize || item.unit, mobileLabel: false },
    {
      key: 'price',
      header: 'Price',
      render: (item) => (
        <div>
          <p className="font-bold text-slate-800">{formatCurrency(item.price)}</p>
          {item.mrp !== undefined && item.mrp > 0 && (
            <p className="text-xs text-slate-400">MRP {formatCurrency(item.mrp)}</p>
          )}
        </div>
      ),
    },
    { key: 'tax', header: 'GST', render: (item) => `${formatNumber(item.taxRate)}%`, mobileLabel: false },
    {
      key: 'stock',
      header: 'Available',
      render: (item) => {
        const stock = productStock(item);
        const state = productAvailability(item);
        return (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">{stock === undefined ? '—' : formatNumber(stock)}</span>
            {state && <Badge value={state} />}
          </div>
        );
      },
    },
    { key: 'status', header: 'Status', render: (item) => <Badge value={item.isActive ? 'ACTIVE' : 'DISABLED'} /> },
    {
      key: 'actions',
      header: '',
      render: (item) => (
        <div className="flex items-center gap-3">
          <button
            className="inline-flex items-center gap-1.5 font-semibold text-brand-700"
            onClick={(event) => {
              event.stopPropagation();
              setEditing(item);
              setOpen(true);
            }}
          >
            <Edit3 className="h-4 w-4" /> Edit
          </button>
          {item.isActive && (
            <button
              className="inline-flex items-center gap-1.5 font-semibold text-red-600"
              onClick={(event) => {
                event.stopPropagation();
                setArchiving(item);
              }}
            >
              Archive
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
        eyebrow="Catalog management"
        title="Products"
        description="Price, tax and stock are resolved by the service. The catalog has no file upload route, so product images are referenced by URL."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setForm(emptyForm);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New product
          </Button>
        }
      />

      <Card className="mb-5 p-4">
        <div className="grid gap-3 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
            <TextInput
              aria-label="Search products"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Name, SKU, brand or description"
              className="pl-10"
            />
          </div>
          <SelectInput
            aria-label="Filter category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {(categories.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectInput>
          <TextInput
            aria-label="Filter brand"
            value={brand}
            onChange={(event) => {
              setBrand(event.target.value);
              setPage(1);
            }}
            placeholder="Brand"
          />
          <TextInput
            aria-label="Filter manufacturer"
            value={manufacturer}
            onChange={(event) => {
              setManufacturer(event.target.value);
              setPage(1);
            }}
            placeholder="Manufacturer"
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <SelectInput
            aria-label="Filter availability"
            value={availability}
            onChange={(event) => {
              setAvailability(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All availability</option>
            {AVAILABILITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            aria-label="Filter catalogue state"
            value={includeInactive ? 'all' : 'active'}
            onChange={(event) => setIncludeInactive(event.target.value === 'all')}
          >
            <option value="all">Active and archived</option>
            <option value="active">Active only</option>
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
          emptyTitle="No products match these filters"
          emptyDescription="Adjust the filters, or create the first product."
          emptyAction={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setForm(emptyForm);
                setOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> New product
            </Button>
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
        size="lg"
        title={editing ? `Edit ${editing.name}` : 'New product'}
        description="Sent as a JSON body matching createProductSchema. Price, unit and tax are required."
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
            <Button loading={save.isPending} disabled={!form.name.trim() || !form.unit.trim()} onClick={() => save.mutate()}>
              {editing ? 'Save changes' : 'Create product'}
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
          <Field id="product-name" label="Product name" required>
            <TextInput id="product-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field id="product-generic" label="Generic name" hint="Optional">
              <TextInput
                id="product-generic"
                value={form.genericName}
                onChange={(event) => setForm({ ...form, genericName: event.target.value })}
              />
            </Field>
            <Field id="product-brand" label="Brand" hint="Optional">
              <TextInput id="product-brand" value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} />
            </Field>
            <Field id="product-manufacturer" label="Manufacturer" hint="Optional">
              <TextInput
                id="product-manufacturer"
                value={form.manufacturer}
                onChange={(event) => setForm({ ...form, manufacturer: event.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field id="product-sku" label="SKU / product code" hint="Generated by the service when blank">
              <TextInput id="product-sku" value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} />
            </Field>
            <Field id="product-hsn" label="HSN code" hint="Optional">
              <TextInput id="product-hsn" value={form.hsnCode} onChange={(event) => setForm({ ...form, hsnCode: event.target.value })} />
            </Field>
            <Field id="product-category" label="Category" hint="Optional">
              <SelectInput
                id="product-category"
                value={form.categoryId}
                onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
              >
                <option value="">Uncategorised</option>
                {(categories.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-4">
            <Field id="product-price" label="Business price" required>
              <TextInput
                id="product-price"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
              />
            </Field>
            <Field id="product-mrp" label="MRP" hint="Optional">
              <TextInput
                id="product-mrp"
                type="number"
                min="0"
                step="0.01"
                value={form.mrp}
                onChange={(event) => setForm({ ...form, mrp: event.target.value })}
              />
            </Field>
            <Field id="product-tax" label="GST rate (%)" required>
              <TextInput
                id="product-tax"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.taxRate}
                onChange={(event) => setForm({ ...form, taxRate: event.target.value })}
              />
            </Field>
            <Field id="product-reorder" label="Reorder level" hint="Optional">
              <TextInput
                id="product-reorder"
                type="number"
                min="0"
                value={form.reorderLevel}
                onChange={(event) => setForm({ ...form, reorderLevel: event.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-4">
            <Field id="product-unit" label="Selling unit" required hint="e.g. UNIT, BOX, STRIP">
              <TextInput id="product-unit" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
            </Field>
            <Field id="product-pack" label="Pack size" hint="Optional">
              <TextInput
                id="product-pack"
                value={form.packSize}
                onChange={(event) => setForm({ ...form, packSize: event.target.value })}
              />
            </Field>
            <Field id="product-min" label="Min order qty">
              <TextInput
                id="product-min"
                type="number"
                min="1"
                value={form.minOrderQuantity}
                onChange={(event) => setForm({ ...form, minOrderQuantity: event.target.value })}
              />
            </Field>
            <Field id="product-max" label="Max order qty" hint="Optional">
              <TextInput
                id="product-max"
                type="number"
                min="1"
                value={form.maxOrderQuantity}
                onChange={(event) => setForm({ ...form, maxOrderQuantity: event.target.value })}
              />
            </Field>
          </div>

          <Field id="product-image" label="Image URL" hint="HTTPS URL. The API exposes no product file upload.">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 shrink-0 text-slate-400" />
              <TextInput
                id="product-image"
                type="url"
                value={form.imageUrl}
                onChange={(event) => setForm({ ...form, imageUrl: event.target.value })}
                placeholder="https://"
              />
            </div>
          </Field>

          <Field id="product-tags" label="Tags" hint="Comma separated, up to 20">
            <TextInput id="product-tags" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
          </Field>

          <Field id="product-description" label="Description" hint="Optional">
            <Textarea
              id="product-description"
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>

          <div className="space-y-3">
            <Checkbox
              label="Active"
              description="Inactive products are hidden and cannot be ordered."
              checked={form.isActive}
              onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
            />
            <Checkbox
              label="Featured"
              description="Featured products can be promoted in the customer catalog."
              checked={form.isFeatured}
              onChange={(event) => setForm({ ...form, isFeatured: event.target.checked })}
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(archiving)}
        onClose={() => setArchiving(null)}
        onConfirm={() => archive.mutate()}
        loading={archive.isPending}
        title="Archive this product?"
        description={
          archiving
            ? `${archiving.name} stays on historical orders and invoices but is removed from the catalog.`
            : ''
        }
        confirmLabel="Archive product"
        danger
      />
    </>
  );
}
