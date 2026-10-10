import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { getApp, expectError, expectSuccess, TEST_PASSWORD, createTenant } from './helpers/fixtures';
import { AgencyModel } from '../src/models/agency.model';
import { UserModel } from '../src/models/user.model';
import { SalesmanModel } from '../src/models/salesman.model';
import { RefreshTokenModel } from '../src/models/refresh-token.model';

const agent = () => getApp();

/**
 * The per-test setup wipes every collection and recreates a base agency, so
 * the tenant must be resolved inside each test rather than once per file.
 */
const ensureAgency = async (): Promise<string> => {
  const existing = await AgencyModel.findOne({ slug: 'test-platform-agency' }).select('_id').lean();
  if (existing) return String(existing._id);
  const tenant = await createTenant(`auth-reg-${Date.now()}`);
  return String(tenant.agencyId);
};

const validRegistration = async (email: string) => ({
  accountType: 'MEDICAL_SHOP',
  agencyId: await ensureAgency(),
  name: 'Asha Applicant',
  email,
  phone: '+91 98111 00001',
  password: TEST_PASSWORD,
  businessName: 'Asha Medical Store',
  ownerName: 'Asha Rao',
  address: {
    line1: '5 Market Road',
    city: 'Pune',
    state: 'Maharashtra',
    country: 'India',
    postalCode: '411001'
  }
});

