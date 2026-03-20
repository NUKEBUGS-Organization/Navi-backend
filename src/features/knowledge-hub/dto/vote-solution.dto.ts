import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty } from 'class-validator';

export class VoteSolutionDto {
  @ApiProperty({ enum: ['up', 'down'] })
  @IsNotEmpty()
  @IsIn(['up', 'down'])
  direction: 'up' | 'down';
}

