import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose from 'mongoose';
import type {
  ErrorKind,
  ErrorSeverity,
  ErrorSource,
} from './diagnostics.types';

@Schema({ timestamps: true })
export class ErrorGroup {
  @ApiProperty({ type: String })
  _id: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: String, required: true, unique: true })
  fingerprint: string;

  @ApiProperty({ enum: ['server', 'client'] })
  @Prop({ type: String, required: true })
  source: ErrorSource;

  @ApiProperty({ enum: ['error', 'warning'] })
  @Prop({ type: String, required: true })
  severity: ErrorSeverity;

  @ApiProperty()
  @Prop({ type: String, required: true })
  kind: ErrorKind;

  @ApiProperty()
  @Prop({ type: String, required: true })
  name: string;

  /** Normalized message (max 500 chars). */
  @ApiProperty()
  @Prop({ type: String, required: true })
  message: string;

  @ApiProperty({ required: false })
  @Prop({ type: Number, required: false })
  statusCode?: number;

  @ApiProperty({ required: false })
  @Prop({ type: String, required: false })
  route?: string;

  @ApiProperty()
  @Prop({ type: Number, default: 0 })
  count: number;

  /** Distinct, capped at 500 entries. */
  @ApiProperty({ type: [String] })
  @Prop({ type: [mongoose.Schema.Types.ObjectId], default: [] })
  affectedUserIds: mongoose.Types.ObjectId[];

  /** Distinct, capped at 500 entries. */
  @ApiProperty({ type: [String] })
  @Prop({ type: [mongoose.Schema.Types.ObjectId], default: [] })
  affectedOrgIds: mongoose.Types.ObjectId[];

  @ApiProperty({ type: [String] })
  @Prop({ type: [String], default: [] })
  roles: string[];

  @ApiProperty()
  @Prop({ type: Date, required: true })
  firstSeen: Date;

  @ApiProperty()
  @Prop({ type: Date, required: true, index: true })
  lastSeen: Date;

  @ApiProperty({ enum: ['open', 'resolved'] })
  @Prop({
    type: String,
    enum: ['open', 'resolved'],
    default: 'open',
    index: true,
  })
  status: 'open' | 'resolved';

  @ApiProperty({ required: false })
  @Prop({ type: Date, required: false })
  resolvedAt?: Date;

  @ApiProperty({ required: false })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false })
  resolvedBy?: mongoose.Types.ObjectId;
}

export const ErrorGroupSchema = SchemaFactory.createForClass(ErrorGroup);
