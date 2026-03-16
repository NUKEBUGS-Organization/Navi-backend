import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose from 'mongoose';

export type CommunicationType = 'Email' | 'Meeting' | 'Newsletter' | 'Workshop' | 'Other';
export type CommunicationStatus = 'Planned' | 'Scheduled' | 'Sent' | 'Completed' | 'Cancelled';

@Schema({ timestamps: true })
export class Communication {
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

  @ApiProperty({ enum: ['Email', 'Meeting', 'Newsletter', 'Workshop', 'Other'] })
  @Prop({ default: 'Email' })
  type?: CommunicationType;

  @ApiProperty({ required: false })
  @Prop({ default: '' })
  audience?: string;

  @ApiProperty({ required: false })
  @Prop()
  scheduledDate?: Date;

  @ApiProperty({ enum: ['Planned', 'Scheduled', 'Sent', 'Completed', 'Cancelled'] })
  @Prop({ default: 'Planned' })
  status?: CommunicationStatus;

  @ApiProperty({ required: false })
  @Prop({ default: '' })
  message?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export const CommunicationSchema = SchemaFactory.createForClass(Communication);
CommunicationSchema.index({ initiativeId: 1, createdAt: -1 });
CommunicationSchema.index({ organizationId: 1 });
