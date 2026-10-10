import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { getAccessToken } from '@/lib/api';
import { useAuth } from './AuthContext';
import type { AppNotification, Message, Order } from '@/types/api';

type SocketState = 'unconfigured' | 'connecting' | 'connected' | 'reconnecting' | 'offline';
interface SocketContextValue {
  state: SocketState;
}
const SocketContext = createContext<SocketState>('offline' as SocketState);

function updateList<T extends { id?: string; _id?: string }>(queryClient: QueryClient, key: readonly unknown[], item: T) {
  queryClient.setQueriesData<{ items?: T[]; data?: T[] } | T[]>({ queryKey: key }, (current) => {
    const list = Array.isArray(current) ? current : current?.items || current?.data || [];
    if (!Array.isArray(list)) return current;
    const id = item.id || item._id;
    const exists = list.some((entry) => (entry.id || entry._id) === id);
    return exists ? list.map((entry) => ((entry.id || entry._id) === id ? { ...entry, ...item } : entry)) : [item, ...list];
  });
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isPending } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<SocketState>(getAccessToken() ? 'connecting' : 'offline');
  const socketUrl = import.meta.env.VITE_SOCKET_URL?.trim();

  useEffect(() => {
    if (!socketUrl) {
      setState('unconfigured');
      return;
    }
    if (!isAuthenticated || isPending) {
      setState('offline');
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setState('offline');
      return;
    }
    setState('connecting');
    const socket: Socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
    });
    socket.on('connect', () => setState('connected'));
    socket.io.on('reconnect_attempt', () => setState('reconnecting'));
    socket.on('disconnect', () => setState('offline'));
    socket.on('order.created', ({ order }: { order: Order }) => {
      updateList(queryClient, ['orders'], order);
      void queryClient.invalidateQueries({ queryKey: ['reports', 'dashboard'] });
    });
    socket.on('order.updated', ({ order }: { order: Order }) => {
      updateList(queryClient, ['orders'], order);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['reports', 'dashboard'] });
    });
    socket.on('message.created', ({ message }: { message: Message }) => {
      updateList(queryClient, ['messages'], message);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    socket.on('notification.created', ({ notification }: { notification: AppNotification }) => {
      updateList(queryClient, ['notifications'], notification);
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    socket.on('inventory.alert', () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['reports', 'inventory'] });
    });
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [isAuthenticated, isPending, queryClient, socketUrl]);

  const value = useMemo(() => state, [state]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}
