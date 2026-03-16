import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateAssessmentDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  overallScore?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  riskLevel?: string;
}
