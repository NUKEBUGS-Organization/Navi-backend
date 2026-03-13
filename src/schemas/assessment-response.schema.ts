import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AssessmentResponseDocument = AssessmentResponse & Document;

@Schema({ timestamps: true })
export class AssessmentResponse {

  @Prop({ type: Types.ObjectId, ref: 'Assessment', required: true })
  assessmentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AssessmentQuestion', required: true })
  questionId: Types.ObjectId;

  @Prop({ min: 1, max: 5, required: true })
  score: number;

}

export const AssessmentResponseSchema =
  SchemaFactory.createForClass(AssessmentResponse);