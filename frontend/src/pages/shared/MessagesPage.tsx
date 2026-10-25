import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, MessageCircle, MessagesSquare, Search, Send } from 'lucide-react';
import { api, apiMeta, apiSend } from '@/lib/api';
import { mapConversations, mapDirectory, mapMessage, mapMessages } from '@/lib/adapters';
import { buildMarkMessagesReadPayload, buildSendMessagePayload } from '@/lib/payloads';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { errorMessage, formatDate, initials, timeAgo } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, SelectInput, TextInput, Textarea } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import type { Conversation, DirectoryContact, Message } from '@/types/api';

export default function MessagesPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'customer';
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [selected, setSelected] = useState(params.get('with') || '');
  const [search, setSearch] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [receiver, setReceiver] = useState('');
  const [body, setBody] = useState('');
  const [orderReference, setOrderReference] = useState('');

  // `/messages/conversations` → `{ partner, conversationKey, lastMessageAt, lastBody, unreadCount }`.
  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => mapConversations(await api<unknown>('/messages/conversations')),
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => {
    const list = conversations.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter((conversation) =>
      `${conversation.partner.name} ${conversation.partner.email ?? ''} ${conversation.lastBody}`.toLowerCase().includes(term),
    );
  }, [conversations.data, search]);

  useEffect(() => {
    if (!selected && rows.length) setSelected(rows[0].partner.id);
  }, [rows, selected]);

  const messages = useQuery({
    queryKey: ['messages', selected],
    queryFn: async () => {
      const { data } = await apiMeta<unknown>('/messages', { params: { conversationWith: selected, limit: 100 } });
      return mapMessages(data);
    },
    enabled: Boolean(selected),
  });

  // `GET /staff/options` is the directory a CUSTOMER may message.
  const recipients = useQuery<DirectoryContact[]>({
    queryKey: ['message-recipients', role],
    queryFn: async () => mapDirectory((await apiMeta<unknown>('/staff/options', { params: { limit: 100 } })).data),
    enabled: composeOpen && role === 'customer',
    retry: false,
  });

  const markRead = useMutation({
    mutationFn: (partnerId: string) => apiSend('post', '/messages/read', buildMarkMessagesReadPayload(partnerId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  useEffect(() => {
    if (!selected || !messages.data) return;
    const timer = window.setTimeout(() => markRead.mutate(selected), 400);
    return () => window.clearTimeout(timer);
  }, [selected, messages.data, markRead]);

  const send = useMutation({
    mutationFn: (target: string) =>
      apiSend<unknown>(
        'post',
        '/messages',
        buildSendMessagePayload({ receiverId: target, body, orderReference: orderReference || undefined }),
      ),
    onSuccess: (raw) => {
      const message = mapMessage(raw);
      setBody('');
      setOrderReference('');
      setComposeOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      showToast('success', 'Message sent', message.body.slice(0, 80));
    },
    onError: (error) => showToast('error', 'Message not sent', errorMessage(error)),
  });

  const messageRows = messages.data ?? [];
  const emptyWorkspace = !conversations.isLoading && !conversations.error && !rows.length && !search.trim();
  const active: Conversation | undefined = rows.find((conversation) => conversation.partner.id === selected);
  const activeName = active?.partner.name ?? (selected ? 'Conversation' : 'Select a conversation');

  const submitMessage = () => {
    if (!body.trim()) return;
    if (!selected) {
      setComposeOpen(true);
      return;
    }
    send.mutate(selected);
  };

  return (
    <>
      <PageHeader
        eyebrow="Communication"
        title="Messages"
        description="Direct, account-scoped conversations. Messages are persisted by the service before realtime delivery."
        actions={
          <Button onClick={() => setComposeOpen(true)}>
            <MessageCircle className="h-4 w-4" /> New message
          </Button>
        }
      />

      <div
        className={
          emptyWorkspace
            ? 'flex min-h-[620px] items-center justify-center overflow-hidden rounded-lg border border-line bg-white'
            : 'grid min-h-[620px] overflow-hidden rounded-lg border border-line bg-white lg:grid-cols-[340px_minmax(0,1fr)]'
        }
      >
        {emptyWorkspace ? (
          <EmptyState
            icon={MessagesSquare}
            title="No conversations yet"
            description="Messages are scoped to your account. Start a conversation with an authorised account contact."
            action={
              <Button onClick={() => setComposeOpen(true)}>
                <MessageCircle className="h-4 w-4" /> New message
              </Button>
            }
          />
        ) : (
          <>
        <aside className={selected ? 'hidden border-r border-line lg:block' : 'block'}>
          <div className="border-b border-line p-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted" />
              <TextInput
                aria-label="Search conversations"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or last message"
                className="pl-9"
              />
            </div>
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            {conversations.isLoading ? (
              <div className="p-4">
                <LoadingState rows={5} />
              </div>
            ) : conversations.error ? (
              <ErrorState error={conversations.error} onRetry={() => void conversations.refetch()} />
            ) : rows.length ? (
              <ul className="divide-y divide-line/70">
                {rows.map((conversation) => {
                  const id = conversation.partner.id;
                  const isActive = selected === id;
                  return (
                    <li key={id}>
                      <button
                        onClick={() => {
                          setSelected(id);
                          setParams({ with: id });
                        }}
                        className={`flex w-full gap-3 p-4 text-left transition-colors hover:bg-ivory ${
                          isActive ? 'bg-sage/40' : ''
                        }`}
                      >
                        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md bg-sage text-xs font-semibold text-brand-800">
                          {conversation.partner.avatarUrl ? (
                            <img
                              src={conversation.partner.avatarUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              onError={(event) => {
                                event.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            initials(conversation.partner.name || conversation.partner.email)
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium text-charcoal">
                              {conversation.partner.name || conversation.partner.email}
                            </span>
                            <span className="shrink-0 text-[10px] text-muted">
                              {timeAgo(conversation.lastMessageAt)}
                            </span>
                          </span>
                          <span className="mt-1 block truncate text-xs text-muted">
                            {conversation.lastBody || 'Start a conversation'}
                          </span>
                        </span>
                        {conversation.unreadCount > 0 && (
                          <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-md bg-brand-700 px-1 text-[10px] font-medium text-white">
                            {conversation.unreadCount}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon={MessagesSquare}
                title="No conversations"
                description="Start a message with an authorised account contact."
                action={
                  <Button size="sm" onClick={() => setComposeOpen(true)}>
                    New message
                  </Button>
                }
              />
            )}
          </div>
        </aside>

        <section className={selected ? 'flex min-h-[620px] flex-col' : 'hidden lg:flex'}>
          {!active ? (
            <div className="m-auto max-w-xs px-6 py-16 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-md bg-ivory text-muted">
                <MessagesSquare className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="mt-4 text-[15px] font-semibold text-charcoal">Select a conversation</h2>
              <p className="mt-1.5 text-[13px] leading-6 text-muted">
                Choose an account contact from the list, or start a new message.
              </p>
              <Button className="mt-5" size="sm" variant="outline" onClick={() => setComposeOpen(true)}>
                <MessageCircle className="h-4 w-4" /> New message
              </Button>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-line p-4">
                <button
                  onClick={() => {
                    setSelected('');
                    setParams({});
                  }}
                  className="rounded-md px-2 py-1 text-[13px] font-medium text-brand-700 lg:hidden"
                >
                  Back
                </button>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-sage text-xs font-semibold text-brand-800">
                  {initials(activeName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-charcoal">{activeName}</p>
                  <p className="text-xs capitalize text-muted">{active?.partner.role ?? 'Account conversation'}</p>
                </div>
                {active.unreadCount > 0 && <Badge tone="red">{active.unreadCount} new</Badge>}
              </header>

              <div className="flex-1 space-y-4 overflow-y-auto bg-ivory/60 p-4 sm:p-6">
                {messages.isLoading ? (
                  <LoadingState rows={5} />
                ) : messages.error ? (
                  <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
                ) : messageRows.length ? (
                  messageRows.map((message: Message) => {
                    const mine = message.senderId === user?.id;
                    return (
                      <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[82%] rounded-lg px-4 py-3 sm:max-w-[70%] ${
                            mine
                              ? 'bg-brand-700 text-white'
                              : 'border border-line bg-white text-charcoal'
                          }`}
                        >
                          {message.orderReference && (
                            <p
                              className={`mb-1 text-[10px] font-medium uppercase tracking-[.12em] ${
                                mine ? 'text-brand-100' : 'text-brand-700'
                              }`}
                            >
                              {message.orderReference}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                          <p
                            className={`mt-1.5 flex items-center justify-end gap-1 text-[10px] ${
                              mine ? 'text-brand-100' : 'text-muted'
                            }`}
                          >
                            {formatDate(message.createdAt, 'HH:mm')}
                            {mine && <CheckCheck className="h-3 w-3" />}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState
                    icon={MessageCircle}
                    title="No messages yet"
                    description="Send the first message in this conversation."
                  />
                )}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  submitMessage();
                }}
                className="border-t border-line bg-white p-3"
              >
                <div className="flex items-end gap-2">
                  <Textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Write a message"
                    aria-label="Message"
                    maxLength={4000}
                    rows={2}
                    className="min-h-0 flex-1"
                  />
                  <Button type="submit" size="icon" loading={send.isPending} disabled={!body.trim()} aria-label="Send message">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-2 px-1 text-[10px] text-muted">
                  Do not include patient-identifiable or sensitive clinical information.
                </p>
              </form>
            </>
          )}
        </section>
          </>
        )}
      </div>

      <Modal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="Start a conversation"
        description="Only contacts available to your account are shown."
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            const target = selected || receiver;
            if (!target || !body.trim()) return;
            send.mutate(target);
          }}
        >
          <Field id="receiver" label="Recipient" required>
            <SelectInput
              id="receiver"
              value={selected || receiver}
              onChange={(event) => setReceiver(event.target.value)}
              disabled={Boolean(selected)}
            >
              <option value="">Choose a recipient</option>
              {(recipients.data ?? []).map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                  {contact.email ? ` - ${contact.email}` : ''}
                </option>
              ))}
            </SelectInput>
          </Field>

          {role === 'customer' && recipients.isLoading && <LoadingState rows={2} />}
          {role === 'customer' && recipients.isError && (
            <p className="text-sm text-amber-700">
              The service did not return a staff directory for this account. Start from an existing conversation instead.
            </p>
          )}

          <Field id="compose-body" label="Message" required>
            <Textarea
              id="compose-body"
              rows={5}
              maxLength={4000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>
          <Field id="order-reference" label="Order reference" hint="Optional">
            <TextInput
              id="order-reference"
              value={orderReference}
              onChange={(event) => setOrderReference(event.target.value)}
              placeholder="e.g. order number"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setComposeOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={send.isPending} disabled={!(selected || receiver) || !body.trim()}>
              <Send className="h-4 w-4" /> Send message
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
