import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AssessmentStepDto {
  @ApiProperty({ example: 'Leadership Alignment' })
  @IsString()
  title: string;

  @ApiProperty({ type: [String], example: ['Question 1?', 'Question 2?'] })
  @IsArray()
  @IsString({ each: true })
  questions: string[];

  @ApiProperty({
    type: [String],
    required: false,
    description: 'Parallel to questions: N, A, V, or I for NAVI scoring',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pillars?: string[];
}

export class CreateAssessmentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  initiativeId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  dueDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  audience?: string;

  @ApiProperty({ type: [String], required: false, description: 'When audience is "department", list of department names' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  audienceDepartments?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [AssessmentStepDto], required: false })
  @IsOptional()
  @IsArray()
  steps?: AssessmentStepDto[];
}
