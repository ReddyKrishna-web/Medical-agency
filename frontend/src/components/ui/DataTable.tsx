import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState, LoadingState } from './States';

export interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  className?: string;
  mobileLabel?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows?: T[];
  getKey: (item: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (item: T) => void;
  footer?: ReactNode;
  minWidth?: string;
}

export function DataTable<T>({
  columns,
  rows = [],
  getKey,
  loading,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyAction,
  onRowClick,
  footer,
  minWidth = '720px',
}: DataTableProps<T>) {
  if (loading)
    return (
      <div className="p-5">
        <LoadingState />
      </div>
    );
  if (error) return <ErrorState error={error} onRetry={onRetry} className="m-5" />;
  if (!rows.length)
    return (
      <EmptyState
        title={emptyTitle || 'No records found'}
        description={emptyDescription || 'Records will appear here when they are available.'}
        action={emptyAction}
      />
    );

  return (
    <div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left" style={{ minWidth }}>
          <thead className="border-b border-line bg-ivory/70">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap px-5 py-2.5 text-[11px] font-medium uppercase tracking-[.1em] text-muted',
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {rows.map((row) => (
              <tr
                key={getKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter') onRowClick(row);
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                className={cn(
                  'bg-white transition-colors',
                  onRowClick &&
                    'cursor-pointer hover:bg-ivory/80 focus:bg-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-azure-300',
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn('px-5 py-3.5 text-sm text-charcoal', column.className)}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-line/70 md:hidden">
        {rows.map((row) => (
          <button
            key={getKey(row)}
            onClick={() => onRowClick?.(row)}
            disabled={!onRowClick}
            className="flex w-full items-center gap-3 p-4 text-left transition-colors disabled:cursor-default hover:bg-ivory/70"
          >
            <div className="min-w-0 flex-1">
              {columns
                .filter((column) => column.mobileLabel !== false)
                .slice(0, 3)
                .map((column) => (
                  <div key={column.key} className="mb-2 last:mb-0">
                    <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-[.1em] text-muted">
                      {column.header}
                    </span>
                    <div className="text-sm text-charcoal">{column.render(row)}</div>
                  </div>
                ))}
            </div>
            {onRowClick && <ChevronRight className="h-4 w-4 shrink-0 text-navy-400" />}
          </button>
        ))}
      </div>

      {footer}
    </div>
  );
}
