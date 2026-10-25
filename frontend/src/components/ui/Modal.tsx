import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = old;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          'max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-lift sm:rounded-xl',
          {
            'sm:max-w-md': size === 'sm',
            'sm:max-w-xl': size === 'md',
            'sm:max-w-3xl': size === 'lg',
            'sm:max-w-5xl': size === 'xl',
          },
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-white px-5 py-4">
          <div>
            <h2 id="modal-title" className="text-[17px] font-semibold text-charcoal">
              {title}
            </h2>
            {description && <p className="mt-1 text-[13px] leading-5 text-muted">{description}</p>}
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-parchment hover:text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-azure-300"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && (
          <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-line bg-ivory px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  danger,
  loading,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-parchment hover:text-charcoal"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-60',
              danger ? 'bg-red-700 hover:bg-red-800' : 'bg-forest hover:bg-brand-800',
            )}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      {children ?? (
        <p className="text-sm leading-6 text-muted">
          This action is recorded by the service and may not be reversible.
        </p>
      )}
    </Modal>
  );
}
