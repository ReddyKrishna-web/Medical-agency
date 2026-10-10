import bcrypt from 'bcryptjs';
import mongoose, { type HydratedDocument, type Types } from 'mongoose';
import { env } from '../config/env';
import { UserModel, type IUser } from '../models/user.model';
import { CustomerModel } from '../models/customer.model';
import { SalesmanModel } from '../models/salesman.model';
import { AgencyModel } from '../models/agency.model';
import { CounterModel } from '../models/counter.model';
import { AppError, ErrorCode } from '../utils/errors';
import { hashToken, randomToken } from '../utils/crypto';
import { emailPatterns } from '../utils/email';
import { nextSequence } from './counter.service';
import { issueSession, revokeAllSessions, type IssuedSession, type SessionMetadata } from './token.service';
import { createNotificationSafe, resolveAdminUserIds } from './notification.service';
import { recordActivity } from './activity.service';
import { sendAccountApprovedEmail, sendAccountRejectedEmail, sendPasswordResetEmail } from './email.service';
import { passwordPolicyViolation } from '../utils/password-policy';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 8;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export type AccountType = 'MEDICAL_SHOP' | 'SALESMAN';

export interface RegisterInput {
  accountType: AccountType;
  agencyId: Types.ObjectId | string;
  name: string;
  email: string;
  phone: string;
  password: string;
  businessName?: string;
  ownerName?: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  gstNumber?: string;
  drugLicenseNumber?: string;
  shopType?: string;
  alternatePhone?: string;
  /** Salesman-only profile fields. */
  territory?: string;
  monthlyTarget?: number;
}

export interface UserSummary {
  /** Both identifier shapes are exposed so clients can use either. */
  _id: Types.ObjectId;
  id: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  role: string;
  status: string;
  mustChangePassword: boolean;
}

export interface AuthResult {
  user: UserSummary;
  session: IssuedSession;
  agencyId: Types.ObjectId;
  statusMessage: string;
}

const RESET_SELECT = '+passwordHash +passwordResetTokenHash +passwordResetExpiresAt';

const findUserWithSecrets = (filter: Record<string, unknown>) =>
  UserModel.findOne(filter).select(RESET_SELECT).exec();

/** Reset-link fields live on the user document; only the token hash is stored. */
type IUserWithReset = IUser & {
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date;
};

export const hashPassword = async (plain: string): Promise<string> =>
  bcrypt.hash(plain, env.isTest ? 4 : env.BCRYPT_ROUNDS);

export const verifyPassword = async (plain: string, hash: string): Promise<boolean> => {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
};

const buildUserSummary = (user: IUser): UserSummary => ({
  _id: user._id,
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  status: user.status,
  mustChangePassword: user.mustChangePassword
});

/**
 * Public self-registration. The applicant selects the agency they belong to.
 * There is no approval gate: the account is created ACTIVE inside that agency's
 * tenant and can transact immediately. The role is derived server side from
 * `accountType`: a client can never escalate to AGENCY_ADMIN through this route.
 */
