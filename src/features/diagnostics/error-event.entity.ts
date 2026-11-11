import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose from 'mongoose';

@Schema({ timestamps: true })
export class ErrorEvent {
  @ApiProperty({ type: String })
  _id: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ErrorGroup',
    required: true,
    index: true,
  })
  groupId: mongoose.Types.ObjectId;

  /** Occurrences expire after 30 days (TTL index). */
  @ApiProperty()
  @Prop({ type: Date, expires: 60 * 60 * 24 * 30 })
  createdAt: Date;

  @ApiProperty()
  @Prop({ type: String, required: true })
  message: string;

  @ApiProperty()
  @Prop({ type: String, required: true })
  name: string;

  @ApiProperty({ required: false })
  @Prop({ type: String, required: false })
  stack?: string;

  @ApiProperty({ required: false })
  @Prop({ type: String, required: false })
  componentStack?: string;

  @ApiProperty({ required: false })
  @Prop({ type: Number, required: false })
  statusCode?: number;

  @ApiProperty({ required: false })
  @Prop({ type: String, required: false })
  method?: string;

  @ApiProperty({ required: false })
  @Prop({ type: String, required: false })
  path?: string;

  @ApiProperty({ required: false })
  @Prop({ type: String, required: false })
  pageUrl?: string;

  @ApiProperty({ required: false })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false })
  userId?: mongoose.Types.ObjectId;

  @ApiProperty({ required: false })
  @Prop({ type: String, required: false })
  userRole?: string;

  @ApiProperty({ required: false })
  @Prop({ type: mongoose.Schema.Types.ObjectId, required: false })
  organizationId?: mongoose.Types.ObjectId;

  @ApiProperty({ required: false })
  @Prop({ type: String, required: false })
  userEmail?: string;

  @ApiProperty({ required: false })
  @Prop({ type: String, required: false })
  userAgent?: string;

  @ApiProperty({ required: false })
  @Prop({ type: String, required: false })
  ip?: string;

  @ApiProperty({ required: false })
  @Prop({ type: String, required: false })
  appVersion?: string;
}

export const ErrorEventSchema = SchemaFactory.createForClass(ErrorEvent);
