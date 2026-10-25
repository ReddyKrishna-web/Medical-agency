import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastKind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: ToastKind; title: string; message?: string; }
interface ToastContextValue { showToast: (kind: ToastKind, title: string, message?: string) => void; }
const ToastContext = createContext<ToastContextValue | null>(null);
const icons = { success: CheckCircle2, error: XCircle, info: Info };
const styles = { success: 'border-brand-200 bg-sage text-brand-900', error: 'border-red-200 bg-red-50 text-red-900', info: 'border-brand-200 bg-brand-50 text-brand-900' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((item) => item.id !== id)), []);
  const showToast = useCallback((kind: ToastKind, title: string, message?: string) => {
    const id = Date.now() + Math.random(); setToasts((list) => [...list, { id, kind, title, message }]);
    window.setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);
  const value = useMemo(() => ({ showToast }), [showToast]);
  return <ToastContext.Provider value={value}>{children}<div aria-live="polite" className="fixed inset-x-4 top-4 z-[100] flex flex-col items-end gap-2 sm:left-auto sm:w-96">{toasts.map((toast) => { const Icon = icons[toast.kind]; return <div key={toast.id} role="status" className={cn('flex w-full items-start gap-3 rounded-lg border p-4 shadow-panel', styles[toast.kind])}><Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /><div className="min-w-0 flex-1"><p className="font-semibold">{toast.title}</p>{toast.message && <p className="mt-0.5 text-sm opacity-80">{toast.message}</p>}</div><button onClick={() => dismiss(toast.id)} aria-label="Dismiss notification" className="rounded p-0.5 opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button></div>; })}</div></ToastContext.Provider>;
}
export function useToast() { const value = useContext(ToastContext); if (!value) throw new Error('useToast must be used within ToastProvider'); return value; }
