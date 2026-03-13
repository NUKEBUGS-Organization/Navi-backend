import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OrganizationDocument = Organization & Document;

@Schema({ timestamps: true })
export class Organization {

  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop()
  industry: string;

  @Prop()
  logo: string;

}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);