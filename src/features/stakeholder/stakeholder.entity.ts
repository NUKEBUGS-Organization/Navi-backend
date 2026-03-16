import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose from 'mongoose';

export type InfluenceLevel = 'High' | 'Medium' | 'Low';
export type SupportLevel = 'Champion' | 'Supporter' | 'Neutral' | 'Resistant';

@Schema({ timestamps: true })
export class Stakeholder {
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
  name: string;

  @ApiProperty({ required: false })
  @Prop({ default: '' })
  role?: string;

  @ApiProperty({ enum: ['High', 'Medium', 'Low'] })
  @Prop({ default: 'Medium' })
  influence?: InfluenceLevel;

  @ApiProperty({ enum: ['Champion', 'Supporter', 'Neutral', 'Resistant'] })
  @Prop({ default: 'Neutral' })
  support?: SupportLevel;

  @ApiProperty({ required: false })
  @Prop({ default: '' })
  notes?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export const StakeholderSchema = SchemaFactory.createForClass(Stakeholder);
StakeholderSchema.index({ initiativeId: 1, createdAt: -1 });
StakeholderSchema.index({ organizationId: 1 });
