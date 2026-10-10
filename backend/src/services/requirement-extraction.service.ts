/**
 * AI/OCR-ready requirement extraction.
 *
 * This service only produces a human-reviewable draft. It never creates or
 * submits an order. CSV requirements are parsed deterministically. Images,
 * PDF and XLSX require an explicitly configured provider; when none is present
 * the API returns AI_NOT_CONFIGURED instead of inventing extracted lines.
 */
import type { Types } from 'mongoose';
import { env } from '../config/env';
import { AgencyModel } from '../models/agency.model';
import { ProductModel, type IProduct } from '../models/product.model';
import {
  RequirementUploadModel,
  type IExtractedRequirementItem,
  type IRequirementUpload
} from '../models/requirement-upload.model';
import { AppError, ErrorCode } from '../utils/errors';
import { logger } from '../utils/logger';
import { getStorage } from './storage';
import { recordActivity } from './activity.service';
import { createNotificationSafe } from './notification.service';
import type { AuthContext } from '../types/express';
import { isAdmin, isSalesman } from '../utils/tenant';
import { requirementScopeFilter } from './requirement.service';

interface RawExtractedLine {
  rawText: string;
  rawQuantity?: number;
  confidence: number;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clampConfidence = (value: unknown, fallback = 0.5): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
};

const providerConfigured = async (agencyId: Types.ObjectId): Promise<boolean> => {
  if (!env.AI_API_KEY) return false;
  const agency = await AgencyModel.findById(agencyId).select('features.aiEnabled').lean<{ features?: { aiEnabled?: boolean } }>();
  return agency?.features?.aiEnabled !== false;
};

export const requirementExtractionStatus = async (agencyId: Types.ObjectId) => ({
  configured: await providerConfigured(agencyId),
  provider: env.AI_API_KEY ? ('openai-compatible' as const) : null,
  model: env.AI_API_KEY ? env.AI_MODEL : null,
  deterministicCsv: true as const,
  minConfidence: env.AI_REQUIREMENT_MIN_CONFIDENCE,
  supportedFiles: ['csv', 'jpg', 'jpeg', 'png', 'pdf', 'xlsx'],
  humanConfirmationRequired: true as const,
  canCreateOrders: false as const
});

