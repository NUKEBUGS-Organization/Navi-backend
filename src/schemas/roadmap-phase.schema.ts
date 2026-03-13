import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RoadmapPhaseDocument = RoadmapPhase & Document;

@Schema({ timestamps: true })
export class RoadmapPhase {

  @Prop({ type: Types.ObjectId, ref: 'Initiative', required: true })
  initiativeId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  order: number;

  @Prop({ default: 0 })
  progress: number;

}

export const RoadmapPhaseSchema =
  SchemaFactory.createForClass(RoadmapPhase);