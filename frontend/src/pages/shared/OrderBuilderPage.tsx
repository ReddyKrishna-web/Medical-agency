import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ImageOff, Minus, PackageCheck, Plus, Search, ShieldCheck, ShoppingCart, Trash2, Building2 } from 'lucide-react';
import { apiMeta, apiSend } from '@/lib/api';
import { mapCategories, mapCustomers, mapOrder, mapProducts, productAvailability, productStock } from '@/lib/adapters';
import { buildOrderPayload, buildStockValidationPayload } from '@/lib/payloads';
import type { StockValidation } from '@/types/api';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { clearOrderDraft, getOrderDraft } from '@/lib/draft';
import { cn, errorMessage, formatCurrency, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, SelectInput, Textarea, TextInput } from '@/components/ui/Form';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState, InlineError, Skeleton } from '@/components/ui/States';

interface Values {
  customerId?: string;
  notes?: string;
  /** Only used for the local basket; never submitted as a whole form. */
  items: BasketLine[];
}

interface BasketLine {
  productId: string;
  quantity: number;
}

export default function OrderBuilderPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'customer';
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const debounced = useDebounce(search);
  const draftLoaded = useRef(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({
    defaultValues: { customerId: role === 'customer' ? undefined : params.get('customer') || '', notes: '', items: [] },
  });

  const { fields, append, update, remove } = useFieldArray({ control, name: 'items' });

  useEffect(() => {
    if (draftLoaded.current) return;
    const draft = getOrderDraft();
    if (draft) {
      reset({
        customerId: draft.customerId || (role === 'customer' ? undefined : ''),
        notes: draft.notes || '',
        items: draft.items,
      });
      showToast('info', 'Draft restored', 'A saved basket was copied into this order. No historical order was changed.');
    }
    draftLoaded.current = true;
  }, [reset, role, showToast]);

  const products = useQuery({
    queryKey: ['products', { page, search: debounced, categoryId: category }],
    queryFn: async () => {
      const { data, meta } = await apiMeta<unknown>('/products', {
        params: { page, limit: 12, search: debounced || undefined, categoryId: category || undefined },
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

  const customers = useQuery({
    queryKey: ['customers', { order: true, limit: 200 }],
    queryFn: async () => mapCustomers((await apiMeta<unknown>('/customers', { params: { page: 1, limit: 200, status: 'ACTIVE' } })).data),
    enabled: role !== 'customer',
  });

  const productRows = useMemo(() => products.data?.rows ?? [], [products.data]);
  const productTotal = products.data?.total ?? 0;
  const productById = useMemo(() => new Map(productRows.map((product) => [product.id, product])), [productRows]);

  const addProduct = (productId: string) => {
    const index = fields.findIndex((field) => field.productId === productId);
    if (index >= 0) {
      update(index, { productId, quantity: Number(fields[index].quantity || 0) + 1 });
      return;
    }
    append({ productId, quantity: 1 });
  };

  const items = fields.map((field) => ({ productId: String(field.productId), quantity: Number(field.quantity) || 1 }));

  const create = useMutation({
    mutationFn: async (values: Values) => {
      if (!items.length) throw new Error('Add at least one product.');

      // `validateOrderSchema` accepts only `{ items }`.
      const validation = await apiSend<StockValidation>(
        'post',
        '/inventory/validate',
        buildStockValidationPayload(items),
      );

      if (validation.ok === false) {
        const problems = validation.lines
          .filter((line) => !line.isAvailable)
          .map((line) => `${line.productName} (${line.sku}): ${line.sellable} sellable of ${line.requested} requested`);
        setIssues(problems.length ? problems : ['One or more lines cannot be fulfilled from live stock.']);
        throw new Error('Stock validation did not pass for every line.');
      }
      setIssues([]);

      // `createOrderSchema` has no price/tax fields; the server owns all values.
      const body = buildOrderPayload({
        customerId: role === 'customer' ? undefined : values.customerId,
        items,
        notes: values.notes,
      });
      return mapOrder(await apiSend<unknown>('post', '/orders', body));
    },
    onSuccess: (order) => {
      clearOrderDraft();
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      showToast('success', 'Order submitted', `Order ${order.orderNumber} is now pending review.`);
      navigate(`/${role}/orders/${order.id}`);
    },
    onError: (error) => showToast('error', 'Order not submitted', errorMessage(error)),
  });

  const submit = handleSubmit((values) => create.mutate(values));

  const step = (index: number, delta: number) => {
    const quantity = Math.max(1, Number(fields[index].quantity || 1) + delta);
    update(index, { ...fields[index], quantity });
  };

  return (
    <>
      <PageHeader
        eyebrow="Procurement"
        title="Create bulk order"
        description="Build a multi-line basket. Sellable stock is validated before the service prices, taxes and numbers the order."
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Product catalog" description="Search or filter by category, then add products with quantities." />
            <CardBody>
              <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
                <div className="relative">
                  <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                  <TextInput
                    aria-label="Search products"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Search by name, SKU or brand"
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
              </div>
            </CardBody>
          </Card>

          {products.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-52" />
              ))}
            </div>
          ) : products.error ? (
            <ErrorState error={products.error} onRetry={() => void products.refetch()} />
          ) : productRows.length ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {productRows.map((product) => {
                  const selected = fields.some((field) => field.productId === product.id);
                  const stock = productStock(product);
                  const state = productAvailability(product);
                  return (
                    <article
                      key={product.id}
                      className={cn(
                        'overflow-hidden rounded-2xl border bg-white shadow-soft transition',
                        selected ? 'border-medical-400 ring-2 ring-medical-100' : 'border-slate-200',
                      )}
                    >
                      <div className="flex h-32 items-center justify-center bg-slate-50">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt=""
                            className="h-full w-full object-contain p-3"
                            loading="lazy"
                            onError={(event) => {
                              event.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <ImageOff className="h-8 w-8 text-slate-300" />
                        )}
                      </div>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate font-bold text-ink">{product.name}</h3>
                            <p className="mt-0.5 truncate text-xs text-slate-400">
                              {[product.genericName, product.brand, product.manufacturer].filter(Boolean).join(' / ') ||
                                product.sku}
                            </p>
                          </div>
                          {!product.isActive && <Badge value="DISABLED" />}
                        </div>
                        <p className="mt-2 line-clamp-2 min-h-9 text-xs leading-5 text-slate-500">
                          {product.description || 'No product description provided.'}
                        </p>
                        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                          {state && <Badge value={state} />}
                          {stock !== undefined && <span>Available {formatNumber(stock)}</span>}
                        </div>
                        <div className="mt-4 flex items-end justify-between gap-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-slate-400">Catalog price</p>
                            <p className="font-extrabold text-slate-800">{formatCurrency(product.price)}</p>
                          </div>
                          <Button size="sm" variant={selected ? 'success' : 'primary'} onClick={() => addProduct(product.id)}>
                            {selected ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                            {selected ? 'Add another' : 'Add'}
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white">
                <Pagination page={page} limit={12} total={productTotal} onPageChange={setPage} />
              </div>
            </>
          ) : (
            <Card>
              <EmptyState icon={Search} title="No products found" description="Try a broader product search or another category." />
            </Card>
          )}
        </div>

        <Card className="overflow-hidden xl:sticky xl:top-24">
          <CardHeader
            title="Order basket"
            description={`${fields.length} product${fields.length === 1 ? '' : 's'} selected`}
            action={
              <span className="rounded-full bg-brand-50 p-2 text-brand-700">
                <ShoppingCart className="h-4 w-4" />
              </span>
            }
          />
          <form onSubmit={submit}>
            <CardBody className="space-y-5">
              {/*
                Agency confirmation comes first: every basket is placed with the
                account's agency. Shops are bound to their agency at approval;
                salesmen order on behalf of a shop inside the same agency.
              */}
              <div className="rounded-xl border border-medical-200 bg-medical-50/70 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-medical-700 ring-1 ring-medical-200">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-medical-700">Ordering from</p>
                    <p className="truncate text-sm font-extrabold text-ink">{user?.agency?.name ?? 'Your agency'}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {role === 'customer'
                        ? 'After selecting your medicals here, the whole basket is placed with this agency.'
                        : 'The basket is placed with this agency on behalf of the selected medical shop.'}
                    </p>
                  </div>
                </div>
              </div>

              {role !== 'customer' && (
                <Field id="customerId" label="Customer" error={errors.customerId?.message} required>
                  <SelectInput
                    id="customerId"
                    {...register('customerId', { required: 'Choose a customer for this order.' })}
                  >
                    <option value="">Select a customer</option>
                    {(customers.data ?? []).map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.businessName}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
              )}

              {!fields.length ? (
                <EmptyState
                  icon={ShoppingCart}
                  title="Your basket is empty"
                  description="Add products from the catalog. You can submit multiple lines at once."
                />
              ) : (
                <div className="max-h-[38vh] space-y-3 overflow-y-auto pr-1">
                  {fields.map((field, index) => {
                    const product = productById.get(String(field.productId));
                    return (
                      <div key={field.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-start gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                            <PackageCheck className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-800">
                              {product?.name ?? `Product ${String(field.productId).slice(-8)}`}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-400">{product?.sku ?? 'SKU unavailable'}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                            aria-label="Remove product"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <p className="text-xs text-slate-500">Quantity</p>
                          <div className="flex items-center rounded-lg border border-slate-300">
                            <button
                              type="button"
                              className="p-2 hover:bg-slate-50"
                              onClick={() => step(index, -1)}
                              aria-label="Decrease quantity"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              aria-label={`Quantity for ${product?.name ?? 'product'}`}
                              className="w-14 border-x border-slate-200 py-1.5 text-center text-sm font-semibold outline-none"
                              value={Number(field.quantity) || 1}
                              onChange={(event) => update(index, { productId: String(field.productId), quantity: Math.max(1, Number(event.target.value) || 1) })}
                            />
                            <button
                              type="button"
                              className="p-2 hover:bg-slate-50"
                              onClick={() => step(index, 1)}
                              aria-label="Increase quantity"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {fields.length > 0 && (
                <Field
                  id="notes"
                  label="Order notes"
                  hint="Optional purchasing or delivery context. Do not include patient information."
                >
                  <Textarea
                    id="notes"
                    rows={3}
                    placeholder="Add a note for the agency team"
                    {...register('notes')}
                  />
                </Field>
              )}

              {issues.length > 0 && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <p className="font-bold">Stock validation needs attention</p>
                  <ul className="mt-1 list-inside list-disc">
                    {issues.map((issue, index) => (
                      <li key={index}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}

              {customers.error && role !== 'customer' && (
                <InlineError message="The customer list could not be loaded for this account." />
              )}

              <div className="flex gap-3 rounded-xl bg-slate-50 p-4">
                <ShieldCheck className="h-5 w-5 shrink-0 text-medical-700" />
                <p className="text-xs leading-5 text-slate-600">
                  No client price or tax is submitted. The service validates your account and resolves all commercial
                  values when the order is created.
                </p>
              </div>
            </CardBody>
            <div className="border-t border-slate-100 bg-slate-50 p-5">
              <Button type="submit" className="w-full" size="lg" loading={create.isPending} disabled={!fields.length}>
                <PackageCheck className="h-4 w-4" /> Validate and submit order
              </Button>
              {params.get('reorder') && (
                <p className="mt-3 text-center text-xs text-medical-700">Copied from a previous order; the original is unchanged.</p>
              )}
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
