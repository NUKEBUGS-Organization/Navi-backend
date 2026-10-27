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

  /** User who created the initiative. A DRAFT is visible only to admins and its creator. */
  @ApiProperty({ required: false })
  @Prop({ type: mongoose.Schema.Types.ObjectId, required: false })
  createdById?: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ required: true })
  title: string;

  @ApiProperty({ required: false })
  @Prop({ default: '' })
  description?: string;

  @ApiProperty({ enum: ['DRAFT', 'WAITING_FOR_APPROVAL', 'ACTIVE', 'COMPLETED', 'PLANNING'] })
  @Prop({ default: 'DRAFT' })
  status: InitiativeStatus;

  /**
   * Change lead's display name. When `leadUserId` is set this is only a cached copy: reads replace it
   * with the user's current name (see InitiativeService.withLiveLeadNames), so renames show everywhere.
   */
  @ApiProperty()
  @Prop({ required: true, default: '' })
  leadName: string;

  /** The change lead's user ID — the source of truth for who leads the initiative. */
  @ApiProperty({ required: false, type: String })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, index: true })
  leadUserId?: mongoose.Types.ObjectId;

  /** Executive / change sponsor (display name). */
  @ApiProperty({ required: false })
  @Prop({ default: '' })
  sponsorName?: string;

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

  /** Risk & compliance flags surfaced in the initiative overview and Risk Monitoring pre-flight checklist. */
  @ApiProperty({ required: false, default: false, description: 'Initiative has Health, Safety & Environment implications' })
  @Prop({ default: false })
  hseImpact?: boolean;

  @ApiProperty({ required: false, default: false, description: 'Initiative has food safety implications' })
  @Prop({ default: false })
  foodSafetyImpact?: boolean;

  @ApiProperty({ type: [Object] })
  @Prop({ type: [GoalSchema], default: [] })
  goals: { goal?: string; metric?: string }[];

  @ApiProperty({ type: [Object], required: false })
  @Prop({ type: [FaqSchema], default: [] })
  faqs: { question?: string; answer?: string }[];

  /** Set when an admin archives the initiative (soft delete). See utils/archive.ts. */
  @ApiProperty({ required: false, type: Date, nullable: true })
  @Prop({ type: Date, default: null, index: true })
  archivedAt?: Date | null;

  @ApiProperty({ required: false })
  @Prop({ type: mongoose.Schema.Types.ObjectId, required: false })
  archivedById?: mongoose.Types.ObjectId;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

const InitiativeSchema = SchemaFactory.createForClass(Initiative);
export { InitiativeSchema };
