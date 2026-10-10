import { Schema, model, models, type Model, type Types } from 'mongoose';
import { tenantPlugin, applyJsonTransform } from './plugins/tenant.plugin';

export interface IMessage {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  /** Deterministic pair key: the two user ids sorted and joined. */
  conversationKey: string;
  senderId: Types.ObjectId;
  receiverId: Types.ObjectId;
  body: string;
  orderId?: Types.ObjectId;
  orderReference?: string;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    conversationKey: { type: String, required: true, maxlength: 60 },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    orderReference: { type: String, trim: true, maxlength: 64 },
    readAt: { type: Date }
  },
  { timestamps: true, versionKey: false }
);

messageSchema.index({ agencyId: 1, conversationKey: 1, createdAt: -1 });
messageSchema.index({ agencyId: 1, receiverId: 1, readAt: 1, createdAt: -1 });
messageSchema.index({ agencyId: 1, senderId: 1, createdAt: -1 });
messageSchema.index({ agencyId: 1, orderId: 1 });

messageSchema.plugin(tenantPlugin);

applyJsonTransform(messageSchema, {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret.__v;
    return ret;
  }
});

export const MessageModel: Model<IMessage> =
  (models.Message as Model<IMessage>) ?? model<IMessage>('Message', messageSchema);

export default MessageModel;
