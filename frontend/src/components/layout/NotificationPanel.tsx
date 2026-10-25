import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, X } from 'lucide-react';
import { apiMeta, apiSend } from '@/lib/api';
import { mapNotifications } from '@/lib/adapters';
import { buildMarkNotificationsReadPayload } from '@/lib/payloads';
import { useToast } from '@/contexts/ToastContext';
import { errorMessage, timeAgo } from '@/lib/utils';
import { humanize, roleWorkspace } from '@/lib/status';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import type { AppNotification } from '@/types/api';

export function NotificationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { role } = useAuth();

  const query = useQuery({
    queryKey: ['notifications', { limit: 20 }],
    queryFn: async () => {
      const { data, meta } = await apiMeta<unknown>('/notifications', { params: { limit: 20 } });
      return { items: mapNotifications(data), unread: Number(meta.unreadCount ?? 0) };
    },
    enabled: open,
  });

  const items = query.data?.items ?? [];

  // The API accepts `notificationIds` or `all: true`; there is no `ids` key.
  const mark = useMutation({
    mutationFn: (all: boolean) =>
      apiSend('post', '/notifications/read', buildMarkNotificationsReadPayload(all ? [] : items.filter((item) => !item.readAt).map((item) => item.id), all)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      showToast('success', 'Notifications marked as read');
    },
    onError: (error) => showToast('error', 'Could not update notifications', errorMessage(error)),
  });

  const openNotification = (item: AppNotification) => {
    const base = roleWorkspace[role ?? 'customer'];
    const entityId = typeof item.entityId === 'object' ? '' : (item.entityId ?? '');
    if (item.entityType === 'Order' && entityId) {
      navigate(`${base}/orders/${entityId}`);
    } else if (item.entityType === 'Invoice' && entityId) {
      navigate(`${base}/invoices/${entityId}`);
    } else if (item.entityType === 'RequirementUpload' && entityId) {
      navigate(`${base}/requirements/${entityId}`);
    } else {
      navigate(`${base}/notifications`);
    }
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <button className="fixed inset-0 z-40 bg-charcoal/25" onClick={onClose} aria-label="Close notifications" />
      <aside aria-label="Notifications" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-line bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-charcoal">Notifications</h2>
            <p className="text-xs text-muted">Live account updates</p>
          </div>
          <button onClick={onClose} className="rounded-md p-2 text-muted transition-colors hover:bg-parchment hover:text-charcoal" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {query.isLoading ? (
            <div className="p-5">
              <LoadingState rows={5} />
            </div>
          ) : query.error ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} className="m-5" />
          ) : items.length ? (
            <ul className="divide-y divide-line/70">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => openNotification(item)}
                    className={`w-full px-5 py-4 text-left transition-colors hover:bg-ivory ${!item.readAt ? 'bg-sage/30' : ''}`}
                  >
                    <div className="flex gap-3">
                      <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-sage text-brand-700">
                        <Bell className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-charcoal">{item.title}</p>
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[.12em] text-muted">
                          {humanize(item.type)}
                        </p>
                        {item.message && <p className="mt-1 text-sm leading-5 text-navy-700">{item.message}</p>}
                        <p className="mt-1.5 text-xs text-muted">{timeAgo(item.createdAt)}</p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Bell} title="You are all caught up" description="New order and account updates will appear here." />
          )}
        </div>

        <div className="border-t border-line p-4">
          <Button variant="outline" className="w-full" disabled={!items.some((item) => !item.readAt)} loading={mark.isPending} onClick={() => mark.mutate(true)}>
            <CheckCheck className="h-4 w-4" /> Mark all as read
          </Button>
        </div>
      </aside>
    </>
  );
}
