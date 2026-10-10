import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { UserModel } from '../models/user.model';
import { asyncHandler } from '../middleware/async-handler';
import { requireRole } from '../middleware/rbac';
import { sendCreated, sendData, sendPaginated } from '../utils/response';
import { requireAuth, toObjectIdSafe } from '../utils/tenant';
import { AppError } from '../utils/errors';
import { parseSort } from '../utils/pagination';
import * as customerService from '../services/customer.service';
import * as authService from '../services/auth.service';

const CUSTOMER_SORT_FIELDS = ['createdAt', 'businessName', 'status', 'updatedAt'] as const;
const SALESMAN_SORT_FIELDS = ['createdAt', 'employeeCode', 'status', 'updatedAt'] as const;

export const listCustomers = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const query = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort?: string;
    status?: string;
    assignedSalesmanId?: string;
    city?: string;
    self?: boolean;
  };

  // A salesman asking for `self` options, or a customer, is scoped by policy.
  const scope = await customerService.customerScope(auth);
  const { items, total } = await customerService.listCustomers(scope, {
    search: query.search,
    status: query.status,
    assignedSalesmanId: query.assignedSalesmanId,
    city: query.city,
    sort: parseSort(query.sort, CUSTOMER_SORT_FIELDS, { createdAt: -1 }),
    skip: (query.page - 1) * query.limit,
    limit: query.limit
  });

  sendPaginated(res, items, total, query.page, query.limit);
});

export const getCustomer = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const scope = await customerService.customerScope(auth);
  const customer = await customerService.getCustomer(scope, toObjectIdSafe(req.params.id, 'id'));
  sendData(res, customer);
});

export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const { password, ...rest } = req.body as customerService.CreateCustomerInput;
  const result = await customerService.createCustomer(auth.agencyId, {
    ...rest,
    password,
    actorUserId: auth.userId,
    actorRole: auth.role
  });
  sendCreated(res, { id: result.customer._id, businessName: result.customer.businessName, status: result.customer.status });
});

export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const customerId = toObjectIdSafe(req.params.id, 'id');

  if (auth.role === 'CUSTOMER') {
    if (!auth.customerId || !auth.customerId.equals(customerId)) {
      throw AppError.forbidden('You can only update your own record');
    }
    // Customers may edit contact details only; commercial fields are agency owned.
    const patch = {
      businessName: req.body.businessName,
      ownerName: req.body.ownerName,
      phone: req.body.phone,
      alternatePhone: req.body.alternatePhone,
      address: req.body.address,
      actorUserId: auth.userId
    };
    for (const key of Object.keys(patch)) {
      if ((patch as Record<string, unknown>)[key] === undefined) {
        delete (patch as Record<string, unknown>)[key];
      }
    }
    if (Object.keys(patch).length <= 1) throw AppError.badRequest('Provide at least one field to update');
    const updated = await customerService.updateCustomer(auth.agencyId, customerId, patch);
    sendData(res, updated);
    return;
  }

  const updated = await customerService.updateCustomer(auth.agencyId, customerId, {
    ...(req.body as Record<string, never>),
    actorUserId: auth.userId
  });
  sendData(res, updated);
});

export const addCustomerNote = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  if (auth.role !== 'AGENCY_ADMIN' && auth.role !== 'SALESMAN') {
    throw AppError.forbidden('Only the agency can add customer notes');
  }
  const customer = await customerService.addCustomerNote(auth, toObjectIdSafe(req.params.id, 'id'), {
    text: req.body.text,
    type: req.body.type,
    actorUserId: auth.userId,
    actorRole: auth.role
  });
  sendCreated(res, {
    id: customer._id,
    businessName: customer.businessName,
    accountNotes: customer.accountNotes ?? [],
    lastContactAt: customer.lastContactAt,
    lastContactType: customer.lastContactType
  });
});

