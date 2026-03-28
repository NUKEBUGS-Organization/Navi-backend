import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose from 'mongoose';

@Schema({ timestamps: true })
export class PasswordResetOtp {
  @ApiProperty()
  _id: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @ApiProperty()
  @Prop({ required: true })
  codeHash: string;

  @ApiProperty()
  @Prop({ required: true })
  expiresAt: Date;

  @ApiProperty()
  @Prop({ default: 0 })
  attempts: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export const PasswordResetOtpSchema = SchemaFactory.createForClass(PasswordResetOtp);
PasswordResetOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
PasswordResetOtpSchema.index({ email: 1 });
