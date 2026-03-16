import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose from 'mongoose';

export type OrganizationStatus = 'ACTIVE' | 'PENDING' | 'DISABLED';

@Schema({ timestamps: true })
export class Organization {
  @ApiProperty({ type: String })
  _id: mongoose.Types.ObjectId;

  @ApiProperty()
  @Prop({ required: true })
  name: string;

  @ApiProperty({ required: false })
  @Prop()
  description?: string;

  @ApiProperty({ required: false })
  @Prop()
  industry?: string;

  @ApiProperty({ required: false })
  @Prop()
  logo?: string;

  @ApiProperty({ required: false })
  @Prop()
  ownerName?: string;

  @ApiProperty({ required: false })
  @Prop()
  email?: string;

  @ApiProperty({ required: false })
  @Prop()
  phoneNumber?: string;

  @ApiProperty({ required: false })
  @Prop()
  city?: string;

  @ApiProperty({ required: false })
  @Prop()
  country?: string;

  @ApiProperty({ required: false })
  @Prop({ default: 0 })
  employeeCount?: number;

  /** Department names for this organization (e.g. Engineering, HR, Sales). */
  @ApiProperty({ type: [String], required: false })
  @Prop({ type: [String], default: [] })
  departments?: string[];

  /** User IDs (employees) belonging to this organization. */
  @ApiProperty({ type: [String], required: false })
  @Prop({ type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] })
  employees?: mongoose.Types.ObjectId[];

  /** User IDs (managers) belonging to this organization. */
  @ApiProperty({ type: [String], required: false })
  @Prop({ type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] })
  managers?: mongoose.Types.ObjectId[];

  @ApiProperty({ enum: ['ACTIVE', 'PENDING', 'DISABLED'] })
  @Prop({ default: 'ACTIVE' })
  status?: OrganizationStatus;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

const OrganizationSchema = SchemaFactory.createForClass(Organization);
export { OrganizationSchema };
