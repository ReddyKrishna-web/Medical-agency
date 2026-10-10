import type { Types } from 'mongoose';
import type { Role } from '../constants/domain';

/** Everything the backend knows about the caller. Populated by `authenticate`. */
export interface AuthContext {
  userId: Types.ObjectId;
  agencyId: Types.ObjectId;
  role: Role;
  name: string;
  email: string;
  status: 'PENDING' | 'ACTIVE' | 'DISABLED';
  tokenVersion: number;
  /** Salesman document id (SALESMAN role only). */
  salesmanId?: Types.ObjectId;
  /** Customer document id (CUSTOMER role only). */
  customerId?: Types.ObjectId;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      requestId?: string;
      idempotency?: {
        key: string;
        recordId: Types.ObjectId;
        release: () => Promise<void>;
        complete: (statusCode: number, body: unknown, resourceId?: Types.ObjectId) => Promise<void>;
        replayed: boolean;
      };
    }
  }
}

export {};
