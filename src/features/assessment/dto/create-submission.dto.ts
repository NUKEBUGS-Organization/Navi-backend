import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

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

  @ApiProperty({
    type: [Number],
    required: false,
    description: '1–5 per question in flattened step order for NAVI pillar scoring',
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  answers?: number[];
}
