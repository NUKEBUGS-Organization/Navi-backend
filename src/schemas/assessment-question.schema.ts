import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AssessmentQuestionDocument = AssessmentQuestion & Document;

@Schema({ timestamps: true })
export class AssessmentQuestion {

  @Prop({ required: true })
  question: string;

  @Prop({ required: true })
  category: string;

}

export const AssessmentQuestionSchema =
  SchemaFactory.createForClass(AssessmentQuestion);