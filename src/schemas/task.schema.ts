import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TaskDocument = Task & Document;

@Schema({ timestamps: true })
export class Task {

  @Prop({ type: Types.ObjectId, ref: 'Initiative', required: true })
  initiativeId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'RoadmapPhase', required: true })
  phaseId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  ownerId: Types.ObjectId;

  @Prop()
  dueDate: Date;

  @Prop({ enum: ['pending', 'in-progress', 'completed'], default: 'pending' })
  status: string;

  @Prop({ default: 0 })
  progress: number;

}

export const TaskSchema = SchemaFactory.createForClass(Task);