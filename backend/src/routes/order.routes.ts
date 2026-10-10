import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { authenticate } from '../middleware/auth';
import { allowRoles } from '../middleware/rbac';
import { writeLimiter } from '../middleware/rate-limit';
import { idempotency } from '../middleware/idempotency';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../validators/common.schema';
import {
  cancelOrderSchema,
  createOrderSchema,
  createPaymentSchema,
  invoiceListSchema,
  orderListSchema,
  orderStatusSchema,
  paymentListSchema,
  reorderSchema,
  voidInvoiceSchema
} from '../validators/order.schema';
import * as orders from '../controllers/order.controller';

export const orderRouter = Router();

orderRouter.use(authenticate);

/* --------------------------------- orders --------------------------------- */

orderRouter.get('/', validate({ query: orderListSchema }), asyncHandler(orders.listOrders));

orderRouter.post(
  '/',
  writeLimiter,
  idempotency(),
  validate({ body: createOrderSchema }),
  asyncHandler(orders.createOrder)
);

orderRouter.post(
  '/reorder',
  writeLimiter,
  idempotency(),
  validate({ body: reorderSchema }),
  asyncHandler(orders.reorder)
);

orderRouter.get('/:id', validate({ params: idParamSchema }), asyncHandler(orders.getOrder));

orderRouter.get('/:id/timeline', validate({ params: idParamSchema }), asyncHandler(orders.orderTimeline));

orderRouter.post(
  '/:id/status',
  writeLimiter,
  validate({ params: idParamSchema, body: orderStatusSchema }),
  asyncHandler(orders.changeStatus)
);

orderRouter.post(
  '/:id/cancel',
  writeLimiter,
  validate({ params: idParamSchema, body: cancelOrderSchema }),
  asyncHandler(orders.cancelOrder)
);

/* -------------------------------- invoices -------------------------------- */

export const invoiceRouter = Router();

invoiceRouter.use(authenticate);

invoiceRouter.get('/', validate({ query: invoiceListSchema }), asyncHandler(orders.listInvoices));

invoiceRouter.get('/:id', validate({ params: idParamSchema }), asyncHandler(orders.getInvoice));

invoiceRouter.post(
  '/:id/void',
  allowRoles('AGENCY_ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema, body: voidInvoiceSchema }),
  asyncHandler(orders.voidInvoice)
);

/* -------------------------------- payments -------------------------------- */

export const paymentRouter = Router();

paymentRouter.use(authenticate);

paymentRouter.get('/', validate({ query: paymentListSchema }), asyncHandler(orders.listPayments));

paymentRouter.post(
  '/',
  allowRoles('AGENCY_ADMIN'),
  writeLimiter,
  idempotency(),
  validate({ body: createPaymentSchema }),
  asyncHandler(orders.createPayment)
);
