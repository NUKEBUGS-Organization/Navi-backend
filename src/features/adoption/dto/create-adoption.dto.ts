import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateAdoptionDto {
  @ApiProperty()
  @IsString()
  initiativeId: string;

  @ApiProperty()
  @IsString()
  milestone: string;

  @ApiProperty({ required: false })
  @IsOptional()
  targetDate?: string;

  @ApiProperty({ required: false, enum: ['Not Started', 'In Progress', 'Achieved', 'At Risk'] })
  @IsOptional()
  @IsIn(['Not Started', 'In Progress', 'Achieved', 'At Risk'])
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentAdopted?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
