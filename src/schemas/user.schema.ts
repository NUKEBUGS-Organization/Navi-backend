import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ enum: ['admin', 'member'], default: 'member' })
  role: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Department' }] })
  departments: Types.ObjectId[];

  @Prop({ default: true })
  isActive: boolean;

}

export const UserSchema = SchemaFactory.createForClass(User);