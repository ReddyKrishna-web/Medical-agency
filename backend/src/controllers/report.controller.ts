import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { sendData, sendPaginated } from '../utils/response';
import { requireAuth } from '../utils/tenant';
import { parseSort } from '../utils/pagination';
import { csvFilename } from '../utils/csv';
import { ActivityLogModel } from '../models/activity-log.model';
import { OrderModel } from '../models/order.model';
import { InvoiceModel } from '../models/invoice.model';
import { PaymentModel } from '../models/payment.model';
import { RequirementUploadModel } from '../models/requirement-upload.model';
import * as reportService from '../services/report.service';
import * as searchService from '../services/search.service';
import * as aiService from '../services/ai.service';
import * as settingsService from '../services/settings.service';
import { getTransactionCapability } from '../config/database';
import { AppError } from '../utils/errors';

const parseRange = (query: { from?: string; to?: string }): reportService.DateRange => {
  if (query.from && Number.isNaN(new Date(query.from).getTime())) {
    throw AppError.badRequest('from must be a valid ISO date');
  }
  if (query.to && Number.isNaN(new Date(query.to).getTime())) {
    throw AppError.badRequest('to must be a valid ISO date');
  }
  return reportService.resolveRange(
    query.from ? new Date(query.from) : undefined,
    query.to ? new Date(query.to) : undefined
  );
};

export const dashboard = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const range = parseRange(req.query as { from?: string; to?: string });
  sendData(res, await reportService.dashboardReport(auth, range));
});

export const ordersReport = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const range = parseRange(req.query as { from?: string; to?: string });
  sendData(res, await reportService.ordersReport(auth, range));
});

export const customersReport = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const range = parseRange(req.query as { from?: string; to?: string });
  sendData(res, await reportService.customersReport(auth, range));
});

export const productsReport = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const range = parseRange(req.query as { from?: string; to?: string });
  sendData(res, await reportService.productsReport(auth, range));
});

export const salesmenReport = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const range = parseRange(req.query as { from?: string; to?: string });
  sendData(res, await reportService.salesmenReport(auth, range));
});

export const inventoryReport = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  if (auth.role === 'CUSTOMER') throw AppError.forbidden('Inventory reporting is internal to the agency');
  sendData(res, await reportService.inventoryReport(auth));
});

export const exportReport = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const query = req.query as unknown as { type: reportService.ExportType; format: 'csv'; from?: string; to?: string };

  if (query.type === 'salesmen' && auth.role === 'CUSTOMER') {
    throw AppError.forbidden('Salesman exports are internal to the agency');
  }
  if (query.type === 'inventory' && auth.role === 'CUSTOMER') {
    throw AppError.forbidden('Inventory exports are internal to the agency');
  }

  const range = parseRange(query);
  const csv = await reportService.exportReportCsv(auth, query.type, range);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${csvFilename('supply-medicals', query.type)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(200).send(csv);
});

export const search = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const { q, limit } = req.query as unknown as { q: string; limit: number };
  sendData(res, await searchService.globalSearch(auth, q, limit));
});

export const aiStatus = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  sendData(res, await aiService.aiStatus(auth));
});

export const aiAsk = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const range = parseRange(req.body as { from?: string; to?: string });
  const answer = await aiService.askAi(auth, (req.body as { question: string }).question, range);
  sendData(res, answer);
});

/** Entity ids a customer is allowed to see activity for. */
const collectCustomerEntityIds = async (auth: { agencyId: unknown; customerId?: unknown }): Promise<unknown[]> => {
  if (!auth.customerId) return [];
  const [orders, invoices, payments, requirements] = await Promise.all([
    OrderModel.find({ agencyId: auth.agencyId, customerId: auth.customerId }).select('_id').lean(),
    InvoiceModel.find({ agencyId: auth.agencyId, customerId: auth.customerId }).select('_id').lean(),
    PaymentModel.find({ agencyId: auth.agencyId, customerId: auth.customerId }).select('_id').lean(),
    RequirementUploadModel.find({ agencyId: auth.agencyId, customerId: auth.customerId }).select('_id').lean()
  ]);
  return [...orders, ...invoices, ...payments, ...requirements].map((row) => row._id);
};

export const activity = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const query = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort?: string;
    entity?: string;
    entityId?: string;
    actorUserId?: string;
    from?: string;
    to?: string;
  };

  const filter: Record<string, unknown> = { agencyId: auth.agencyId };
  if (query.entity) filter.entity = query.entity;
  if (query.entityId) filter.entityId = query.entityId;
  if (query.actorUserId) filter.actorUserId = query.actorUserId;
  if (query.from || query.to) {
    filter.createdAt = {
      ...(query.from ? { $gte: new Date(query.from) } : {}),
      ...(query.to ? { $lte: new Date(query.to) } : {})
    };
  }
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, 'i');
    filter.$or = [{ action: expression }, { summary: expression }];
  }

  // A customer only ever sees activity about their own records.
  if (auth.role === 'CUSTOMER') {
    const ownIds = auth.customerId ? await collectCustomerEntityIds(auth) : [];
    filter.$and = [
      { entity: { $in: ['Order', 'Invoice', 'Payment', 'RequirementUpload', 'FollowUp'] } },
      { entityId: { $in: ownIds } }
    ];
  }

  const [items, total] = await Promise.all([
    ActivityLogModel.find(filter)
      .sort(parseSort(query.sort, ['createdAt', 'action', 'entity'], { createdAt: -1 }))
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate('actorUserId', 'name email role')
      .lean(),
    ActivityLogModel.countDocuments(filter)
  ]);

  sendPaginated(res, items, total, query.page, query.limit);
});

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  sendData(res, await settingsService.getSettings(auth.agencyId));
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const agency = await settingsService.updateSettings(auth.agencyId.toString(), {
    ...(req.body as settingsService.SettingsPatch),
    actorUserId: auth.userId
  });
  sendData(res, agency);
});

export const publicAgency = asyncHandler(async (_req: Request, res: Response) => {
  const agency = await settingsService.publicAgencyProfile();
  sendData(res, agency ?? { available: false });
});

/**
 * Public list of agencies an applicant can join at registration. Only names,
 * slugs and coarse location are exposed — never commercial settings.
 */
export const publicAgencies = asyncHandler(async (_req: Request, res: Response) => {
  const { AgencyModel } = await import('../models/agency.model');
  const rows = await AgencyModel.find({ status: 'ACTIVE' })
    .select('name slug contact.address.city contact.address.state')
    .sort({ name: 1 })
    .limit(200)
    .lean();

  sendData(res, {
    rows: rows.map((agency) => ({
      id: agency._id,
      name: agency.name,
      slug: agency.slug,
      city: agency.contact?.address?.city,
      state: agency.contact?.address?.state
    }))
  });
});

export const health = asyncHandler(async (_req: Request, res: Response) => {
  const { isDatabaseHealthy } = await import('../config/database');
  const mongo = getTransactionCapability();
  const databaseUp = isDatabaseHealthy();
  const startedAt = Date.now();

  sendData(res, {
    status: databaseUp ? 'ok' : 'degraded',
    service: 'supply-medicals-api',
    environment: process.env.NODE_ENV,
    database: {
      connected: databaseUp,
      transactions: mongo.supported,
      transactionNote: mongo.reason
    },
    uptimeSeconds: Math.floor(process.uptime()),
    latencyMs: Date.now() - startedAt,
    timestamp: new Date().toISOString()
  });
});
