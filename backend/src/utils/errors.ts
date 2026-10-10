import { ZodError } from 'zod';

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_IDENTIFIER = 'INVALID_IDENTIFIER',
  UNAUTHORIZED = 'UNAUTHORIZED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_PENDING = 'ACCOUNT_PENDING',
  ACCOUNT_DISABLED = 'ACCOUNT_DISABLED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  DUPLICATE_RESOURCE = 'DUPLICATE_RESOURCE',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  INVALID_TRANSITION = 'INVALID_TRANSITION',
  INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK',
  EXPIRED_STOCK = 'EXPIRED_STOCK',
  INVENTORY_COMMIT_FAILED = 'INVENTORY_COMMIT_FAILED',
  RATE_LIMITED = 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE = 'UNSUPPORTED_MEDIA_TYPE',
  WEAK_PASSWORD = 'WEAK_PASSWORD',
  AI_NOT_CONFIGURED = 'AI_NOT_CONFIGURED',
  AI_PROVIDER_ERROR = 'AI_PROVIDER_ERROR',
  AI_SCOPE_REFUSED = 'AI_SCOPE_REFUSED',
  STORAGE_ERROR = 'STORAGE_ERROR',
  EMAIL_NOT_CONFIGURED = 'EMAIL_NOT_CONFIGURED',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

export class AppError extends Error {
  public readonly statusCode: number;

  public readonly code: ErrorCode;

  public readonly details?: unknown;

  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: unknown,
    options?: { isOperational?: boolean }
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = options?.isOperational ?? true;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, ErrorCode.VALIDATION_ERROR, message, details);
  }

  static unauthorized(message = 'Authentication required', code: ErrorCode = ErrorCode.UNAUTHORIZED): AppError {
    return new AppError(401, code, message);
  }

  static forbidden(message = 'You are not allowed to perform this action'): AppError {
    return new AppError(403, ErrorCode.FORBIDDEN, message);
  }

  static notFound(resource = 'Resource'): AppError {
    return new AppError(404, ErrorCode.NOT_FOUND, `${resource} was not found`);
  }

  static conflict(message: string, code: ErrorCode = ErrorCode.CONFLICT, details?: unknown): AppError {
    return new AppError(409, code, message, details);
  }

  static unprocessable(message: string, details?: unknown): AppError {
    return new AppError(422, ErrorCode.VALIDATION_ERROR, message, details);
  }

  static internal(message = 'Unexpected server error'): AppError {
    return new AppError(500, ErrorCode.INTERNAL_ERROR, message, undefined, { isOperational: false });
  }

  static fromZodError(error: ZodError): AppError {
    return new AppError(
      422,
      ErrorCode.VALIDATION_ERROR,
      'Request validation failed',
      error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code
      }))
    );
  }
}