const parseCsv = (buffer: Buffer): RawExtractedLine[] => {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 201);
  if (lines.length <= 1) return [];

  const delimiterCandidates = [',', '\t', ';'];
  const delimiter = delimiterCandidates.find((candidate) => (lines[0]?.split(candidate).length ?? 0) > 1) ?? ',';
  const header = lines[0].split(delimiter).map((cell) => cell.trim().toLowerCase());
  const hasHeader = header.some((cell) => /product|item|medicine|drug|name/.test(cell)) &&
    header.some((cell) => /qty|quantity|units?/.test(cell));
  const quantityIndex = hasHeader ? header.findIndex((cell) => /qty|quantity|units?/.test(cell)) : -1;

  return lines.slice(hasHeader ? 1 : 0).map((line, index) => {
    const cells = line.split(delimiter).map((cell) => cell.trim());
    let rawQuantity: number | undefined;
    let descriptionCells: string[];

    if (quantityIndex >= 0) {
      const parsed = Number(cells[quantityIndex]);
      rawQuantity = Number.isFinite(parsed) ? parsed : undefined;
      descriptionCells = cells.filter((_cell, cellIndex) => cellIndex !== quantityIndex);
    } else {
      const quantityCellIndex = cells.findIndex((cell) => /^\d+(\.\d+)?$/.test(cell));
      if (quantityCellIndex >= 0) {
        rawQuantity = Number(cells[quantityCellIndex]);
        descriptionCells = cells.filter((_cell, cellIndex) => cellIndex !== quantityCellIndex);
      } else {
        descriptionCells = cells;
      }
    }

    const rawText = descriptionCells.map((cell) => cell.replace(/^["']|["']$/g, '').trim()).filter(Boolean).join(' ').trim();
    if (!rawText) {
      return { rawText: `Row ${index + 1}`, confidence: 0.2 };
    }
    return { rawText, rawQuantity, confidence: 0.95 };
  }).filter((line) => line.rawText).slice(0, 200);
};

const providerPrompt = [
  'Extract a wholesale medicine and healthcare supply requirement list from the attached business document.',
  'Return JSON only: {"items":[{"description":"product text as written","quantity":123,"confidence":0.0}]}.',
  'Use null for a missing quantity. Do not guess a product identity, brand, pack size or clinical use.',
  'Never include patient data, prescriptions, diagnosis or treatment advice. This is a business order list only.'
].join(' ');

const providerRequest = async (
  file: IRequirementUpload['file'],
  buffer: Buffer
): Promise<RawExtractedLine[]> => {
  if (!env.AI_API_KEY) {
    throw new AppError(503, ErrorCode.AI_NOT_CONFIGURED, 'AI_REQUIREMENT extraction is not configured. CSV files can still be parsed deterministically.');
  }

  const dataUrl = `data:${file.mimeType};base64,${buffer.toString('base64')}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);
  const baseUrl = env.AI_API_BASE_URL.replace(/\/+$/, '');

  try {
    let text: string | undefined;
    if (file.extension === '.png' || file.extension === '.jpg' || file.extension === '.jpeg') {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.AI_API_KEY}` },
        body: JSON.stringify({
          model: env.AI_MODEL,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: providerPrompt },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
            ]
          }]
        }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`image provider status ${response.status}`);
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      text = payload.choices?.[0]?.message?.content;
    } else {
      // PDF and XLSX use the Responses-compatible file input shape. Providers
      // without this capability fail honestly; the server never falls back to a
      // fabricated extraction.
      const response = await fetch(`${baseUrl}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.AI_API_KEY}` },
        body: JSON.stringify({
          model: env.AI_MODEL,
          input: [{
            role: 'user',
            content: [
              { type: 'input_file', filename: file.originalName, file_data: dataUrl },
              { type: 'input_text', text: providerPrompt }
            ]
          }]
        }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`document provider status ${response.status}`);
      const payload = await response.json() as {
        output_text?: string;
        output?: Array<{ content?: Array<{ text?: string }> }>;
      };
      text = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? '').join('');
    }

    if (!text) throw new Error('provider returned an empty extraction');
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned) as { items?: unknown };
    if (!Array.isArray(parsed.items)) throw new Error('provider response did not contain an items array');
    return parsed.items.slice(0, 200).map((item) => {
      const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const quantity = row.quantity === null || row.quantity === undefined || row.quantity === '' ? undefined : Number(row.quantity);
      return {
        rawText: String(row.description ?? row.product ?? '').trim().slice(0, 500),
        rawQuantity: Number.isFinite(quantity) ? quantity : undefined,
        confidence: clampConfidence(row.confidence, 0.5)
      };
    }).filter((item) => item.rawText);
  } catch (error) {
    logger.warn('Requirement extraction provider failed', {
      requirementFile: file.originalName,
      extension: file.extension,
      error: error instanceof Error ? error.message : 'unknown error'
    });
    throw new AppError(502, ErrorCode.AI_PROVIDER_ERROR, 'The configured extraction provider could not read this requirement');
  } finally {
    clearTimeout(timeout);
  }
};

const matchProducts = async (
  agencyId: Types.ObjectId,
  lines: RawExtractedLine[]
): Promise<IProduct[]> => {
  const descriptions = Array.from(new Set(lines.map((line) => line.rawText.trim()).filter((line) => line.length >= 2)));
  if (descriptions.length === 0) return [];
  const exactSkus = descriptions.map((value) => value.toUpperCase());
  const expressions = descriptions.map((value) => new RegExp(escapeRegExp(value), 'i'));
  // Use a deliberately small structural view of the collection. This keeps the
  // compiler away from Mongoose's enormous inferred document union while the
  // runtime query remains tenant scoped and read-only.
  const collection = ProductModel.collection as unknown as {
    find(filter: Record<string, unknown>): {
      limit(count: number): { toArray(): Promise<unknown[]> };
    };
  };
  return (await collection
    .find({
      agencyId,
      isActive: true,
      $or: [
        { sku: { $in: exactSkus } },
        { name: { $in: expressions } },
        { genericName: { $in: expressions } },
        { brand: { $in: expressions } }
      ]
    })
    .limit(2000)
    .toArray()) as IProduct[];
};

const matchScore = (product: IProduct, rawText: string): number => {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const text = normalize(rawText);
  const name = normalize(product.name);
  const generic = normalize(product.genericName ?? '');
  const brand = normalize(product.brand ?? '');
  const sku = product.sku.toLowerCase();

  if (text === sku || text.includes(sku)) return 1;
  if (text === name) return 0.98;
  if (name.includes(text) || text.includes(name)) return 0.9;
  if (generic && (text === generic || text.includes(generic))) return 0.88;
  if (brand && (text === brand || text.includes(brand))) return 0.78;
  return 0;
};

