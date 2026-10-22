import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';

/** Cached embedding of one Knowledge Hub entry; recomputed when the entry's text (contentHash) or model changes. */
@Schema({ timestamps: true, collection: 'ai_embeddings' })
export class AiEmbedding {
  _id: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  organizationId: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  initiativeId: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  entryId: mongoose.Types.ObjectId;

  @Prop({ required: true })
  contentHash: string;

  @Prop({ required: true })
  model: string;

  @Prop({ type: [Number], required: true })
  vector: number[];
}

export const AiEmbeddingSchema = SchemaFactory.createForClass(AiEmbedding);
AiEmbeddingSchema.index({ entryId: 1 }, { unique: true });
AiEmbeddingSchema.index({ organizationId: 1, initiativeId: 1 });
