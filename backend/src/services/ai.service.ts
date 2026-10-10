import { env } from '../config/env';
import { AppError, ErrorCode } from '../utils/errors';
import { logger } from '../utils/logger';
import { AI_DISCLAIMER } from '../constants/domain';
import { dashboardReport, inventoryReport, ordersReport, type DateRange } from './report.service';
import { round2 } from '../utils/numbers';
import type { AuthContext } from '../types/express';

export interface AiStatus {
  configured: boolean;
  provider: 'openai-compatible' | null;
  model: string | null;
  enabledForAgency: boolean;
  reason: string | null;
  requirementExtraction: {
    configured: boolean;
    deterministicCsv: true;
    humanConfirmationRequired: true;
    canCreateOrders: false;
    minConfidence: number;
    supportedFiles: string[];
  };
  disclaimer: string;
}

export const aiStatus = async (auth: AuthContext): Promise<AiStatus> => {
  const { AgencyModel } = await import('../models/agency.model');
  const agency = await AgencyModel.findById(auth.agencyId)
    .select('features')
    .lean<{ features: { aiEnabled: boolean } }>();

  const enabledForAgency = agency?.features?.aiEnabled !== false;
  const hasKey = Boolean(env.AI_API_KEY);

  const { requirementExtractionStatus } = await import('./requirement-extraction.service');
  return {
    configured: hasKey,
    provider: hasKey ? 'openai-compatible' : null,
    model: hasKey ? env.AI_MODEL : null,
    enabledForAgency,
    reason: hasKey
      ? null
      : 'AI_API_KEY is not configured. The server will not fabricate answers; configure a provider to enable business AI.',
    requirementExtraction: await requirementExtractionStatus(auth.agencyId),
    disclaimer: AI_DISCLAIMER
  };
};

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

const callProvider = async (messages: ChatMessage[]): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.AI_API_BASE_URL.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.AI_API_KEY}`
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        temperature: 0,
        messages
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      logger.warn('AI provider returned an error', { status: response.status, body: text.slice(0, 400) });
      throw new AppError(
        502,
        ErrorCode.AI_PROVIDER_ERROR,
        'The configured AI provider could not answer this request'
      );
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new AppError(502, ErrorCode.AI_PROVIDER_ERROR, 'The AI provider returned an empty response');
    }
    return content;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('AI provider request failed', { error });
    throw new AppError(502, ErrorCode.AI_PROVIDER_ERROR, 'The configured AI provider could not be reached');
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Build the *only* data the model is allowed to reason over: aggregates already
 * filtered to the caller's authorised tenant scope. No free-form customer data,
 * no credentials, no other tenant rows.
 */
const buildAuthorizedContext = async (auth: AuthContext, range: DateRange) => {
  const [dashboard, orders, inventory] = await Promise.all([
    dashboardReport(auth, range),
    ordersReport(auth, range),
    inventoryReport(auth)
  ]);

  return {
    role: auth.role,
    scope: 'Only the following aggregates, already limited to what the requesting user may see.',
    window: { from: range.from, to: range.to },
    dashboard,
    dailyOrders: orders.daily,
    topOrders: orders.orders.slice(0, 10),
    inventory: {
      totals: inventory.totals,
      thresholds: inventory.thresholds,
      attention: inventory.items
        .filter((item) => item.status !== 'OK')
        .slice(0, 25)
        .map((item) => ({
          product: item.productName,
          sku: item.sku,
          batch: item.batchNumber,
          expiry: item.expiryDate,
          available: item.quantityAvailable,
          status: item.status
        }))
    }
  };
};

export interface AiAnswer {
  question: string;
  answer: string;
  model: string;
  generatedAt: string;
  dataWindow: { from: Date; to: Date };
  /** The exact aggregates that were sent to the provider. */
  authorizedContext: unknown;
  disclaimer: string;
}

export const askAi = async (auth: AuthContext, question: string, range: DateRange): Promise<AiAnswer> => {
  const status = await aiStatus(auth);

  if (!status.configured) {
    // Explicit refusal. The server never invents an answer.
    throw new AppError(503, ErrorCode.AI_NOT_CONFIGURED, status.reason ?? 'Business AI is not configured');
  }
  if (!status.enabledForAgency) {
    throw new AppError(403, ErrorCode.AI_SCOPE_REFUSED, 'Business AI is disabled for this agency');
  }

  const context = await buildAuthorizedContext(auth, range);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: [
        'You are the read-only reporting assistant for a medical distribution agency.',
        'Answer only from the JSON context provided. Never invent numbers.',
        'If the context does not contain the answer, say exactly what data is missing.',
        `Role of the requester: ${auth.role}. Do not reveal data outside their authorised scope.`,
        'This is a business distribution system: never give clinical, diagnostic or treatment advice.',
        'You cannot create, modify or submit orders.'
      ].join(' ')
    },
    {
      role: 'user',
      content: `Authorised data context:\n${JSON.stringify(context, null, 2)}\n\nQuestion: ${question}`
    }
  ];

  const answer = await callProvider(messages);

  return {
    question,
    answer,
    model: env.AI_MODEL,
    generatedAt: new Date().toISOString(),
    dataWindow: range,
    authorizedContext: context,
    disclaimer: AI_DISCLAIMER
  };
};

export const buildSafeSummary = async (auth: AuthContext, range: DateRange) => {
  const dashboard = await dashboardReport(auth, range);
  return {
    generatedAt: new Date().toISOString(),
    revenue: round2(dashboard.orders.revenue),
    openOrders: dashboard.orders.open,
    outstanding: dashboard.finance.outstandingAmount
  };
};
