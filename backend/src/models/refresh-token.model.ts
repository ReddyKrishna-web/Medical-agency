import { Schema, model, models, type Model, type Types } from 'mongoose';

/** One row per issued refresh token; enables rotation, revocation and reuse detection. */
export interface IRefreshToken {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  userId: Types.ObjectId;
  jti: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  revokedReason?: string;
  replacedByJti?: string;
  userAgent?: string;
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jti: { type: String, required: true, unique: true, index: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    revokedReason: { type: String, trim: true, maxlength: 120 },
    replacedByJti: { type: String },
    userAgent: { type: String, trim: true, maxlength: 300 },
    ip: { type: String, trim: true, maxlength: 64 }
  },
  { timestamps: true, versionKey: false }
);

// Mongo removes the document once the refresh token is genuinely expired.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ userId: 1, revokedAt: 1 });

export const RefreshTokenModel: Model<IRefreshToken> =
  (models.RefreshToken as Model<IRefreshToken>) ??
  model<IRefreshToken>('RefreshToken', refreshTokenSchema);

export default RefreshTokenModel;