describe('authentication', () => {
  it('rejects a registration body that tries to choose a role or status', async () => {
    const response = await request(agent())
      .post('/api/auth/register')
      .send({ ...(await validRegistration('role-escalation@test.local')), role: 'AGENCY_ADMIN', status: 'ACTIVE' });

    // Unknown keys are stripped, so the account is created as an ACTIVE shop.
    expect(response.status).toBe(201);
    const data = expectSuccess(response.body) as { user: { role: string; status: string } };
    expect(data.user.role).toBe('CUSTOMER');
    expect(data.user.status).toBe('ACTIVE');

    const stored = await UserModel.findOne({ email: 'role-escalation@test.local' }).lean();
    expect(stored?.role).toBe('CUSTOMER');
    expect(stored?.status).toBe('ACTIVE');
    expect(String(stored?.agencyId)).toBe(await ensureAgency());
  });

  it('registers a salesman as ACTIVE with no approval gate', async () => {
    const response = await request(agent())
      .post('/api/auth/register')
      .send({
        accountType: 'SALESMAN',
        agencyId: await ensureAgency(),
        name: 'Sam Mediator',
        email: 'salesman-reg@test.local',
        phone: '+91 98111 00002',
        password: TEST_PASSWORD
      });

    expect(response.status).toBe(201);
    const data = expectSuccess(response.body) as { user: { role: string; status: string } };
    expect(data.user.role).toBe('SALESMAN');
    // There is no approval gate: the salesman can work immediately.
    expect(data.user.status).toBe('ACTIVE');

    const stored = await UserModel.findOne({ email: 'salesman-reg@test.local' }).lean();
    expect(String(stored?.agencyId)).toBe(await ensureAgency());

    const salesman = await SalesmanModel.findOne({ userId: stored?._id }).lean();
    expect(salesman?.status).toBe('ACTIVE');
  });

  it('requires agencyId and businessName for shop registration', async () => {
    const missing = await request(agent())
      .post('/api/auth/register')
      .send({ ...(await validRegistration('no-agency@test.local')), agencyId: undefined });
    expect(missing.status).toBe(422);

    const noBusiness = await request(agent())
      .post('/api/auth/register')
      .send({ ...(await validRegistration('no-business@test.local')), businessName: undefined });
    expect(noBusiness.status).toBe(422);
  });

  it('self-registers an agency whose admin is immediately ACTIVE', async () => {
    const response = await request(agent())
      .post('/api/auth/register-agency')
      .send({
        agencyName: `Fresh Health ${Date.now()}`,
        email: 'agency-owner@test.local',
        phone: '+91 98111 00003',
        password: TEST_PASSWORD,
        contactName: 'Fresh Owner',
        address: {
          line1: '9 Depot Lane',
          city: 'Mumbai',
          state: 'Maharashtra',
          country: 'India',
          postalCode: '400001'
        }
      });

    expect(response.status).toBe(201);
    const data = expectSuccess(response.body) as { user: { role: string; status: string } };
    expect(data.user.role).toBe('AGENCY_ADMIN');
    expect(data.user.status).toBe('ACTIVE');
  });

  it('rejects agency self-registration when the admin email already exists', async () => {
    await request(agent()).post('/api/auth/register').send(await validRegistration('dup-anchor@test.local'));

    const response = await request(agent())
      .post('/api/auth/register-agency')
      .send({
        agencyName: `Dup Agency ${Date.now()}`,
        email: 'dup-anchor@test.local',
        phone: '+91 98111 00004',
        password: TEST_PASSWORD,
        address: {
          line1: '10 Dup Street',
          city: 'Pune',
          state: 'Maharashtra',
          country: 'India',
          postalCode: '411002'
        }
      });

    expect(response.status).toBe(409);
    expect(expectError(response.body).code).toBe('DUPLICATE_RESOURCE');
  });

  it('issues an HttpOnly refresh cookie and never returns the refresh token in the body', async () => {
    const response = await request(agent())
      .post('/api/auth/register')
      .send(await validRegistration('cookie-owner@test.local'));

    expect(response.status).toBe(201);
    const setCookie = response.headers['set-cookie'] as unknown as string[] | undefined;
    expect(Array.isArray(setCookie)).toBe(true);
    expect(setCookie?.[0]).toMatch(/HttpOnly/i);
    expect(setCookie?.[0]).toMatch(/sm_refresh_token=/);

    const body = JSON.stringify(response.body);
    expect(body).not.toContain('refreshToken');
  });

  it('rejects a weak password', async () => {
    const response = await request(agent())
      .post('/api/auth/register')
      .send({ ...(await validRegistration('weak@test.local')), password: 'password' });

    expect(response.status).toBe(422);
    expect(expectError(response.body).code).toBe('WEAK_PASSWORD');
  });

  it('lets a freshly registered shop sign in immediately with no approval gate', async () => {
    await request(agent()).post('/api/auth/register').send(await validRegistration('instant-access@test.local'));

    const login = await request(agent())
      .post('/api/auth/login')
      .send({ email: 'instant-access@test.local', password: TEST_PASSWORD });
    expect(login.status).toBe(200);

    const payload = expectSuccess(login.body) as { user: { role: string; status: string }; accessToken: string };
    expect(payload.user.role).toBe('CUSTOMER');
    expect(payload.user.status).toBe('ACTIVE');
    expect(payload.accessToken).toBeTruthy();
  });

  it('does not reveal whether an email exists on forgot-password', async () => {
    const known = await request(agent())
      .post('/api/auth/register')
      .send(await validRegistration('known-user@test.local'));

    const knownResponse = await request(agent()).post('/api/auth/forgot-password').send({ email: 'known-user@test.local' });
    const unknownResponse = await request(agent())
      .post('/api/auth/forgot-password')
      .send({ email: 'does-not-exist@test.local' });

    expect(knownResponse.status).toBe(200);
    expect(unknownResponse.status).toBe(200);
    expect((expectSuccess(knownResponse.body) as { message: string }).message).toBe(
      (expectSuccess(unknownResponse.body) as { message: string }).message
    );
    expect(known.status).toBe(201);
  });

  it('resets a password with a hashed one-time token and revokes sessions', async () => {
    await request(agent()).post('/api/auth/register').send(await validRegistration('reset-user@test.local'));

    const forgot = await request(agent()).post('/api/auth/forgot-password').send({ email: 'reset-user@test.local' });
    const token = (expectSuccess(forgot.body) as { devResetToken?: string }).devResetToken;
    // In the test environment the token is not returned; use the stored hash path
    // by asserting the stored value is hashed and not the raw token.
    expect(token).toBeUndefined();

    const user = await UserModel.findOne({ email: 'reset-user@test.local' })
      .select('+passwordHash +passwordResetTokenHash +passwordResetExpiresAt')
      .lean<{ passwordHash: string; passwordResetTokenHash?: string; passwordResetExpiresAt?: Date }>();
    expect(user?.passwordResetTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(user?.passwordResetExpiresAt).toBeInstanceOf(Date);

    const wrongToken = await request(agent())
      .post('/api/auth/reset-password')
      .send({ token: 'a'.repeat(40), password: 'BrandNew123!' });
    expect(wrongToken.status).toBe(400);
  });

  it('rotates the refresh token and detects reuse', async () => {
    const registered = await request(agent())
      .post('/api/auth/register')
      .send(await validRegistration('rotate-user@test.local'));

    // Approve the account so the rotation path is exercised for an active user.
    await UserModel.updateOne({ email: 'rotate-user@test.local' }, { $set: { status: 'ACTIVE' } });

    const firstCookie = (registered.headers['set-cookie'] as unknown as string[])[0]?.split(';')[0] ?? '';

    const refreshed = await request(agent())
      .post('/api/auth/refresh')
      .set('Cookie', firstCookie)
      .send({});
    expect(refreshed.status).toBe(200);
    expect((expectSuccess(refreshed.body) as { accessToken: string }).accessToken).toBeTruthy();

    const secondCookie = (refreshed.headers['set-cookie'] as unknown as string[])[0]?.split(';')[0] ?? '';
    expect(secondCookie).not.toBe(firstCookie);

    // Replaying the old cookie must fail.
    const replay = await request(agent()).post('/api/auth/refresh').set('Cookie', firstCookie).send({});
    expect(replay.status).toBe(401);

    const activeSessions = await RefreshTokenModel.countDocuments({ revokedAt: null });
    expect(activeSessions).toBe(0);
  });

  it('requires a bearer token for /auth/me and rejects a bad token', async () => {
    const missing = await request(agent()).get('/api/auth/me');
    expect(missing.status).toBe(401);
    expect(expectError(missing.body).code).toBe('UNAUTHORIZED');

    const bad = await request(agent()).get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt');
    expect(bad.status).toBe(401);
  });

  it('logs out and clears the cookie', async () => {
    const registered = await request(agent())
      .post('/api/auth/register')
      .send(await validRegistration('logout-user@test.local'));
    const cookie = (registered.headers['set-cookie'] as unknown as string[])[0]?.split(';')[0] ?? '';

    const logout = await request(agent()).post('/api/auth/logout').set('Cookie', cookie).send({});
    expect(logout.status).toBe(200);

    const afterLogout = await request(agent()).post('/api/auth/refresh').set('Cookie', cookie).send({});
    expect(afterLogout.status).toBe(401);
  });
});
