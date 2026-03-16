import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose from 'mongoose';

export type RiskSeverity = 'Low' | 'Medium' | 'High' | 'Critical';
export type RiskStatus = 'Open' | 'Mitigating' | 'Resolved' | 'Closed';

@Schema({ timestamps: true })
export class Risk {
  @ApiProperty({ type: String })
  _id: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Initiative', required: true })
  initiativeId: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  organizationId: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ required: true })
  title: string;

  @ApiProperty({ required: false })
  @Prop({ default: '' })
  description?: string;

  @ApiProperty({ enum: ['Low', 'Medium', 'High', 'Critical'] })
  @Prop({ default: 'Medium' })
  severity?: RiskSeverity;

  @ApiProperty({ enum: ['Open', 'Mitigating', 'Resolved', 'Closed'] })
  @Prop({ default: 'Open' })
  status?: RiskStatus;

  @ApiProperty({ required: false })
  @Prop({ default: '' })
  mitigationNotes?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export const RiskSchema = SchemaFactory.createForClass(Risk);
RiskSchema.index({ initiativeId: 1, createdAt: -1 });
RiskSchema.index({ organizationId: 1 });
RiskSchema.index({ organizationId: 1, severity: 1 });
RiskSchema.index({ organizationId: 1, status: 1 });
