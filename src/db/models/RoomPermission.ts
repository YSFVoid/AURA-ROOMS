import { Schema, model, type Document } from 'mongoose';

export type RoomPermissionType = 'user' | 'role';
export type RoomPermissionAction = 'allow' | 'deny';

export interface IRoomPermission extends Document {
  channelId: string;
  type: RoomPermissionType;
  targetId: string;
  action: RoomPermissionAction;
}

const roomPermissionSchema = new Schema<IRoomPermission>(
  {
    channelId: { type: String, required: true, index: true },
    type: { type: String, required: true, enum: ['user', 'role'] },
    targetId: { type: String, required: true },
    action: { type: String, required: true, enum: ['allow', 'deny'] },
  },
  { timestamps: true, strict: true },
);

roomPermissionSchema.index({ channelId: 1, type: 1, targetId: 1 }, { unique: true });

export const RoomPermission = model<IRoomPermission>('RoomPermission', roomPermissionSchema);
