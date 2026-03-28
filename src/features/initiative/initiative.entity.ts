import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose from 'mongoose';

// NOTE: PLANNING is kept for backward compatibility with older data.
export type InitiativeStatus =
  | 'DRAFT'
  | 'WAITING_FOR_APPROVAL'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'PLANNING';

export type ChangeType =
  | 'Tech/Digital'
  | 'ERP system change'
  | 'Cultural transformation'
  | 'Department restructuring'
  | 'Full company restructuring'
  | 'Merger/acquisition'
  | 'Other';

const GoalSchema = {
  goal: { type: String, default: '' },
  metric: { type: String, default: '' },
};

const FaqSchema = {
  question: { type: String, default: '' },
  answer: { type: String, default: '' },
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

  @ApiProperty({ enum: ['DRAFT', 'WAITING_FOR_APPROVAL', 'ACTIVE', 'COMPLETED', 'PLANNING'] })
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

  /**
   * When false, adoption milestone documents remain in the database but no longer affect
   * initiative progress or employee-facing adoption views until re-enabled.
   */
  @ApiProperty({ required: false, default: true })
  @Prop({ default: true })
  adoptionTrackingEnabled?: boolean;

  @ApiProperty({ required: false })
  @Prop({ default: '' })
  readiness?: string;

  @ApiProperty({ required: false, enum: ['Tech/Digital', 'ERP system change', 'Cultural transformation', 'Department restructuring', 'Full company restructuring', 'Merger/acquisition', 'Other'] })
  @Prop({ type: String, default: 'Other' })
  changeType?: ChangeType;

  // RACI (strings are internal collaborator user IDs)
  @ApiProperty({ required: false, type: [String] })
  @Prop({ type: [String], default: [] })
  raciAccountableIds: string[];

  @ApiProperty({ required: false, type: [String] })
  @Prop({ type: [String], default: [] })
  raciResponsibleIds: string[];

  @ApiProperty({ required: false, type: [String] })
  @Prop({ type: [String], default: [] })
  raciConsultedIds: string[];

  @ApiProperty({ required: false, type: [String] })
  @Prop({ type: [String], default: [] })
  raciInformedIds: string[];

  @ApiProperty({ type: [Object] })
  @Prop({ type: [GoalSchema], default: [] })
  goals: { goal?: string; metric?: string }[];

  @ApiProperty({ type: [Object], required: false })
  @Prop({ type: [FaqSchema], default: [] })
  faqs: { question?: string; answer?: string }[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

const InitiativeSchema = SchemaFactory.createForClass(Initiative);
export { InitiativeSchema };
