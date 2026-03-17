import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateTaskDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, enum: ['Discovery', 'Awareness', 'Alignment', 'Implementation', 'Adoption', 'Reinforcement'] })
  @IsOptional()
  @IsIn(['Discovery', 'Awareness', 'Alignment', 'Implementation', 'Adoption', 'Reinforcement'])
  phase?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  dueDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiProperty({ required: false, enum: ['Not Started', 'In Progress', 'Completed', 'Blocked'] })
  @IsOptional()
  @IsIn(['Not Started', 'In Progress', 'Completed', 'Blocked'])
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  adoptionMilestoneId?: string;
}
