import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose from 'mongoose';

export type KnowledgeEntryKind = 'text' | 'file';

@Schema({ timestamps: true })
export class KnowledgeEntry {
  @ApiProperty({ type: String })
  _id: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true })
  organizationId: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Initiative', required: true })
  initiativeId: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  authorId: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ required: true, default: '' })
  authorName: string;

  @ApiProperty({ enum: ['text', 'file'] })
  @Prop({ type: String, required: true })
  kind: KnowledgeEntryKind;

  @ApiProperty({ required: false })
  @Prop({ type: String, default: '' })
  textBody?: string;

  /** Stored filename on disk (under uploads/knowledge). */
  @ApiProperty({ required: false })
  @Prop({ type: String, required: false })
  storedFileName?: string;

  @ApiProperty({ required: false })
  @Prop({ type: String, required: false })
  originalFileName?: string;

  @ApiProperty({ required: false })
  @Prop({ type: String, required: false })
  mimeType?: string;

  @ApiProperty({ required: false, default: 0 })
  @Prop({ type: Number, required: false, default: 0 })
  solutionUpvotes?: number;

  @ApiProperty({ required: false, default: 0 })
  @Prop({ type: Number, required: false, default: 0 })
  solutionDownvotes?: number;

  createdAt: Date;
  updatedAt: Date;
}

export const KnowledgeEntrySchema = SchemaFactory.createForClass(KnowledgeEntry);

KnowledgeEntrySchema.index({ organizationId: 1, initiativeId: 1, createdAt: -1 });
