import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, Bot, CheckCircle2, Send, Sparkles } from 'lucide-react';
import { api, apiSend } from '@/lib/api';
import { buildAiAskPayload } from '@/lib/payloads';
import { useToast } from '@/contexts/ToastContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { errorMessage, formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Form';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import type { AiAnswer, AiStatus } from '@/types/api';

interface HistoryEntry {
  question: string;
  answer: string;
  at: string;
  model?: string;
}

export default function AIAssistantPage() {
  useDocumentTitle('AI assistant');
  const { showToast } = useToast();
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const status = useQuery({ queryKey: ['ai', 'status'], queryFn: () => api<AiStatus>('/ai/status') });

  const ask = useMutation({
    mutationFn: () => apiSend<AiAnswer>('post', '/ai/ask', buildAiAskPayload(question)),
    onSuccess: (result) => {
      setHistory((list) => [
        ...list,
        { question: result.question || question, answer: result.answer, at: result.generatedAt, model: result.model },
      ]);
      setQuestion('');
      showToast('success', 'Answer received');
    },
    onError: (error) => showToast('error', 'Question not answered', errorMessage(error)),
  });

  const configured = status.data?.configured === true;
  const enabledForAgency = status.data?.enabledForAgency !== false;

  return (
    <>
      <PageHeader
        eyebrow="Service intelligence"
        title="AI assistant"
        description="Ask natural-language questions about the reporting data this agency is authorised to expose."
      />

      <Card className="mb-6">
        <CardHeader
          title="Configuration state"
          action={
            status.isLoading ? (
              <span className="text-xs text-muted">Checking...</span>
            ) : configured ? (
              <Badge value="CONFIGURED" tone="green" />
            ) : (
              <Badge value="NOT_CONFIGURED" tone="amber" />
            )
          }
        />
        <CardBody>
          {status.isLoading ? (
            <LoadingState rows={1} />
          ) : status.error ? (
            <ErrorState error={status.error} onRetry={() => void status.refetch()} />
          ) : (
            <div className="flex items-start gap-3">
              {configured ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
              ) : (
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              )}
              <div>
                <p className="text-[13.5px] font-medium text-charcoal">
                  {configured ? 'The AI reporting service is configured.' : 'The AI reporting service is not configured.'}
                </p>
                <p className="mt-1 text-[13px] leading-6 text-navy-700">
                  {status.data?.reason ||
                    (configured
                      ? 'Questions are sent to the configured provider with only the aggregates your role may read.'
                      : 'No simulated or fallback answers are generated. An administrator must configure the backend integration first.')}
                </p>
                {!enabledForAgency && (
                  <p className="mt-2 text-sm font-semibold text-red-700">Business AI is disabled for this agency.</p>
                )}
                {status.data?.model && <p className="mt-2 text-xs text-muted">Configured model: {status.data.model}</p>}
                {status.data?.disclaimer && (
                  <p className="mt-3 rounded-md bg-ivory p-3 text-xs leading-5 text-muted">{status.data.disclaimer}</p>
                )}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader title="Ask a question" description="Examples: order volume this month, top products, low-stock exposure." />
          <CardBody>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!question.trim()) return;
                ask.mutate();
              }}
            >
              <Field id="ai-question" label="Your question" required>
                <Textarea
                  id="ai-question"
                  rows={5}
                  maxLength={1000}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="What would you like to know about this agency's reporting data?"
                />
              </Field>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted">Do not include patient or sensitive clinical information.</p>
                <Button type="submit" loading={ask.isPending} disabled={!configured || !enabledForAgency || !question.trim()}>
                  <Send className="h-4 w-4" /> Ask service
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Session answers" description="Answers persist only in this browser tab." />
          <CardBody className="space-y-4">
            {history.length ? (
              history.map((item, index) => (
                <div key={index} className="rounded-lg border border-line p-4">
                  <div className="flex gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                    <p className="text-[13.5px] font-medium text-charcoal">{item.question}</p>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-navy-700">{item.answer}</p>
                  <p className="mt-3 text-[10px] text-muted">
                    {item.model ? `${item.model} - ` : ''}
                    {formatDate(item.at, 'dd MMM yyyy, HH:mm')}
                  </p>
                </div>
              ))
            ) : (
              <div className="py-8 text-center">
                <Bot className="mx-auto h-7 w-7 text-navy-300" />
                <p className="mt-3 text-[13px] font-medium text-navy-700">No questions asked yet</p>
                <p className="mt-1 text-xs text-muted">Responses from the configured service will appear here.</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
