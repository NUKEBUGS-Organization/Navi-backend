import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';

export type SignupLeadStatus = 'new' | 'converted';

@Schema({ timestamps: true })
export class OrganizationSignupLead {
  @Prop({ required: true })
  organizationName: string;

  @Prop({ required: true })
  organizationContact: string;

  /** Single contact email used for organization correspondence and admin login when provisioned. */
  @Prop({ required: true })
  email: string;

  @Prop()
  phoneNumber?: string;

  @Prop()
  city?: string;

  @Prop()
  country?: string;

  @Prop()
  industry?: string;

  @Prop()
  employeeCount?: string;

  /** How they heard about NAVI (Referral, LinkedIn, etc.). */
  @Prop()
  hearAboutUs?: string;

  @Prop({ default: 'new' })
  status: SignupLeadStatus;
}

export type OrganizationSignupLeadDocument = OrganizationSignupLead & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const OrganizationSignupLeadSchema = SchemaFactory.createForClass(OrganizationSignupLead);
