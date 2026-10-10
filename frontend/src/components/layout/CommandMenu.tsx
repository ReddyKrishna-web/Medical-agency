import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CornerDownLeft, Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { searchApi } from '@/lib/api';
import { mapSearchResults } from '@/lib/adapters';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/contexts/AuthContext';
import { EmptyState, LoadingState } from '@/components/ui/States';
import { formatCurrency, formatDate } from '@/lib/utils';

/** `GET /search` returns grouped hits; each group maps to a real route. */
export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { role } = useAuth();

  const search = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: async () => mapSearchResults(await searchApi.global(debounced.trim(), 10), role),
    enabled: open && debounced.trim().length >= 2,
    staleTime: 15_000,
    retry: false,
  });

  const hits = useMemo(() => search.data?.hits ?? [], [search.data]);

  const submit = (path: string) => {
    navigate(path);
    onClose();
    setQuery('');
  };

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Search Supply Medicals" description="Search records available to your account." size="md">
      <div className="relative">
        <Search className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search orders, customers, products, invoices"
          className="h-12 w-full rounded-xl border border-slate-300 pl-11 pr-4 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
          aria-label="Global search"
        />
      </div>
      <div className="mt-4 min-h-44">
        {debounced.trim().length < 2 ? (
          <EmptyState icon={Search} title="Start typing to search" description="Enter at least two characters. Results respect your account permissions." />
        ) : search.isFetching ? (
          <LoadingState rows={3} />
        ) : search.error ? (
          <p className="py-8 text-center text-sm text-red-600">Search is temporarily unavailable. Please try again.</p>
        ) : hits.length ? (
          <ul className="divide-y divide-slate-100">
            {hits.map((hit) => (
              <li key={`${hit.type}-${hit.id}`}>
                <button
                  onClick={() => submit(hit.path)}
                  className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-xs font-bold uppercase text-slate-600 group-hover:bg-brand-100 group-hover:text-brand-700">
                    {hit.type.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{hit.title}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {hit.subtitle || hit.status || formatDate(hit.date ?? hit.expiryDate)}
                    </span>
                  </span>
                  {hit.value !== undefined && (
                    <span className="shrink-0 text-xs font-semibold text-slate-600">{formatCurrency(hit.value)}</span>
                  )}
                  <CornerDownLeft className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Search} title="No matching records" description="Try a different search term." />
        )}
      </div>
    </Modal>
  );
}
