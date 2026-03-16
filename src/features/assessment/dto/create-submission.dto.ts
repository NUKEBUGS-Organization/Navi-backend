import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

export class CreateSubmissionDto {
  @ApiProperty()
  @IsString()
  assessmentId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(5)
  overallScore: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  riskLevel?: string;
}
