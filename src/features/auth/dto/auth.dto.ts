import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../user.entity';
import mongoose from 'mongoose';

export class CreateUserDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  password: string;

  @ApiProperty({ enum: UserRole, required: false })
  role?: UserRole;

  @ApiProperty({ type: String, required: false })
  organizationId?: mongoose.Types.ObjectId;

  @ApiProperty({ type: [String], required: false })
  departments?: mongoose.Types.ObjectId[];

  @ApiProperty({ required: false })
  isActive?: boolean;
}

export class UpdateUserDto {
  @ApiProperty({ required: false })
  name?: string;

  @ApiProperty({ required: false })
  email?: string;

  @ApiProperty({ required: false })
  password?: string;

  @ApiProperty({ enum: UserRole, required: false })
  role?: UserRole;

  @ApiProperty({ type: String, required: false })
  organizationId?: mongoose.Types.ObjectId;

  @ApiProperty({ type: [String], required: false })
  departments?: mongoose.Types.ObjectId[];

  @ApiProperty({ required: false })
  isActive?: boolean;
}

export class SignupDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  password: string;
}

export class LoginDto {
  @ApiProperty()
  email: string;

  @ApiProperty()
  password: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  email: string;

  @ApiProperty()
  newPassword: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  email: string;

  @ApiProperty()
  oldPassword: string;

  @ApiProperty()
  newPassword: string;
}