export const registerAccount = async (input: RegisterInput): Promise<AuthResult> => {
  const email = input.email.trim().toLowerCase();
  const violation = passwordPolicyViolation(input.password);
  if (violation) throw new AppError(422, ErrorCode.WEAK_PASSWORD, violation);

  const existing = await UserModel.findOne({ email }).select('_id').exec();
  if (existing) {
    throw new AppError(409, ErrorCode.DUPLICATE_RESOURCE, 'An account with this email address already exists');
  }

  const agency = await AgencyModel.findOne({
    _id: new mongoose.Types.ObjectId(String(input.agencyId)),
    status: 'ACTIVE'
  })
    .select('_id name')
    .exec();
  if (!agency) {
    throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'Selected agency is not available. Choose another agency.');
  }
  const agencyId = agency._id;
  const isShop = input.accountType === 'MEDICAL_SHOP';
  const passwordHash = await hashPassword(input.password);

  const user = await UserModel.create({
    agencyId,
    name: input.name.trim(),
    email,
    phone: input.phone.trim(),
    passwordHash,
    // Role is derived from accountType, never taken from the request body.
    role: isShop ? 'CUSTOMER' : 'SALESMAN',
    // No approval gate: shops and salesmen can transact immediately.
    status: 'ACTIVE',
    tokenVersion: 0,
    mustChangePassword: false
  });

  const sequence = await nextSequence(agencyId, 'customer', new Date().getUTCFullYear());

  if (isShop) {
    await CustomerModel.create({
      agencyId,
      userId: user._id,
      businessName: (input.businessName || input.name).trim(),
      ownerName: (input.ownerName || input.name).trim(),
      phone: input.phone.trim(),
      alternatePhone: input.alternatePhone?.trim(),
      email,
      gstNumber: input.gstNumber?.trim().toUpperCase(),
      drugLicenseNumber: input.drugLicenseNumber?.trim(),
      shopType: input.shopType?.trim(),
      address: input.address,
      // Active straight away, matching the user account.
      status: 'ACTIVE',
      approvedAt: new Date(),
      statusNote: `Self registered (sequence ${sequence})`
    });
  } else {
    const employeeCode = `EMP-${Date.now().toString(36).toUpperCase()}`;
    await SalesmanModel.create({
      agencyId,
      userId: user._id,
      employeeCode,
      phone: input.phone.trim(),
      territory: input.territory?.trim(),
      monthlyTarget: input.monthlyTarget,
      // Active immediately; customers are assigned by the agency later.
      status: 'ACTIVE',
      customerIds: [],
      notes: 'Self-registered salesman; customer assignments are managed by the agency'
    });
  }

  await recordActivity({
    agencyId,
    actorUserId: user._id,
    actorRole: isShop ? 'CUSTOMER' : 'SALESMAN',
    action: 'auth.register',
    entity: 'User',
    entityId: user._id,
    summary: `${isShop ? 'Medical shop' : 'Salesman'} registered with ${agency.name}`,
    meta: { email, accountType: input.accountType }
  });

  for (const adminId of await resolveAdminUserIds(agencyId)) {
    createNotificationSafe({
      agencyId,
      userId: adminId,
      type: 'SYSTEM',
      title: isShop ? 'New shop registered' : 'New salesman registered',
      message: `${(input.businessName || input.name).trim()} (${user.email}) joined ${isShop ? 'as a customer' : 'as a salesman'}${isShop ? '' : ' — assign customers to them'}`,
      data: { status: 'ACTIVE', accountType: input.accountType },
      entityType: 'User',
      entityId: user._id
    });
  }

  const session = await issueSession(user, {});
  return {
    user: buildUserSummary(user),
    session,
    agencyId,
    statusMessage: isShop
      ? 'Welcome! Your shop is active — you can start ordering right away.'
      : 'Welcome! Your salesman account is active — waiting for customer assignments from the agency.'
  };
};

export interface AgencyRegisterInput {
  agencyName: string;
  email: string;
  phone: string;
  password: string;
  contactName?: string;
  gstNumber?: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
}

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80) || 'agency';

/**
 * Agency self-registration. The workspace goes live immediately: the applicant
 * becomes its ACTIVE AGENCY_ADMIN and can sign in without an approval gate.
 * Commercial defaults come from the schema defaults; the admin tunes them later.
 */
