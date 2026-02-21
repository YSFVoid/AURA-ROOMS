import { Schema, model, type Document } from 'mongoose';
import { SafeLimits } from '../../config/safeLimits.js';

export interface IUserAbuseState extends Document {
  guildId: string;
  userId: string;
  lastCreateAt?: Date;
  activeRoomCount: number;
  joinLeaveEvents: Date[];
}

const userAbuseStateSchema = new Schema<IUserAbuseState>(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    lastCreateAt: { type: Date },
    activeRoomCount: { type: Number, required: true, default: 0, min: 0 },
    joinLeaveEvents: {
      type: [Date],
      required: true,
      default: [],
      validate: {
        validator: (value: Date[]) => value.length <= SafeLimits.JOIN_LEAVE_EVENTS_CAP,
        message: 'joinLeaveEvents exceeds allowed size',
      },
    },
  },
  { timestamps: true, strict: true },
);

userAbuseStateSchema.index({ guildId: 1, userId: 1 }, { unique: true });

export const UserAbuseState = model<IUserAbuseState>('UserAbuseState', userAbuseStateSchema);
