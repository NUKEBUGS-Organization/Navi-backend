import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ActivityLogDocument = ActivityLog & Document;

@Schema({ timestamps: true })
export class ActivityLog {

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization' })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Initiative' })
  initiativeId: Types.ObjectId;

  @Prop({ required: true })
  action: string;

  @Prop()
  description: string;

}

export const ActivityLogSchema =
  SchemaFactory.createForClass(ActivityLog);