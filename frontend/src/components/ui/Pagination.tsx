import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
export function Pagination({ page, limit, total, onPageChange }: { page: number; limit: number; total: number; onPageChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil((total || 0) / Math.max(1, limit)));
  if (total <= limit) return null;
  const from = (page - 1) * limit + 1; const to = Math.min(page * limit, total);
  return <nav aria-label="Pagination" className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-600">Showing <span className="font-semibold text-slate-800">{from}–{to}</span> of <span className="font-semibold text-slate-800">{total}</span></p><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /> Previous</Button><span className="px-2 text-sm font-medium text-slate-600">Page {page} of {pages}</span><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Next page">Next <ChevronRight className="h-4 w-4" /></Button></div></nav>;
}
