import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer, type ServerOptions } from 'socket.io';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { registerSocketAuth } from './auth';
import { roomForUser, roomForAgency } from './rooms';

let io: SocketServer | null = null;

export const initSocketServer = (httpServer: HttpServer): SocketServer => {
  const options: Partial<ServerOptions> = {
    // CORS for the realtime transport mirrors the HTTP allowlist.
    cors: {
      origin: env.corsOrigins.length > 0 ? [...env.corsOrigins] : false,
      credentials: true,
      methods: ['GET', 'POST']
    },
    path: '/socket.io',
    serveClient: false,
    pingTimeout: 25_000,
    pingInterval: 20_000,
    maxHttpBufferSize: 1e6,
    transports: ['websocket', 'polling']
  };

  io = new SocketServer(httpServer, options);
  registerSocketAuth(io);

  io.on('connection', (socket) => {
    logger.debug('Socket connected', { socketId: socket.id, userId: socket.data?.userId });
    socket.on('disconnect', (reason) => {
      logger.debug('Socket disconnected', { socketId: socket.id, reason });
    });
  });

  logger.info('Socket.IO server initialised', { corsOrigins: env.corsOrigins });
  return io;
};

export const getIo = (): SocketServer | null => io;

export const closeSocketServer = async (): Promise<void> => {
  if (!io) return;
  await new Promise<void>((resolve) => {
    io!.close(() => resolve());
  });
  io = null;
  logger.info('Socket.IO server closed');
};

export { roomForUser, roomForAgency };
