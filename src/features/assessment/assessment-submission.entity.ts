import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose from 'mongoose';

@Schema({ timestamps: true })
export class AssessmentSubmission {
  @ApiProperty({ type: String })
  _id: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true })
  assessmentId: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  initiativeId: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  organizationId: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  userId: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ required: true })
  overallScore: number;

  @ApiProperty({ required: false })
  @Prop({ default: '' })
  riskLevel?: string;

  /** 1–5 per flattened assessment question (same order as steps/questions). */
  @ApiProperty({ type: [Number], required: false })
  @Prop({ type: [Number], default: [] })
  answers?: number[];

  @ApiProperty({ required: false })
  @Prop()
  naviN?: number;

  @ApiProperty({ required: false })
  @Prop()
  naviA?: number;

  @ApiProperty({ required: false })
  @Prop()
  naviV?: number;

  @ApiProperty({ required: false })
  @Prop()
  naviI?: number;

  @ApiProperty({ required: false })
  @Prop()
  naviIndex?: number;

  /** Unweighted (N+A+V+I)/4; classification still uses weighted `naviIndex`. */
  @ApiProperty({ required: false })
  @Prop()
  naviIndexSimple?: number;

  @ApiProperty({ required: false })
  @Prop({ default: '' })
  naviClassification?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export const AssessmentSubmissionSchema = SchemaFactory.createForClass(AssessmentSubmission);

// One submission per user per assessment (allow re-submit: use latest or allow multiple - we allow multiple so we keep history)
AssessmentSubmissionSchema.index({ assessmentId: 1, userId: 1 });
AssessmentSubmissionSchema.index({ organizationId: 1, createdAt: -1 });
AssessmentSubmissionSchema.index({ initiativeId: 1 });
