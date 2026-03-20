import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose from 'mongoose';

export type KnowledgeSolutionVoteDirection = 'up' | 'down';

@Schema({ timestamps: true })
export class KnowledgeSolutionVote {
  @ApiProperty({ type: String })
  _id: mongoose.Types.ObjectId;

  @ApiProperty({ type: String })
  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  organizationId: mongoose.Types.ObjectId;

  @ApiProperty({ type: String })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeEntry', required: true })
  entryId: mongoose.Types.ObjectId;

  @ApiProperty({ type: String })
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  userId: mongoose.Types.ObjectId;

  @ApiProperty({ enum: ['up', 'down'] })
  @Prop({ type: String, enum: ['up', 'down'], required: true })
  direction: KnowledgeSolutionVoteDirection;
}

export const KnowledgeSolutionVoteSchema = SchemaFactory.createForClass(KnowledgeSolutionVote);

// Enforce "one vote per user per contribution"
KnowledgeSolutionVoteSchema.index({ organizationId: 1, entryId: 1, userId: 1 }, { unique: true });