export const registerAgency = async (input: AgencyRegisterInput): Promise<AuthResult> => {
  const email = input.email.trim().toLowerCase();
  const violation = passwordPolicyViolation(input.password);
  if (violation) throw new AppError(422, ErrorCode.WEAK_PASSWORD, violation);

  const existing = await UserModel.findOne({ email }).select('_id').exec();
  if (existing) {
    throw new AppError(409, ErrorCode.DUPLICATE_RESOURCE, 'An account with this email address already exists');
  }

  const baseSlug = slugify(input.agencyName.trim());
  const slug = `${baseSlug}-${randomToken(3)}`;
  const passwordHash = await hashPassword(input.password);

  const agency = await AgencyModel.create({
    name: input.agencyName.trim(),
    slug,
    status: 'ACTIVE',
    contact: {
      email,
      phone: input.phone.trim(),
      address: input.address
    },
    tax: { gstNumber: input.gstNumber?.trim().toUpperCase() }
  });

  const user = await UserModel.create({
    agencyId: agency._id,
    name: (input.contactName || input.agencyName).trim(),
    email,
    phone: input.phone.trim(),
    passwordHash,
    role: 'AGENCY_ADMIN',
    status: 'ACTIVE',
    tokenVersion: 0,
    mustChangePassword: false
  });

  agency.createdBy = user._id;
  await agency.save();

  await recordActivity({
    agencyId: agency._id,
    actorUserId: user._id,
    actorRole: 'AGENCY_ADMIN',
    action: 'agency.register',
    entity: 'Agency',
    entityId: agency._id,
    summary: `Agency ${agency.name} self-registered`,
    meta: { email, slug: agency.slug }
  });

  const session = await issueSession(user, {});
  return {
    user: buildUserSummary(user),
    session,
    agencyId: agency._id,
    statusMessage: 'Your agency workspace is ready. You are signed in as its administrator.'
  };
};

export interface LoginInput {
  email: string;
  password: string;
}

export const login = async (
  input: LoginInput,
  meta: SessionMetadata
): Promise<AuthResult & { agency: { name: string; slug: string } }> => {
  const email = input.email.trim().toLowerCase();
  const user = await UserModel.findOne({ email }).select('+passwordHash').exec();

  if (!user) {
    // Do not disclose whether the address exists.
    throw AppError.unauthorized('Invalid email or password', ErrorCode.INVALID_CREDENTIALS);
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new AppError(
      429,
      ErrorCode.RATE_LIMITED,
      'Account is temporarily locked after repeated failed sign-in attempts'
    );
  }

  const passwordOk = await verifyPassword(input.password, user.passwordHash);
  if (!passwordOk) {
    user.failedLoginCount = (user.failedLoginCount ?? 0) + 1;
    if (user.failedLoginCount >= MAX_FAILED_LOGINS) {
      user.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      user.failedLoginCount = 0;
    }
    await user.save();
    throw AppError.unauthorized('Invalid email or password', ErrorCode.INVALID_CREDENTIALS);
  }

  if (user.status === 'DISABLED') {
    throw new AppError(403, ErrorCode.ACCOUNT_DISABLED, 'This account has been disabled. Contact the agency.');
  }
  if (user.status === 'PENDING') {
    const customer = await CustomerModel.findOne({ agencyId: user.agencyId, userId: user._id })
      .select('status statusNote')
      .lean<{ status: string; statusNote?: string }>();
    if (customer?.status === 'REJECTED') {
      throw new AppError(403, ErrorCode.ACCOUNT_PENDING, 'Your application was not approved. Please contact the agency.');
    }
    throw new AppError(403, ErrorCode.ACCOUNT_PENDING, 'Your account is pending agency approval');
  }

  user.failedLoginCount = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  const session = await issueSession(user, meta);
  await recordActivity({
    agencyId: user.agencyId,
    actorUserId: user._id,
    actorRole: user.role,
    action: 'auth.login',
    entity: 'User',
    entityId: user._id,
    summary: `${user.email} signed in`,
    ip: meta.ip,
    userAgent: meta.userAgent
  });

  const agency = await AgencyModel.findById(user.agencyId).select('name slug').lean<{ name: string; slug: string }>();

  return {
    user: buildUserSummary(user),
    session,
    agencyId: user.agencyId,
    statusMessage: 'Signed in',
    agency: agency ?? { name: 'Agency', slug: 'agency' }
  };
};

export interface ForgotPasswordResult {
  message: string;
  /** Development only: lets a local tester complete the flow without SMTP. */
  devResetToken?: string;
}

const DEV_RESET_TOKEN_ENABLED = env.isDevelopment && env.EMAIL_CONFIG === 'console';