export const setCustomerStatus = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const user = await UserModel.findOne({ agencyId: auth.agencyId, _id: auth.userId }).exec();
  if (!user) throw AppError.notFound('User');

  const result = await authService.setCustomerApproval(
    user,
    toObjectIdSafe(req.params.id, 'id'),
    req.body.status,
    req.body.note
  );
  sendData(res, result);
});

export const listSalesmen = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const query = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort?: string;
    status?: string;
    self?: boolean;
  };

  if (auth.role === 'CUSTOMER') {
    throw AppError.forbidden('Customer accounts cannot browse the sales team');
  }

  // A salesman may only ever list their own record.
  if (auth.role === 'SALESMAN' || query.self === true) {
    if (!auth.salesmanId) throw AppError.forbidden('Salesman profile is not resolved');
    const salesman = await customerService.getSalesman(auth.agencyId, auth.salesmanId);
    sendPaginated(res, [salesman], 1, 1, 1);
    return;
  }

  const { items, total } = await customerService.listSalesmen(auth.agencyId, {
    search: query.search,
    status: query.status,
    sort: parseSort(query.sort, SALESMAN_SORT_FIELDS, { createdAt: -1 }),
    skip: (query.page - 1) * query.limit,
    limit: query.limit
  });
  sendPaginated(res, items, total, query.page, query.limit);
});

export const getSalesman = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const salesmanId = toObjectIdSafe(req.params.id, 'id');

  if (auth.role !== 'AGENCY_ADMIN') {
    if (auth.role !== 'SALESMAN' || !auth.salesmanId || !auth.salesmanId.equals(salesmanId)) {
      throw AppError.forbidden('You can only view your own salesman record');
    }
  }

  const salesman = await customerService.getSalesman(auth.agencyId, salesmanId);
  sendData(res, salesman);
});

export const createSalesman = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const result = await customerService.createSalesman(auth.agencyId, {
    ...(req.body as customerService.CreateSalesmanInput),
    actorUserId: auth.userId,
    actorRole: auth.role
  });

  // `temporaryPassword` is the only time the plaintext is ever transmitted. It
  // is not stored anywhere and cannot be retrieved again: the admin must hand
  // it to the new salesman, who is forced to change it on first sign-in.
  sendCreated(res, {
    id: result.salesman._id,
    employeeCode: result.salesman.employeeCode,
    userId: result.userId,
    mustChangePassword: true,
    ...(result.temporaryPassword
      ? {
          temporaryPassword: result.temporaryPassword,
          temporaryPasswordNotice:
            'Shown once and never stored. Share it securely; the salesman must change it at first sign-in.'
        }
      : {})
  });
});

export const updateSalesman = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const salesmanId = toObjectIdSafe(req.params.id, 'id');

  if (auth.role !== 'AGENCY_ADMIN') {
    throw AppError.forbidden('Only agency admins can edit salesman records');
  }

  const updated = await customerService.updateSalesman(auth.agencyId, salesmanId, {
    ...(req.body as Record<string, never>),
    actorUserId: auth.userId
  });
  sendData(res, updated);
});

export const setSalesmanStatus = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const user = await UserModel.findOne({ agencyId: auth.agencyId, _id: auth.userId }).exec();
  if (!user) throw AppError.notFound('User');

  const result = await authService.updateSalesmanStatus(
    user,
    toObjectIdSafe(req.params.id, 'id'),
    req.body.status,
    req.body.note
  );
  sendData(res, result);
});

export const assignCustomers = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const salesmanId = toObjectIdSafe(req.params.id, 'id');
  const customerIds = (req.body.customerIds as string[]).map((id) => new Types.ObjectId(id) as Types.ObjectId);
  const salesman = await customerService.assignCustomers(auth.agencyId, salesmanId, customerIds, auth.userId);
  sendData(res, {
    salesmanId: salesman._id,
    employeeCode: salesman.employeeCode,
    assigned: salesman.customerIds.length
  });
});

export const adminOnly = requireRole('AGENCY_ADMIN');
