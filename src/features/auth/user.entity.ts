import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose from 'mongoose';

export enum UserRole {
  EMPLOYEE = 'employee',
  ADMIN = 'admin',
  MANAGER = 'manager',
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
  @Prop()
  password: string;

  @ApiProperty({ enum: UserRole })
  @Prop()
  role: UserRole;

  @ApiProperty({ type: String })
  @Prop()
  organizationId: mongoose.Types.ObjectId;

  @ApiProperty({ type: [String] })
  @Prop([mongoose.Schema.Types.ObjectId])
  departments: mongoose.Types.ObjectId[];

  @ApiProperty()
  @Prop()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

const UserSchema = SchemaFactory.createForClass(User);

export { UserSchema };
