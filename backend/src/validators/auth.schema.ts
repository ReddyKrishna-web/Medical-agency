import { z } from 'zod';
import {
  addressSchema,
  emailField,
  passwordField,
  phoneField,
  objectId,
  optionalBoolean,
  trimmed
} from './common.schema';

/**
 * Account kinds a visitor can self-register as. Agencies register through a
 * dedicated endpoint; shops and salesmen register into an existing agency.
 */
export const ACCOUNT_TYPES = ['MEDICAL_SHOP', 'SALESMAN'] as const;

/**
 * Public registration for shops and salesmen. There is deliberately no `role`
 * or `status` field: a client cannot choose its own role. The tenant is the
 * agency the applicant selects, and the account starts PENDING either way.
 */
export const registerSchema = z
  .object({
    accountType: z.enum(ACCOUNT_TYPES),
    agencyId: objectId,
    name: trimmed(2, 120),
    email: emailField,
    phone: phoneField,
    password: passwordField,
    businessName: trimmed(2, 160).optional(),
    ownerName: trimmed(2, 120).optional(),
    alternatePhone: phoneField.optional(),
    address: addressSchema.optional(),
    gstNumber: trimmed(2, 32).optional(),
    drugLicenseNumber: trimmed(2, 64).optional(),
    shopType: trimmed(2, 80).optional(),
    territory: trimmed(2, 120).optional(),
    monthlyTarget: z.coerce.number().min(0).max(100_000_000).optional()
  })
  .superRefine((value, ctx) => {
    if (value.accountType !== 'MEDICAL_SHOP') return;
    if (!value.businessName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['businessName'], message: 'Enter the shop or organisation name' });
    }
    if (!value.address) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['address'], message: 'Enter the registered address' });
    }
  });

/**
 * Agency self-registration. The agency workspace is created immediately ACTIVE
 * and the applicant becomes its AGENCY_ADMIN with no pending gate.
 */
export const registerAgencySchema = z.object({
  agencyName: trimmed(2, 120),
  email: emailField,
  phone: phoneField,
  password: passwordField,
  contactName: trimmed(2, 120).optional(),
  gstNumber: trimmed(2, 32).optional(),
  address: addressSchema
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(200)
});

export const refreshSchema = z.object({}).passthrough();

export const forgotPasswordSchema = z.object({ email: emailField });

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(20).max(400),
  password: passwordField,
  confirmPassword: z.string().max(200).optional()
});

export const updateProfileSchema = z
  .object({
    name: trimmed(2, 120).optional(),
    phone: phoneField.optional(),
    avatarUrl: z.string().trim().url().max(500).optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordField
});

export const customerStatusSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'ACTIVE', 'DISABLED']),
  note: trimmed(2, 500).optional()
});

export const createCustomerSchema = z.object({
  name: trimmed(2, 120),
  email: emailField,
  phone: phoneField,
  password: passwordField,
  businessName: trimmed(2, 160),
  ownerName: trimmed(2, 120).optional(),
  alternatePhone: phoneField.optional(),
  address: addressSchema,
  gstNumber: trimmed(2, 32).optional(),
  drugLicenseNumber: trimmed(2, 64).optional(),
  shopType: trimmed(2, 80).optional(),
  creditLimit: z.coerce.number().min(0).max(10_000_000).optional(),
  assignedSalesmanId: objectId.optional(),
  status: z.enum(['PENDING', 'APPROVED', 'ACTIVE']).optional(),
  notes: trimmed(2, 1000).optional()
});

export const updateCustomerSchema = z
  .object({
    businessName: trimmed(2, 160).optional(),
    ownerName: trimmed(2, 120).optional(),
    phone: phoneField.optional(),
    alternatePhone: phoneField.optional(),
    gstNumber: trimmed(2, 32).optional(),
    drugLicenseNumber: trimmed(2, 64).optional(),
    shopType: trimmed(2, 80).optional(),
    address: addressSchema.partial().optional(),
    creditLimit: z.coerce.number().min(0).max(10_000_000).optional(),
    assignedSalesmanId: objectId.nullable().optional(),
    notes: trimmed(2, 1000).optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' });

export const customerNoteSchema = z.object({
  text: trimmed(2, 1000),
  type: z.enum(['NOTE', 'CALL']).default('NOTE')
});

export const salesmanStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  note: trimmed(2, 500).optional()
});

/**
 * Admin salesman onboarding. `password` is deliberately optional: when it is
 * omitted the server generates a strong temporary credential and returns it
 * exactly once, so an admin never has to invent or reuse a secret.
 */
export const createSalesmanSchema = z.object({
  name: trimmed(2, 120),
  email: emailField,
  phone: phoneField,
  password: passwordField.optional(),
  employeeCode: trimmed(2, 32).optional(),
  territory: trimmed(2, 120).optional(),
  monthlyTarget: z.coerce.number().min(0).max(100_000_000).optional(),
  notes: trimmed(2, 1000).optional()
});

export const updateSalesmanSchema = z
  .object({
    employeeCode: trimmed(2, 32).optional(),
    territory: trimmed(2, 120).optional(),
    phone: phoneField.optional(),
    monthlyTarget: z.coerce.number().min(0).max(100_000_000).optional(),
    notes: trimmed(2, 1000).optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' });

export const assignCustomersSchema = z.object({
  customerIds: z.array(objectId).max(500)
});

export const customerListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(120).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'DISABLED']).optional(),
  assignedSalesmanId: objectId.optional(),
  city: z.string().trim().max(80).optional(),
  self: optionalBoolean
});

export const salesmanListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(120).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  self: optionalBoolean
});
