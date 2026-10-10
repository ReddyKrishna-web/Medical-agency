import type { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../middleware/auth';
import { UserModel } from '../models/user.model';
import { logger } from '../utils/logger';
import { roomForAgency, roomForUser } from './rooms';
import type { AuthContext } from '../types/express';

interface AuthedSocket extends Socket {
  data: {
    userId?: string;
    agencyId?: string;
    role?: string;
    customerId?: string;
    salesmanId?: string;
    auth?: AuthContext;
  };
}

/**
 * Socket handshake authentication. The access token arrives in
 * `socket.handshake.auth.token`; the database record remains the source of truth
 * and a socket only ever joins its own user room and its own agency room.
 */
export const registerSocketAuth = (io: Server): void => {
  io.use((socket, next) => {
    void (async () => {
      try {
        const token =
          (socket.handshake.auth?.token as string | undefined) ??
          (typeof socket.handshake.headers.authorization === 'string'
            ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
            : undefined);

        if (!token) {
          next(new Error('UNAUTHORIZED: missing handshake token'));
          return;
        }

        const payload = verifyAccessToken(token);
        const user = await UserModel.findById(payload.sub).exec();
        if (!user || String(user.agencyId) !== payload.aid || user.role !== payload.role) {
          next(new Error('UNAUTHORIZED: token does not match an active account'));
          return;
        }
        if (user.status !== 'ACTIVE') {
          next(new Error('FORBIDDEN: account is not active'));
          return;
        }
        if ((user.tokenVersion ?? 0) !== (payload.ver ?? 0)) {
          next(new Error('UNAUTHORIZED: session was invalidated'));
          return;
        }

        socket.data.userId = user._id.toString();
        socket.data.agencyId = user.agencyId.toString();
        socket.data.role = user.role;
        socket.join(roomForUser(user._id));
        socket.join(roomForAgency(user.agencyId));

        logger.debug('Socket authenticated', { socketId: socket.id, userId: socket.data.userId });
        next();
      } catch (_error) {
        next(new Error('UNAUTHORIZED: invalid token'));
      }
    })();
  });

  io.on('connection', (socket) => {
    const authed = socket as AuthedSocket;
    // Clients may only confirm their own subscription; joining arbitrary rooms
    // is not possible because the server only ever joins tenant/user rooms.
    socket.emit('socket.ready', {
      userId: authed.data.userId,
      role: authed.data.role,
      rooms: [roomForUser(authed.data.userId ?? ''), roomForAgency(authed.data.agencyId ?? '')]
    });
  });
};
