import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Boxes, PackagePlus, Search, Users } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { apiMeta } from '@/lib/api';
import { mapCategories, mapProducts, productAvailability, productStock } from '@/lib/adapters';
import { getOrderDraft, saveOrderDraft } from '@/lib/draft';
import { useToast } from '@/contexts/ToastContext';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectInput, TextInput } from '@/components/ui/Form';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Pagination';
import type { Availability, Product } from '@/types/api';

/** `PRODUCT_AVAILABILITIES`; an unsupported value would be rejected by the API. */
const AVAILABILITY_OPTIONS: Array<{ value: Availability; label: string }> = [
  { value: 'IN_STOCK', label: 'In stock' },
  { value: 'LOW_STOCK', label: 'Low stock' },
  { value: 'OUT_OF_STOCK', label: 'Out of stock' },
];

export default function CatalogPage() {
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [availability, setAvailability] = useState('');

  const debouncedSearch = useDebounce(search);
  const debouncedBrand = useDebounce(brand);
  const debouncedManufacturer = useDebounce(manufacturer);

  // `brand`, `manufacturer` and `availability` are list filters supported by the catalog.
  const products = useQuery({
    queryKey: ['products', { page, search: debouncedSearch, categoryId: category, brand: debouncedBrand, manufacturer: debouncedManufacturer, availability }],
    queryFn: async () => {
      const { data, meta } = await apiMeta<unknown>('/products', {
        params: {
          page,
          limit: 24,
          search: debouncedSearch || undefined,
          categoryId: category || undefined,
          brand: debouncedBrand || undefined,
          manufacturer: debouncedManufacturer || undefined,
          availability: availability || undefined,
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

  const rows = products.data?.rows ?? [];
  const total = products.data?.total ?? rows.length;

  const addToOrder = (product: Product) => {
    const stock = productStock(product);
    if (stock !== undefined && stock <= 0) {
      showToast('error', 'Product is not available', 'Ask the agency team about a restock or an alternative product.');
      return;
    }
    const current = getOrderDraft();
    const existing = current?.items.find((item) => item.productId === product.id);
    const items = existing
      ? (current?.items ?? []).map((item) => (item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item))
      : [...(current?.items ?? []), { productId: product.id, quantity: 1 }];
    saveOrderDraft({ items, customerId: current?.customerId, notes: current?.notes, sourceOrderId: current?.sourceOrderId });
    showToast('success', 'Added to order draft', `${product.name} - quantity ${(existing?.quantity ?? 0) + 1}`);
  };

  return (
    <>
      <PageHeader
        eyebrow="Procurement"
        title="Product catalog"
        description="Search the products your account is authorised to order. Availability and business price come from the live catalog service."
        actions={
          <Link to="/customer/create-order">
            <Button>
              <PackagePlus className="h-4 w-4" /> Open order builder
            </Button>
          </Link>
        }
      />

      <Card className="mb-5 p-4">
        <div className="grid gap-3 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
            <TextInput
              aria-label="Search product catalog"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Name, generic, brand or code"
              className="pl-10"
            />
          </div>
          <TextInput
            aria-label="Filter by brand"
            value={brand}
            onChange={(event) => {
              setBrand(event.target.value);
              setPage(1);
            }}
            placeholder="Brand"
          />
          <TextInput
            aria-label="Filter by manufacturer"
            value={manufacturer}
            onChange={(event) => {
              setManufacturer(event.target.value);
              setPage(1);
            }}
            placeholder="Manufacturer"
          />
          <SelectInput
            aria-label="Filter by availability"
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
        </div>
        <SelectInput
          aria-label="Filter category"
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(1);
          }}
          className="mt-3 sm:max-w-sm"
        >
          <option value="">All categories</option>
          {(categories.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectInput>
      </Card>

      {products.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-64" />
          ))}
        </div>
      ) : products.error ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No products match these filters"
          description="Try a different name, brand, manufacturer or availability filter."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setCategory('');
                setBrand('');
                setManufacturer('');
                setAvailability('');
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((product) => {
              const stock = productStock(product);
              const state = productAvailability(product);
              return (
                <article key={product.id} className="flex h-full min-h-64 flex-col overflow-hidden rounded-lg border border-line bg-white">
                  {product.imageUrl && (
                    <div className="grid h-32 place-items-center border-b border-line/70 bg-ivory">
                      <img
                        src={product.imageUrl}
                        alt=""
                        className="h-full w-full object-contain p-3"
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-4">
                    <div className="min-h-[102px]">
                      <p className="text-[10px] font-medium uppercase tracking-[.14em] text-muted">
                        {[product.brand, product.manufacturer, product.category?.name].filter(Boolean)[0] ?? 'Medical product'}
                      </p>
                      <h2 className="mt-1.5 line-clamp-2 text-[14px] font-semibold leading-6 text-charcoal">{product.name}</h2>
                      {product.genericName && <p className="mt-1 text-xs text-muted">Generic: {product.genericName}</p>}
                      <p className="mt-1 text-[11px] text-navy-400">{product.sku}</p>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-line/70 pt-3 text-xs">
                      <div>
                        <dt className="text-[10px] uppercase tracking-[.1em] text-muted">Pack size</dt>
                        <dd className="mt-1 font-medium text-charcoal">{product.packSize || product.unit}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-[.1em] text-muted">Available</dt>
                        <dd className="mt-1 font-medium text-charcoal">
                          {stock === undefined ? '—' : formatNumber(stock)}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[.1em] text-muted">Business price</p>
                        <p className="mt-0.5 text-[15px] font-semibold text-charcoal">{formatCurrency(product.price)}</p>
                        {product.mrp !== undefined && product.mrp > 0 && (
                          <p className="text-[10px] text-muted">MRP {formatCurrency(product.mrp)}</p>
                        )}
                      </div>
                      {state && <Badge value={state} />}
                    </div>
                    <Button
                      className="mt-4 w-full"
                      size="sm"
                      disabled={stock !== undefined && stock <= 0}
                      onClick={() => addToOrder(product)}
                    >
                      <PackagePlus className="h-4 w-4" /> Add to order
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
          <Pagination page={page} limit={24} total={total} onPageChange={setPage} />
        </>
      )}

      <p className="mt-5 flex items-center gap-2 text-xs text-muted">
        <Users className="h-4 w-4" />
        Availability is resolved from live inventory. Stock thresholds are not exposed to customer accounts.
      </p>
    </>
  );
}
