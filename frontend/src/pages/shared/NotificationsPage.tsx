import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { apiMeta, apiSend } from '@/lib/api';
import { mapNotifications } from '@/lib/adapters';
import { buildMarkNotificationsReadPayload } from '@/lib/payloads';
import { useToast } from '@/contexts/ToastContext';
import { errorMessage, timeAgo } from '@/lib/utils';
import { humanize } from '@/lib/status';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const query = useQuery({
    queryKey: ['notifications', { page, limit: 25 }],
    queryFn: async () => {
      const { data, meta } = await apiMeta<unknown>('/notifications', { params: { page, limit: 25 } });
      return { rows: mapNotifications(data), total: Number(meta.total ?? 0) };
    },
    placeholderData: (previous) => previous,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['notifications'] });

  // `markNotificationsReadSchema` accepts `notificationIds` or `all: true`.
  const mark = useMutation({
    mutationFn: (notificationId: string) =>
      apiSend('post', '/notifications/read', buildMarkNotificationsReadPayload([notificationId])),
    onSuccess: () => {
      invalidate();
      showToast('success', 'Notification marked as read');
    },
    onError: (error) => showToast('error', 'Could not update notification', errorMessage(error)),
  });

  const markAll = useMutation({
    mutationFn: () => apiSend('post', '/notifications/read', buildMarkNotificationsReadPayload([], true)),
    onSuccess: () => {
      invalidate();
      showToast('success', 'All notifications marked as read');
    },
    onError: (error) => showToast('error', 'Could not update notifications', errorMessage(error)),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? rows.length;

  return (
    <>
      <PageHeader
        eyebrow="Account activity"
        title="Notifications"
        description="Important service and order updates for your account."
        actions={
          <Button
            variant="outline"
            onClick={() => markAll.mutate()}
            loading={markAll.isPending}
            disabled={!rows.some((item) => !item.readAt)}
          >
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        }
      />

      <Card className="overflow-hidden">
        {query.isLoading ? (
          <div className="p-5">
            <LoadingState rows={6} />
          </div>
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : rows.length ? (
          <ul className="divide-y divide-line/70">
            {rows.map((item) => (
              <li key={item.id} className={`flex gap-4 p-5 transition-colors hover:bg-ivory ${!item.readAt ? 'bg-brand-50/40' : ''}`}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-sage text-brand-700">
                  <Bell className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-medium text-charcoal">{item.title}</p>
                    <span className="rounded bg-parchment px-2 py-0.5 text-[10px] font-medium uppercase tracking-[.08em] text-muted">
                      {humanize(item.type)}
                    </span>
                    {!item.readAt && <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />}
                  </div>
                  {item.message && <p className="mt-1 text-[13px] leading-6 text-navy-700">{item.message}</p>}
                  <p className="mt-2 text-xs text-muted">{timeAgo(item.createdAt)}</p>
                </div>
                {!item.readAt && (
                  <button onClick={() => mark.mutate(item.id)} className="shrink-0 self-start text-xs font-medium text-navy-700 hover:text-brand-700">
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Bell} title="No notifications" description="You are all caught up. New service updates will appear here." />
        )}
        <Pagination page={page} limit={25} total={total} onPageChange={setPage} />
      </Card>
    </>
  );
}