export const extractRequirement = async (
  auth: AuthContext,
  requirementId: Types.ObjectId
): Promise<IRequirementUpload> => {
  if (!isAdmin(auth) && !isSalesman(auth)) {
    throw AppError.forbidden('Only agency staff can extract a requirement');
  }

  const scope = await requirementScopeFilter(auth);
  const upload = await RequirementUploadModel.findOne({ ...scope, _id: requirementId }).exec();
  if (!upload) throw AppError.notFound('Requirement upload');
  if (upload.status === 'CONVERTED') {
    throw AppError.conflict('A converted requirement cannot be extracted again');
  }

  upload.extraction = {
    status: 'PENDING',
    requestedBy: auth.userId,
    requestedAt: new Date(),
    items: []
  };
  await upload.save();

  try {
    const storage = getStorage();
    const buffer = await storage.getBuffer(upload.file.storageKey);
    if (buffer.length > env.maxFileSizeBytes) {
      throw AppError.badRequest('The stored requirement exceeds the configured extraction size limit');
    }

    const deterministic = upload.file.extension === '.csv';
    const lines = deterministic ? parseCsv(buffer) : await providerRequest(upload.file, buffer);
    const products = await matchProducts(auth.agencyId, lines);

    const items: IExtractedRequirementItem[] = lines.map((line) => {
      let best: IProduct | undefined;
      let bestScore = 0;
      for (const product of products) {
        const score = matchScore(product, line.rawText);
        if (score > bestScore) {
          best = product;
          bestScore = score;
        }
      }
      const quantity = line.rawQuantity !== undefined && Number.isInteger(line.rawQuantity) && line.rawQuantity > 0
        ? line.rawQuantity
        : undefined;
      const confidence = Math.min(line.confidence, bestScore || 0.2);
      const needsVerification = !best || !quantity || confidence < env.AI_REQUIREMENT_MIN_CONFIDENCE;
      const reason = !best
        ? 'No catalog product matched; select one manually.'
        : !quantity
          ? 'Quantity is missing or invalid; enter it manually.'
          : needsVerification
            ? 'Low confidence match; verify the product and quantity.'
            : undefined;
      return {
        rawText: line.rawText.slice(0, 500),
        rawQuantity: line.rawQuantity,
        quantity,
        productId: best?._id,
        productName: best?.name,
        sku: best?.sku,
        confidence,
        needsVerification,
        reason
      };
    });

    upload.extraction = {
      status: items.length > 0 && items.every((item) => !item.needsVerification) ? 'COMPLETE' : 'NEEDS_REVIEW',
      provider: deterministic ? 'deterministic-csv' : 'openai-compatible',
      model: deterministic ? 'deterministic-parser' : env.AI_MODEL,
      requestedBy: auth.userId,
      requestedAt: upload.extraction.requestedAt,
      completedAt: new Date(),
      items
    };
    upload.updatedBy = auth.userId;
    await upload.save();

    await recordActivity({
      agencyId: auth.agencyId,
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'requirement.extract',
      entity: 'RequirementUpload',
      entityId: upload._id,
      summary: `Extracted ${items.length} candidate line(s) from requirement "${upload.title}"`,
      meta: {
        provider: upload.extraction.provider,
        status: upload.extraction.status,
        needsVerification: items.filter((item) => item.needsVerification).length
      }
    });

    createNotificationSafe({
      agencyId: auth.agencyId,
      userId: upload.customerUserId,
      type: 'REQUIREMENT_UPLOADED',
      title: 'Your requirement is being reviewed',
      message: `The agency extracted ${items.length} candidate line(s) from "${upload.title}". No order was created automatically.`,
      data: { requirementId: upload._id.toString() },
      entityType: 'RequirementUpload',
      entityId: upload._id
    });

    return upload;
  } catch (error) {
    upload.extraction = {
      status: 'FAILED',
      requestedBy: auth.userId,
      requestedAt: upload.extraction.requestedAt,
      completedAt: new Date(),
      items: [],
      errorCode: error instanceof AppError ? error.code : ErrorCode.INTERNAL_ERROR
    };
    await upload.save();
    throw error;
  }
};
