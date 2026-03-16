import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose from 'mongoose';

export type TaskStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Blocked';
export type TaskPhase = 'Discovery' | 'Awareness' | 'Alignment' | 'Implementation' | 'Adoption' | 'Reinforcement';

@Schema({ timestamps: true })
export class Task {
  @ApiProperty({ type: String })
  _id: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Initiative', required: true })
  initiativeId: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  organizationId: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ required: true })
  title: string;

  @ApiProperty({ required: false })
  @Prop({ default: '' })
  description?: string;

  @ApiProperty({ enum: ['Discovery', 'Awareness', 'Alignment', 'Implementation', 'Adoption', 'Reinforcement'] })
  @Prop({ default: 'Discovery' })
  phase?: TaskPhase;

  @ApiProperty({ required: false })
  @Prop()
  dueDate?: Date;

  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  assigneeId: mongoose.Types.ObjectId;

  @ApiProperty({ enum: ['Not Started', 'In Progress', 'Completed', 'Blocked'] })
  @Prop({ default: 'Not Started' })
  status: TaskStatus;

  @ApiProperty({ default: 0 })
  @Prop({ default: 0 })
  progress: number;

  @ApiProperty({ required: false })
  @Prop({ default: false })
  isBlocked?: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export const TaskSchema = SchemaFactory.createForClass(Task);
TaskSchema.index({ initiativeId: 1, createdAt: -1 });
TaskSchema.index({ organizationId: 1 });
TaskSchema.index({ assigneeId: 1 });
