import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsIn,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class InitiativeFaqDto {
  @ApiProperty()
  @IsString()
  question: string;

  @ApiProperty()
  @IsString()
  answer: string;
}

export class InitiativeGoalDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  metric?: string;
}

export class CreateInitiativeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['ACTIVE', 'DRAFT', 'PLANNING'], required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  leadName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  dateRange?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  departments?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  readiness?: string;

  @ApiProperty({
    required: false,
    enum: [
      'Tech/Digital',
      'ERP system change',
      'Cultural transformation',
      'Department restructuring',
      'Full company restructuring',
      'Merger/acquisition',
      'Other',
    ],
  })
  @IsOptional()
  @IsIn([
    'Tech/Digital',
    'ERP system change',
    'Cultural transformation',
    'Department restructuring',
    'Full company restructuring',
    'Merger/acquisition',
    'Other',
  ])
  changeType?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  raciAccountableIds?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  raciResponsibleIds?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  raciConsultedIds?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  raciInformedIds?: string[];

  @ApiProperty({ type: [InitiativeGoalDto], required: false })
  @IsOptional()
  @IsArray()
  goals?: { goal?: string; metric?: string }[];

  @ApiProperty({ type: [InitiativeFaqDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InitiativeFaqDto)
  faqs?: InitiativeFaqDto[];
}
