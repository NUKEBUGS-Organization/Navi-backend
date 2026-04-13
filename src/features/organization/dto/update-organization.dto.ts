import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateOrganizationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ required: false, description: 'Organization logo as data URL or HTTPS URL' })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  employeeCount?: number;

  @ApiProperty({ required: false, description: 'Cap on employees (super admin); admins cannot set via PATCH /me.' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxEmployeeSeats?: number;

  @ApiProperty({ type: [String], required: false, description: 'Department names' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  departments?: string[];
}
