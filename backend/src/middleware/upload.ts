import type { Request, RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../config/env';
import { AppError, ErrorCode } from '../utils/errors';

/**
 * Uploads are buffered in memory, size limited, and validated by content before
 * anything touches storage. Files are never written to a public web root.
 */
export const singleFileUpload = (field = 'file'): RequestHandler =>
  multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: env.maxFileSizeBytes,
      files: 1,
      fields: 20,
      fieldSize: 64 * 1024
    },
    fileFilter: (_req: Request, file: Express.Multer.File, callback: multer.FileFilterCallback) => {
      if (!file.originalname || file.originalname.length > 255) {
        callback(new AppError(422, ErrorCode.VALIDATION_ERROR, 'Invalid file name'));
        return;
      }
      callback(null, true);
    }
  }).single(field);

export type { Request };
