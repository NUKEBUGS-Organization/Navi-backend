import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose from 'mongoose';

export type KudosContributionType =
  | 'task_completed'
  | 'task_comment'
  | 'assessment_submitted'
  | 'manager_award';

@Schema({ timestamps: true })
export class KudosContribution {
  @ApiProperty({ type: String })
  _id: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Initiative', required: true })
  initiativeId: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  organizationId: mongoose.Types.ObjectId;

  /** The employee who receives the stars. */
  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  employeeId: mongoose.Types.ObjectId;

  @ApiProperty({
    enum: ['task_completed', 'task_comment', 'assessment_submitted', 'manager_award'],
  })
  @Prop({ type: String, required: true })
  contributionType: KudosContributionType;

  /** References for the contribution itself (one of these will typically be set). */
  @ApiProperty({ required: false })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: false })
  taskId?: mongoose.Types.ObjectId;

  @ApiProperty({ required: false })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'TaskComment', required: false })
  commentId?: mongoose.Types.ObjectId;

  @ApiProperty({ required: false })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentSubmission', required: false })
  assessmentSubmissionId?: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ required: true, default: 1 })
  systemStars: number;

  /** Manager-added star (0 or 1). */
  @ApiProperty({ required: true, default: 0 })
  @Prop({ required: true, default: 0 })
  managerStars: number;

  @ApiProperty({ required: false })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false })
  managerId?: mongoose.Types.ObjectId;

  /** Cached labels so manager UI doesn't need extra joins. */
  @ApiProperty({ required: false })
  @Prop({ type: String, required: false })
  contributionTitle?: string;

  @ApiProperty({ required: false })
  @Prop({ type: String, required: false })
  contributionSubtitle?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const KudosContributionSchema = SchemaFactory.createForClass(KudosContribution);

KudosContributionSchema.index({ initiativeId: 1, createdAt: -1 });
KudosContributionSchema.index({ organizationId: 1, employeeId: 1, createdAt: -1 });
KudosContributionSchema.index({ organizationId: 1, contributionType: 1, createdAt: -1 });

