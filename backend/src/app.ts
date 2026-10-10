import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { env } from './config/env';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { sanitizeRequest } from './middleware/sanitize';
import { apiLimiter } from './middleware/rate-limit';
import { logger } from './utils/logger';

const allowedOrigins = new Set(env.corsOrigins);

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    // Same-origin/server-to-server requests have no Origin header.
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    logger.warn('Blocked cross-origin request', { origin });
    callback(new Error(`Origin ${origin} is not allowed by the CORS policy`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Requested-With'],
  exposedHeaders: ['Content-Disposition', 'X-Request-Id'],
  maxAge: 600
};

export const createApp = (): Application => {
  const app = express();

  if (env.TRUST_PROXY > 0) {
    app.set('trust proxy', env.TRUST_PROXY);
  }
  app.disable('x-powered-by');
  app.set('etag', 'strong');

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors(corsOptions));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use(sanitizeRequest);
  app.use(apiLimiter);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = req.header('X-Request-Id')?.slice(0, 64) ?? randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const meta = {
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        userId: req.auth?.userId?.toString(),
        ip: req.ip
      };
      if (res.statusCode >= 500) logger.error('Request completed with error', meta);
      else logger.info('Request completed', meta);
    });
    next();
  });

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export default createApp;
