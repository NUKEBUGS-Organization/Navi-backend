import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AssessmentDocument = Assessment & Document;

@Schema({ timestamps: true })
export class Assessment {

  @Prop({ type: Types.ObjectId, ref: 'Initiative', required: true })
  initiativeId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop()
  overallScore: number;

  @Prop({ enum: ['Low', 'Medium', 'High'] })
  riskLevel: string;

  @Prop({ default: false })
  completed: boolean;

}

export const AssessmentSchema = SchemaFactory.createForClass(Assessment);