#!/usr/bin/env node
/** Live full-lifecycle + Socket.IO + contact/CRM/extraction smoke test. Development only. */
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const baseUrl = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5010/api').replace(/\/$/, '');
const socketUrl = baseUrl.replace(/\/api$/, '');
const prefixes = { admin: 'SMOKE_ADMIN', salesman: 'SMOKE_SALESMAN', customer: 'SMOKE_CUSTOMER' };
for (const prefix of Object.values(prefixes)) {
  for (const suffix of ['EMAIL', 'PASSWORD']) {
    if (!process.env[`${prefix}_${suffix}`]) throw new Error(`Missing ${prefix}_${suffix}`);
  }
}

async function api(path, { token, method = 'GET', body, form } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...(form ? { body: form } : {}),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 600)}`);
  return json?.data;
}

async function login(prefix) {
  const data = await api('/auth/login', { method: 'POST', body: { email: process.env[`${prefix}_EMAIL`], password: process.env[`${prefix}_PASSWORD`] } });
  assert.ok(data.accessToken, `${prefix} token missing`);
  return data;
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(socketUrl, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 8000 });
    const timer = setTimeout(() => reject(new Error('socket connection timeout')), 9000);
    socket.once('connect', () => { clearTimeout(timer); resolve(socket); });
    socket.once('connect_error', reject);
  });
}

function once(socket, event, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for socket ${event}`)), timeoutMs);
    socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
  });
}

const results = [];
const pass = (name, detail = '') => { results.push(name); console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`); };

const admin = await login('SMOKE_ADMIN');
const salesman = await login('SMOKE_SALESMAN');
const customer = await login('SMOKE_CUSTOMER');
const adminSocket = await connect(admin.accessToken);
const customerSocket = await connect(customer.accessToken);
pass('authenticated Socket.IO handshakes joined tenant rooms');

const products = await api('/products?page=1&limit=50&availability=IN_STOCK', { token: customer.accessToken });
assert.ok(Array.isArray(products) && products.length, 'an in-stock product is required');
const product = products[0];
const customers = await api('/customers?page=1&limit=50&status=ACTIVE', { token: salesman.accessToken });
assert.ok(customers.length, 'assigned customer required');

const createdEvent = once(adminSocket, 'order.created');
const order = await api('/orders', {
  token: customer.accessToken,
  method: 'POST',
  headers: undefined,
  body: { items: [{ productId: String(product.id || product._id), quantity: 1 }], notes: 'Live socket lifecycle smoke test' },
});
const created = await createdEvent;
assert.equal(String(created.order?.id || created.order?._id || created.id), String(order.id || order._id));
pass('customer order creation reached the agency socket', order.orderNumber);

const transitions = ['UNDER_REVIEW', 'CONFIRMED', 'PROCESSING', 'PACKED', 'DISPATCHED', 'DELIVERED'];
let lastStatus;
for (const status of transitions) {
  const event = once(customerSocket, 'order.updated');
  const result = await api(`/orders/${order.id || order._id}/status`, { token: admin.accessToken, method: 'POST', body: { status, note: `Live smoke: ${status}` } });
  const received = await event;
  assert.equal(received.status, status);
  assert.equal(received.previousStatus, lastStatus ?? 'PENDING');
  lastStatus = status;
}
pass('every lifecycle transition reached the customer socket', 'UNDER_REVIEW → DELIVERED');

const invoices = await api(`/invoices?orderId=${order.id || order._id}`, { token: admin.accessToken });
assert.equal(invoices.length, 1, 'delivery must create exactly one invoice');
assert.ok(invoices[0].grandTotal > 0);
pass('delivery created one priced invoice', invoices[0].invoiceNumber);

const movements = await api('/inventory/movements?page=1&limit=200', { token: admin.accessToken });
assert.ok(Array.isArray(movements) && movements.length >= 2, 'reserve and commit movements are expected');
assert.ok(movements.some((row) => row.direction === 'OUT'), 'expected a committed outbound movement');
pass('stock movement ledger is readable', `${movements.length} movements`);

const contactEmail = `live-smoke-${Date.now()}@buyer.example`;
const contact = await api('/public/contact', {
  method: 'POST',
  body: { name: 'Live Smoke Buyer', email: contactEmail, organisation: 'Smoke Medicals', topic: 'PRICING_REQUEST', message: 'Please provide the current wholesale price list for this development smoke test.' },
});
assert.match(contact.message, /received/i);
const inbox = await api(`/contact-submissions?page=1&limit=20&search=${encodeURIComponent(contactEmail)}`, { token: admin.accessToken });
assert.equal(inbox.length, 1);
pass('public contact form persisted into the admin inbox');

const customerId = String(customers[0].id || customers[0]._id);
const note = await api(`/customers/${customerId}/notes`, { token: salesman.accessToken, method: 'POST', body: { text: 'Live smoke call: customer requested a restock quotation.', type: 'CALL' } });
assert.match(note.accountNotes.at(-1).text, /restock quotation/i);
const refreshedCustomer = await api(`/customers/${customerId}`, { token: salesman.accessToken });
assert.ok(refreshedCustomer.accountNotes.some((row) => /restock quotation/i.test(row.text)));
assert.equal(refreshedCustomer.lastContactType, 'CALL');
pass('salesman CRM note and last-contact signal persisted');

const csv = 'Product,Quantity\nParacetamol 650mg Tablets,5\nUnlisted smoke item,2\n';
const form = new FormData();
form.append('title', 'Live CSV extraction smoke test');
form.append('notes', 'Human verification is mandatory.');
form.append('file', new Blob([csv], { type: 'text/csv' }), 'live-requirement.csv');
const requirement = await api('/requirements', { token: customer.accessToken, method: 'POST', form });
const extraction = await api(`/requirements/${requirement.id}/extract`, { token: admin.accessToken, method: 'POST', body: {} });
assert.equal(extraction.orderCreated, false);
assert.equal(extraction.humanConfirmationRequired, true);
assert.equal(extraction.extraction.provider, 'deterministic-csv');
assert.ok(extraction.extraction.items.some((item) => item.needsVerification));
pass('requirement extraction stayed review-only and never created an order');

const dashboard = await api('/reports/dashboard', { token: admin.accessToken });
if (typeof dashboard.metrics?.totalOrders !== 'number') {
  throw new Error(`Dashboard flat metrics missing: ${JSON.stringify(dashboard).slice(0, 1000)}`);
}
assert.equal(typeof dashboard.metrics.totalOrders, 'number');
assert.ok(dashboard.metrics.totalOrders > 0);
assert.equal(typeof dashboard.metrics.expiringSoon, 'number');
pass('admin dashboard exposes real flat operational metrics', `${dashboard.metrics.totalOrders} orders`);

adminSocket.close();
customerSocket.close();
console.log(`\n[e2e] ${results.length} live checks passed against ${baseUrl}`);
