import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Edit3, Package, Plus, Search, Trash2 } from 'lucide-react';
import { apiMeta, apiSend } from '@/lib/api';
import { mapCategories, mapCategory, mapProducts } from '@/lib/adapters';
import { buildCategoryPayload, type CategoryFormValues } from '@/lib/payloads';
import { useToast } from '@/contexts/ToastContext';
import { useDebounce } from '@/hooks/useDebounce';
import { errorMessage, formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox, Field, SelectInput, TextInput, Textarea } from '@/components/ui/Form';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/States';
import type { Category } from '@/types/api';

const emptyForm: CategoryFormValues = {
  name: '',
  description: '',
  parentId: '',
  displayOrder: '',
  imageUrl: '',
  isActive: true,
};

export default function CategoriesPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [toggling, setToggling] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryFormValues>(emptyForm);
  const debounced = useDebounce(search);

  const query = useQuery({
    queryKey: ['categories', { page, search: debounced }],
    queryFn: async () => {
      const { data, meta } = await apiMeta<unknown>('/categories', { params: { page, limit: 200, search: debounced || undefined } });
      return { rows: mapCategories(data), total: Number(meta.total ?? 0) };
    },
    placeholderData: (previous) => previous,
  });

  const allCategories = useQuery({
    queryKey: ['categories', 'options'],
    queryFn: async () => mapCategories((await apiMeta<unknown>('/categories', { params: { limit: 200 } })).data),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!editing) return;
    setForm({
      name: editing.name,
      description: editing.description ?? '',
      parentId: editing.parentId ?? '',
      displayOrder: String(editing.displayOrder ?? 0),
      imageUrl: editing.imageUrl ?? '',
      isActive: editing.isActive,
    });
  }, [editing]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['categories'] });
    void queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const body = buildCategoryPayload(form);
      return editing
        ? apiSend<unknown>('patch', `/categories/${editing.id}`, body)
        : apiSend<unknown>('post', '/categories', body);
    },
    onSuccess: (raw) => {
      const saved = mapCategory(raw);
      invalidate();
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      showToast('success', editing ? 'Category updated' : 'Category created', saved.name);
    },
    onError: (error) => showToast('error', 'Category not saved', errorMessage(error)),
  });

  // The backend exposes no delete route; deactivation is the supported lifecycle.
  const toggle = useMutation({
    mutationFn: () =>
      apiSend<unknown>('patch', `/categories/${toggling?.id}`, { isActive: !toggling?.isActive }),
    onSuccess: () => {
      invalidate();
      showToast('success', toggling?.isActive ? 'Category deactivated' : 'Category activated');
      setToggling(null);
    },
    onError: (error) => {
      showToast('error', 'Category not updated', errorMessage(error));
      setToggling(null);
    },
  });

  const rows = query.data?.rows ?? [];
  const parentOptions = useMemo(
    () => (allCategories.data ?? []).filter((item) => item.id !== editing?.id),
    [allCategories.data, editing?.id],
  );

  const columns: Column<Category>[] = [
    {
      key: 'name',
      header: 'Category',
      render: (item) => (
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <Boxes className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[13.5px] font-medium text-charcoal">{item.name}</p>
            <p className="text-xs text-muted">/{item.slug}</p>
          </div>
        </div>
      ),
    },
    { key: 'parent', header: 'Parent', render: (item) => (item.parentId ? 'Sub-category' : 'Top level'), mobileLabel: false },
    { key: 'order', header: 'Display order', render: (item) => String(item.displayOrder), mobileLabel: false },
    { key: 'created', header: 'Created', render: (item) => formatDate(item.createdAt), mobileLabel: false },
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
          <button
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-navy-700"
            onClick={(event) => {
              event.stopPropagation();
              setToggling(item);
            }}
          >
            <Trash2 className="h-4 w-4" /> {item.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      ),
      mobileLabel: false,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Catalog management"
        title="Categories"
        description="Create and maintain the category tree that products are filed under."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setForm(emptyForm);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New category
          </Button>
        }
      />

      <Card className="mb-5 p-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-muted" />
          <TextInput
            aria-label="Search categories"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by category name"
            className="pl-10"
          />
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
          emptyTitle="No categories"
          emptyDescription="Create the first category to start organising the catalog."
          emptyAction={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setForm(emptyForm);
                setOpen(true);
              }}
            >
              <Package className="h-4 w-4" /> New category
            </Button>
          }
        />
      </Card>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        title={editing ? 'Edit category' : 'New category'}
        description="The service owns the slug and unique index."
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
            <Button loading={save.isPending} disabled={form.name.trim().length < 2} onClick={() => save.mutate()}>
              {editing ? 'Save changes' : 'Create category'}
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
          <Field id="category-name" label="Name" required>
            <TextInput
              id="category-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="e.g. Surgical consumables"
            />
          </Field>
          <Field id="category-description" label="Description" hint="Optional">
            <Textarea
              id="category-description"
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="category-parent" label="Parent category" hint="Optional">
              <SelectInput
                id="category-parent"
                value={form.parentId}
                onChange={(event) => setForm({ ...form, parentId: event.target.value })}
              >
                <option value="">Top level</option>
                {parentOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field id="category-order" label="Display order" hint="Lower numbers appear first">
              <TextInput
                id="category-order"
                type="number"
                min="0"
                value={form.displayOrder}
                onChange={(event) => setForm({ ...form, displayOrder: event.target.value })}
              />
            </Field>
          </div>
          <Field id="category-image" label="Image URL" hint="Optional HTTPS URL. There is no category upload endpoint.">
            <TextInput
              id="category-image"
              type="url"
              value={form.imageUrl}
              onChange={(event) => setForm({ ...form, imageUrl: event.target.value })}
              placeholder="https://"
            />
          </Field>
          <Checkbox
            label="Active"
            description="Inactive categories are hidden from the customer catalog."
            checked={form.isActive}
            onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toggling)}
        onClose={() => setToggling(null)}
        onConfirm={() => toggle.mutate()}
        loading={toggle.isPending}
        title={toggling?.isActive ? 'Deactivate this category?' : 'Activate this category?'}
        description={
          toggling?.isActive
            ? 'Products in this category stay in the catalog but the category is hidden from customer filters.'
            : 'The category becomes selectable in the customer catalog again.'
        }
        confirmLabel={toggling?.isActive ? 'Deactivate' : 'Activate'}
        danger={toggling?.isActive}
      />
    </>
  );
}
