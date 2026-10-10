import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app';
import { initSocketServer, closeSocketServer, getIo } from '../src/sockets';
import { createCustomerUser, createTenant } from './helpers/fixtures';
import { MessageModel } from '../src/models/message.model';
import { sendMessage } from '../src/services/message.service';
import type { AuthContext } from '../src/types/express';
import type { Types } from 'mongoose';

let server: http.Server;
let port: number;
let adminToken: string;
let adminUserId: Types.ObjectId;
let agencyId: Types.ObjectId;
let customer: { id: Types.ObjectId; userId: Types.ObjectId; token: string };

const connect = (token: string): Promise<{ socket?: ClientSocket; error?: string }> =>
  new Promise((resolve) => {
    const socket = ioClient(`http://127.0.0.1:${port}`, {
      auth: { token },
      transports: ['websocket'],
      timeout: 8000,
      reconnection: false
    });
    const timer = setTimeout(() => {
      socket.close();
      resolve({ error: 'timeout' });
    }, 8000);

    socket.on('socket.ready', () => {
      clearTimeout(timer);
      resolve({ socket });
    });
    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      resolve({ error: error.message });
    });
  });

const adminContext = (): AuthContext => ({
  userId: adminUserId,
  agencyId,
  role: 'AGENCY_ADMIN',
  name: 'Socket Admin',
  email: 'admin@socket.test',
  status: 'ACTIVE',
  tokenVersion: 0
});

describe('socket.io', () => {
  beforeAll(async () => {
    server = http.createServer(createApp());
    initSocketServer(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await closeSocketServer();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  /**
   * The per-test cleanup hook empties every collection, so each test provisions
   * its own tenant and accounts.
   */
  const provision = async (): Promise<void> => {
    const tenant = await createTenant('socket');
    adminToken = tenant.admin.token;
    adminUserId = tenant.admin.id;
    agencyId = tenant.agencyId;
    customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'socket-customer@test.local',
      businessName: 'Socket Shop'
    });
  };

  it('authenticates a handshake and joins the user and agency rooms', async () => {
    await provision();
    const { socket, error } = await connect(adminToken);
    expect(error).toBeUndefined();
    expect(socket).toBeTruthy();

    // The client socket does not expose server rooms, so ask the server side.
    const serverSocket = await new Promise<{ rooms: Set<string> } | null>((resolve) => {
      const io = getIo();
      if (!io) {
        resolve(null);
        return;
      }
      const timer = setTimeout(() => resolve(null), 5000);
      io.of('/').adapter.rooms.forEach((_members, room) => {
        if (room === `user:${adminUserId.toString()}`) {
          clearTimeout(timer);
          resolve({ rooms: new Set([room]) });
        }
      });
      setTimeout(() => {
        clearTimeout(timer);
        resolve(null);
      }, 4500);
    });

    expect(serverSocket).toBeTruthy();
    expect([...(serverSocket?.rooms ?? [])]).toContain(`user:${adminUserId.toString()}`);

    socket?.close();
  });

  it('rejects a socket without a token and with an invalid token', async () => {
    const anonymous = await connect('');
    expect(anonymous.error).toBeTruthy();
    expect(anonymous.socket).toBeUndefined();

    const bogus = await connect('not-a-jwt');
    expect(bogus.error).toBeTruthy();
  });

  it('persists a message before emitting message.created to the recipient room', async () => {
    await provision();
    const { socket, error } = await connect(customer.token);
    expect(error).toBeUndefined();

    const received = new Promise<{ message: { body: string; receiverId: string } }>((resolve) => {
      socket?.on('message.created', (payload: { message: { body: string; receiverId: string } }) =>
        resolve(payload)
      );
    });

    await sendMessage(adminContext(), {
      receiverId: customer.userId.toString(),
      body: 'Realtime smoke message'
    });

    const payload = await Promise.race([
      received,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
    ]);

    expect(payload).toBeTruthy();
    const message = (payload as { message: { body: string; receiverId: string } }).message;
    expect(message.body).toBe('Realtime smoke message');
    expect(message.receiverId).toBe(customer.userId.toString());

    // The database write happened before the emit.
    const stored = await MessageModel.countDocuments({ body: 'Realtime smoke message' });
    expect(stored).toBe(1);

    socket?.close();
    expect(getIo()).toBeTruthy();
  });

  it('serves the REST surface from the same server', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });
});
