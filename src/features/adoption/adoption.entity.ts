import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose from 'mongoose';

export type AdoptionStatus = 'Not Started' | 'In Progress' | 'Achieved' | 'At Risk';

@Schema({ timestamps: true })
export class Adoption {
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
  milestone: string;

  @ApiProperty({ required: false })
  @Prop()
  targetDate?: Date;

  @ApiProperty({ enum: ['Not Started', 'In Progress', 'Achieved', 'At Risk'] })
  @Prop({ default: 'Not Started' })
  status?: AdoptionStatus;

  @ApiProperty({ required: false })
  @Prop({ default: 0 })
  percentAdopted?: number;

  /** Target adoption % for this milestone (e.g. 50 or 100). Progress is derived from linked tasks. */
  @ApiProperty({ required: false })
  @Prop({ default: 100 })
  targetPercent?: number;

  @ApiProperty({ required: false })
  @Prop({ default: '' })
  notes?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export const AdoptionSchema = SchemaFactory.createForClass(Adoption);
AdoptionSchema.index({ initiativeId: 1, createdAt: -1 });
AdoptionSchema.index({ organizationId: 1 });
