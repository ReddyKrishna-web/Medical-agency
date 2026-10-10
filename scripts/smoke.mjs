#!/usr/bin/env node
/**
 * Live Supply Medicals API smoke test.
 *
 * Required development credentials (never commit real values):
 *   SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD
 *   SMOKE_SALESMAN_EMAIL / SMOKE_SALESMAN_PASSWORD
 *   SMOKE_CUSTOMER_EMAIL / SMOKE_CUSTOMER_PASSWORD
 *
 * Read-only checks run by default. Set SMOKE_ALLOW_MUTATION=true only against a
 * disposable development database to create and advance a real order.
 */
import assert from 'node:assert/strict';

const baseUrl = (process.env.SMOKE_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const allowMutation = process.env.SMOKE_ALLOW_MUTATION === 'true';

const required = [
  'SMOKE_ADMIN_EMAIL', 'SMOKE_ADMIN_PASSWORD',
  'SMOKE_SALESMAN_EMAIL', 'SMOKE_SALESMAN_PASSWORD',
  'SMOKE_CUSTOMER_EMAIL', 'SMOKE_CUSTOMER_PASSWORD'
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`[smoke] Missing required environment values: ${missing.join(', ')}`);
  process.exit(2);
}

const results = [];

async function request(path, { token, method = 'GET', body, expectStatus } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  if (expectStatus && response.status !== expectStatus) {
    throw new Error(`${method} ${path} expected ${expectStatus}, received ${response.status}: ${text.slice(0, 500)}`);
  }
  return { status: response.status, payload };
}

async function login(prefix) {
  const { payload } = await request('/auth/login', {
    method: 'POST',
    body: { email: process.env[`${prefix}_EMAIL`], password: process.env[`${prefix}_PASSWORD`] },
    expectStatus: 200,
  });
  assert.equal(payload?.success, true, `${prefix} login did not return success`);
  assert.ok(payload.data?.accessToken, `${prefix} login did not return an access token`);
  const { payload: me } = await request('/auth/me', { token: payload.data.accessToken, expectStatus: 200 });
  assert.ok(me.data?.user?.id, `${prefix} /auth/me did not return a user`);
  return { token: payload.data.accessToken, user: me.data.user, profile: me.data.profile };
}

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

const health = await request('/health', { expectStatus: 200 });
assert.equal(health.payload?.data?.status, 'ok');
pass('health', `database=${health.payload.data.database.connected}, transactions=${health.payload.data.database.transactions}`);

const admin = await login('SMOKE_ADMIN');
pass('admin login and profile', admin.user.role);
assert.equal(admin.user.role, 'AGENCY_ADMIN');

const salesman = await login('SMOKE_SALESMAN');
pass('salesman login and profile', salesman.user.role);
assert.equal(salesman.user.role, 'SALESMAN');

const customer = await login('SMOKE_CUSTOMER');
pass('customer login and profile', customer.user.role);
assert.equal(customer.user.role, 'CUSTOMER');

const catalog = await request('/products?page=1&limit=10', { token: customer.token, expectStatus: 200 });
assert.ok(Array.isArray(catalog.payload?.data));
pass('customer catalog', `${catalog.payload.meta?.total ?? catalog.payload.data.length} products`);

const customerOrders = await request('/orders?page=1&limit=5', { token: customer.token, expectStatus: 200 });
assert.ok(Array.isArray(customerOrders.payload?.data));
for (const order of customerOrders.payload.data) {
  const scoped = await request(`/orders/${order.id || order._id}`, { token: customer.token, expectStatus: 200 });
  assert.ok(scoped.payload?.data);
}
pass('customer order isolation', `${customerOrders.payload.data.length} own orders readable`);

const assignedCustomers = await request('/customers?page=1&limit=20', { token: salesman.token, expectStatus: 200 });
assert.ok(Array.isArray(assignedCustomers.payload?.data));
pass('salesman assigned customers', String(assignedCustomers.payload.meta?.total ?? assignedCustomers.payload.data.length));

const denied = await request('/salesmen?page=1&limit=1', { token: customer.token });
assert.equal(denied.status, 403, 'customer must not read the internal salesman directory');
pass('customer blocked from internal salesman directory', `HTTP ${denied.status}`);

const noToken = await request('/orders');
assert.equal(noToken.status, 401);
pass('unauthenticated request rejected', 'HTTP 401');

const aiStatus = await request('/ai/status', { token: admin.token, expectStatus: 200 });
const configured = aiStatus.payload?.data?.configured === true;
if (configured) {
  const ask = await request('/ai/ask', { token: admin.token, method: 'POST', body: { question: 'Summarize order activity for the last 7 days.' }, expectStatus: 200 });
  assert.equal(ask.payload?.success, true);
  pass('configured AI business query');
} else {
  const ask = await request('/ai/ask', { token: admin.token, method: 'POST', body: { question: 'Summarize order activity for the last 7 days.' } });
  assert.equal(ask.status, 503);
  assert.equal(ask.payload?.error?.code, 'AI_NOT_CONFIGURED');
  pass('AI honest configuration state', 'HTTP 503 AI_NOT_CONFIGURED');
}

if (allowMutation) {
  const product = catalog.payload.data.find((item) => item.isActive !== false);
  assert.ok(product, 'an active product is required for the mutating smoke test');
  const created = await request('/orders', {
    token: customer.token,
    method: 'POST',
    body: { items: [{ productId: String(product.id || product._id), quantity: 1 }], notes: 'Automated development smoke test' },
    expectStatus: 201,
  });
  const order = created.payload.data;
  assert.match(order.orderNumber, /^[A-Z0-9]+-\d{4}-\d+$/);
  assert.equal(typeof order.grandTotal, 'number');
  pass('customer created priced order', order.orderNumber);

  const salesOrder = await request('/orders', {
    token: salesman.token,
    method: 'POST',
    body: {
      customerId: String(assignedCustomers.payload.data[0]?.id || assignedCustomers.payload.data[0]?._id),
      items: [{ productId: String(product.id || product._id), quantity: 1 }],
      notes: 'Automated salesman smoke test',
    },
    expectStatus: 201,
  });
  assert.equal(salesOrder.payload.data.source, 'SALESMAN');
  pass('salesman created assigned-customer order', salesOrder.payload.data.orderNumber);

  const invalid = await request(`/orders/${order.id || order._id}/status`, {
    token: customer.token,
    method: 'POST',
    body: { status: 'DELIVERED' },
  });
  assert.ok([403, 409].includes(invalid.status), `customer self-delivery should fail, received ${invalid.status}`);
  pass('customer cannot mark order delivered', `HTTP ${invalid.status}`);
} else {
  console.log('- Mutating order flow skipped (set SMOKE_ALLOW_MUTATION=true for a disposable dev database)');
}

console.log(`\n[smoke] ${results.length} checks passed against ${baseUrl}`);
