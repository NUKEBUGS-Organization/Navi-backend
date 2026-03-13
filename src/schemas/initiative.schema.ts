import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InitiativeDocument = Initiative & Document;

@Schema({ timestamps: true })
export class Initiative {

  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  changeLead: Types.ObjectId;

  @Prop()
  startDate: Date;

  @Prop()
  endDate: Date;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Department' }] })
  impactedDepartments: Types.ObjectId[];

  @Prop({ type: [String] })
  goals: string[];

  @Prop({ type: [String] })
  successMeasures: string[];

  @Prop({ enum: ['active', 'completed', 'paused'], default: 'active' })
  status: string;

}

export const InitiativeSchema = SchemaFactory.createForClass(Initiative);