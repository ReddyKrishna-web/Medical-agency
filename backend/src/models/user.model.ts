import { Schema, model, models, type Model, type Types } from 'mongoose';
import { ROLES, USER_STATUSES, type Role, type UserStatus } from '../constants/domain';

export interface IUser {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date;
  role: Role;
  status: UserStatus;
  avatarUrl?: string;
  lastLoginAt?: Date;
  passwordChangedAt?: Date;
  /** Incremented on password change / global logout to invalidate old tokens. */
  tokenVersion: number;
  mustChangePassword: boolean;
  failedLoginCount: number;
  lockedUntil?: Date;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // Email is globally unique so login can never resolve to two tenants.
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 160,
      unique: true,
      index: true
    },
    phone: { type: String, trim: true, maxlength: 32 },
    passwordHash: { type: String, required: true, select: false },
    // Reset links are stored hashed with an expiry; the raw token is emailed.
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    role: { type: String, enum: ROLES, required: true, index: true },
    status: { type: String, enum: USER_STATUSES, default: 'PENDING', index: true },
    avatarUrl: { type: String, trim: true, maxlength: 500 },
    lastLoginAt: { type: Date },
    passwordChangedAt: { type: Date },
    tokenVersion: { type: Number, default: 0, min: 0 },
    mustChangePassword: { type: Boolean, default: false },
    failedLoginCount: { type: Number, default: 0, min: 0 },
    lockedUntil: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true, versionKey: false }
);

userSchema.index({ agencyId: 1, role: 1, status: 1 });
userSchema.index({ agencyId: 1, name: 1 });

userSchema.index(
  { agencyId: 1, name: 'text', email: 'text' },
  { name: 'agency_text_search', weights: { name: 5, email: 2 } }
);

export const UserModel: Model<IUser> = (models.User as Model<IUser>) ?? model<IUser>('User', userSchema);

export default UserModel;