export const requestPasswordReset = async (rawEmail: string): Promise<ForgotPasswordResult> => {
  // Always the same response: no user enumeration.
  const genericMessage =
    'If an account exists for that email address, a password reset link has been sent. Check your inbox.';

  const email = rawEmail.trim().toLowerCase();
  if (!emailPatterns.email.test(email)) return { message: genericMessage };

  const user = (await findUserWithSecrets({ email })) as HydratedDocument<IUserWithReset> | null;
  if (!user || user.status === 'DISABLED') {
    return { message: genericMessage };
  }

  const token = randomToken(32);
  user.passwordResetTokenHash = hashToken(token);
  user.passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await user.save();

  await sendPasswordResetEmail(user.email, user.name, token);
  await recordActivity({
    agencyId: user.agencyId,
    actorUserId: user._id,
    actorRole: user.role,
    action: 'auth.password_reset_requested',
    entity: 'User',
    entityId: user._id,
    summary: 'Password reset requested'
  });

  return DEV_RESET_TOKEN_ENABLED ? { message: genericMessage, devResetToken: token } : { message: genericMessage };
};

export const resetPassword = async (rawToken: string, newPassword: string): Promise<void> => {
  const genericFailure = AppError.badRequest('This password reset link is invalid or has expired');

  if (!rawToken || rawToken.length < 20) throw genericFailure;

  const violation = passwordPolicyViolation(newPassword);
  if (violation) throw new AppError(422, ErrorCode.WEAK_PASSWORD, violation);

  const tokenHash = hashToken(rawToken.trim());
  const user = (await findUserWithSecrets({ passwordResetTokenHash: tokenHash })) as
    | HydratedDocument<IUserWithReset>
    | null;

  if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() <= Date.now()) {
    throw genericFailure;
  }

  user.passwordHash = await hashPassword(newPassword);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  user.passwordChangedAt = new Date();
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  user.mustChangePassword = false;
  user.failedLoginCount = 0;
  user.lockedUntil = undefined;
  await user.save();

  await revokeAllSessions(user._id, 'PASSWORD_RESET');
  await recordActivity({
    agencyId: user.agencyId,
    actorUserId: user._id,
    actorRole: user.role,
    action: 'auth.password_reset_completed',
    entity: 'User',
    entityId: user._id,
    summary: 'Password reset completed; all sessions revoked'
  });
};

export const changePassword = async (
  user: HydratedDocument<IUser>,
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  const stored = await findUserWithSecrets({ _id: user._id });
  if (!stored) throw AppError.notFound('User');

  const current = stored.passwordHash as string;
  const ok = await verifyPassword(currentPassword, current);
  if (!ok) throw AppError.unauthorized('Current password is incorrect', ErrorCode.INVALID_CREDENTIALS);

  const violation = passwordPolicyViolation(newPassword);
  if (violation) throw new AppError(422, ErrorCode.WEAK_PASSWORD, violation);

  if (await verifyPassword(newPassword, current)) {
    throw AppError.badRequest('The new password must be different from the current password');
  }

  stored.passwordHash = await hashPassword(newPassword);
  stored.passwordChangedAt = new Date();
  stored.tokenVersion = (stored.tokenVersion ?? 0) + 1;
  stored.mustChangePassword = false;
  await stored.save();

  await revokeAllSessions(user._id, 'PASSWORD_CHANGE');
  await recordActivity({
    agencyId: user.agencyId,
    actorUserId: user._id,
    actorRole: user.role,
    action: 'auth.password_changed',
    entity: 'User',
    entityId: user._id,
    summary: 'Password changed; all sessions revoked'
  });
};

export const updateOwnProfile = async (
  user: HydratedDocument<IUser>,
  patch: { name?: string; phone?: string; avatarUrl?: string }
): Promise<HydratedDocument<IUser>> => {
  if (patch.name !== undefined) user.name = patch.name.trim();
  if (patch.phone !== undefined) user.phone = patch.phone.trim();
  if (patch.avatarUrl !== undefined) user.avatarUrl = patch.avatarUrl;
  await user.save();
  return user;
};

