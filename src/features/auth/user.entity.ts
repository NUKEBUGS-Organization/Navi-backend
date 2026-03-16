import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose from 'mongoose';

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  MANAGER = 'manager',
  EMPLOYEE = 'employee',
}

@Schema({ timestamps: true })
export class User {
  @ApiProperty({ type: String })
  _id: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop()
  name: string;

  @ApiProperty()
  @Prop()
  email: string;

  @ApiProperty()
  @Prop({ select: false })
  password: string;

  @ApiProperty({ enum: UserRole })
  @Prop({ required: true })
  role: UserRole;

  @ApiProperty({ type: String, required: false })
  @Prop({ required: false })
  organizationId?: mongoose.Types.ObjectId;

  @ApiProperty({ type: [String], required: false })
  @Prop({ type: [String], required: false, default: [] })
  departments?: string[];

  @ApiProperty({ required: false })
  @Prop({ default: true })
  isActive?: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

const UserSchema = SchemaFactory.createForClass(User);

export { UserSchema };
