import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose from 'mongoose';

const AssessmentStepSchema = {
  title: { type: String, default: '' },
  questions: [{ type: String }],
  /** Parallel to questions: N | A | V | I for NAVI scoring when submissions include per-question answers. */
  pillars: [{ type: String }],
};

@Schema({ timestamps: true })
export class Assessment {
  @ApiProperty({ type: String })
  _id: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  initiativeId: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  organizationId: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ required: true, default: '' })
  name: string;

  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, required: false })
  ownerId?: mongoose.Types.ObjectId;

  @ApiProperty({ required: false })
  @Prop({ required: false })
  dueDate?: Date;

  @ApiProperty({ required: false })
  @Prop({ default: '' })
  audience?: string;

  /** When audience is 'department', these are the department names who can take the assessment. */
  @ApiProperty({ type: [String], required: false })
  @Prop({ type: [String], default: [] })
  audienceDepartments?: string[];

  @ApiProperty({ required: false })
  @Prop({ default: '' })
  description?: string;

  @ApiProperty({ type: [Object] })
  @Prop({ type: [AssessmentStepSchema], default: [] })
  steps: { title: string; questions: string[] }[];

  @ApiProperty({ required: false })
  @Prop({ default: false })
  completed?: boolean;

  @ApiProperty({ required: false })
  @Prop({ required: false })
  overallScore?: number;

  @ApiProperty({ required: false })
  @Prop({ default: '' })
  riskLevel?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export const AssessmentSchema = SchemaFactory.createForClass(Assessment);