export const setCustomerApproval = async (
  admin: HydratedDocument<IUser>,
  customerId: Types.ObjectId,
  decision: 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'DISABLED',
  note?: string
): Promise<{ customerId: Types.ObjectId; status: string }> => {
  const customer = await CustomerModel.findOne({ agencyId: admin.agencyId, _id: customerId }).exec();
  if (!customer) throw AppError.notFound('Customer');

  const user = await UserModel.findOne({ agencyId: admin.agencyId, _id: customer.userId }).exec();
  if (!user) throw AppError.notFound('Customer account');

  const now = new Date();
  if (decision === 'APPROVED' || decision === 'ACTIVE') {
    customer.status = decision;
    customer.approvedAt = now;
    customer.approvedBy = admin._id;
    customer.statusNote = note?.trim() || 'Approved by agency';
    user.status = 'ACTIVE';
  } else if (decision === 'REJECTED') {
    customer.status = 'REJECTED';
    customer.statusNote = note?.trim() || 'Rejected by agency';
    user.status = 'DISABLED';
  } else {
    customer.status = 'DISABLED';
    customer.statusNote = note?.trim() || 'Disabled by agency';
    user.status = 'DISABLED';
  }
  customer.updatedBy = admin._id;
  user.updatedBy = admin._id;

  await Promise.all([customer.save(), user.save()]);
  await revokeAllSessions(user._id, `ACCOUNT_${decision}`);

  createNotificationSafe({
    agencyId: admin.agencyId,
    userId: user._id,
    type: decision === 'REJECTED' || decision === 'DISABLED' ? 'ACCOUNT_REJECTED' : 'ACCOUNT_APPROVED',
    title: decision === 'APPROVED' || decision === 'ACTIVE' ? 'Account approved' : 'Account update',
    message:
      decision === 'APPROVED' || decision === 'ACTIVE'
        ? 'Your account is active. You can now sign in and place orders.'
        : `Your account status is now ${decision}.${note ? ` Note: ${note}` : ''}`,
    data: { status: decision },
    entityType: 'Customer',
    entityId: customer._id
  });

  if (decision === 'APPROVED' || decision === 'ACTIVE') {
    await sendAccountApprovedEmail(user.email, user.name);
  } else if (decision === 'REJECTED') {
    await sendAccountRejectedEmail(user.email, user.name, note);
  }

  await recordActivity({
    agencyId: admin.agencyId,
    actorUserId: admin._id,
    actorRole: admin.role,
    action: `customer.status.${decision.toLowerCase()}`,
    entity: 'Customer',
    entityId: customer._id,
    summary: `Customer ${customer.businessName} set to ${decision}`,
    meta: { note }
  });

  return { customerId: customer._id, status: customer.status };
};

export const updateSalesmanStatus = async (
  admin: HydratedDocument<IUser>,
  salesmanId: Types.ObjectId,
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
  note?: string
): Promise<{ salesmanId: Types.ObjectId; status: string }> => {
  const salesman = await SalesmanModel.findOne({ agencyId: admin.agencyId, _id: salesmanId }).exec();
  if (!salesman) throw AppError.notFound('Salesman');

  const user = await UserModel.findOne({ agencyId: admin.agencyId, _id: salesman.userId }).exec();
  if (!user) throw AppError.notFound('Salesman account');

  salesman.status = status;
  salesman.notes = note?.trim() || salesman.notes;
  salesman.updatedBy = admin._id;
  user.status = status === 'ACTIVE' ? 'ACTIVE' : 'DISABLED';
  user.updatedBy = admin._id;

  await Promise.all([salesman.save(), user.save()]);
  if (status !== 'ACTIVE') await revokeAllSessions(user._id, `SALESMAN_${status}`);

  createNotificationSafe({
    agencyId: admin.agencyId,
    userId: user._id,
    type: 'SYSTEM',
    title: 'Account status updated',
    message: `Your salesman account status is now ${status}.`,
    data: { status }
  });

  await recordActivity({
    agencyId: admin.agencyId,
    actorUserId: admin._id,
    actorRole: admin.role,
    action: `salesman.status.${status.toLowerCase()}`,
    entity: 'Salesman',
    entityId: salesman._id,
    summary: `Salesman ${salesman.employeeCode} set to ${status}`
  });

  return { salesmanId: salesman._id, status };
};

export const cleanupExpiredCounters = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
  const result = await CounterModel.deleteMany({ updatedAt: { $lt: cutoff } }).exec();
  return result.deletedCount ?? 0;
};
