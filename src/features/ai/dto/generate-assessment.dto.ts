import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class GenerateAssessmentDto {
  @ApiProperty({ required: false, description: 'Initiative to tailor questions to.' })
  @IsOptional()
  @IsString()
  initiativeId?: string;

  @ApiProperty({ enum: ['Leadership', 'Employees'] })
  @IsIn(['Leadership', 'Employees'])
  audience: string;

  @ApiProperty({ enum: ['Pre-change', 'During change', 'Post-change'] })
  @IsIn(['Pre-change', 'During change', 'Post-change'])
  stage: string;

  @ApiProperty({ minimum: 2, maximum: 8 })
  @IsInt()
  @Min(2)
  @Max(8)
  questionsPerPillar: number;

  @ApiProperty({ required: false, description: 'Anything to emphasize, e.g. "training readiness".' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  focus?: string;
}
