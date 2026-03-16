import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose from 'mongoose';

export type InitiativeStatus = 'ACTIVE' | 'DRAFT' | 'PLANNING';

const GoalSchema = {
  goal: { type: String, default: '' },
  metric: { type: String, default: '' },
};

@Schema({ timestamps: true })
export class Initiative {
  @ApiProperty({ type: String })
  _id: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true })
  organizationId: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ required: true })
  title: string;

  @ApiProperty({ required: false })
  @Prop({ default: '' })
  description?: string;

  @ApiProperty({ enum: ['ACTIVE', 'DRAFT', 'PLANNING'] })
  @Prop({ default: 'DRAFT' })
  status: InitiativeStatus;

  @ApiProperty()
  @Prop({ required: true, default: '' })
  leadName: string;

  @ApiProperty()
  @Prop({ default: '' })
  dateRange: string;

  @ApiProperty({ type: [String] })
  @Prop({ type: [String], default: [] })
  departments: string[];

  @ApiProperty({ default: 0 })
  @Prop({ default: 0 })
  progress: number;

  @ApiProperty({ required: false })
  @Prop({ default: '' })
  readiness?: string;

  @ApiProperty({ type: [Object] })
  @Prop({ type: [GoalSchema], default: [] })
  goals: { goal?: string; metric?: string }[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

const InitiativeSchema = SchemaFactory.createForClass(Initiative);
export { InitiativeSchema };
