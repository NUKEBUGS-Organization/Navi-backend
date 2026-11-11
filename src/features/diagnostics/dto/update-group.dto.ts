import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateGroupDto {
  @ApiProperty({ enum: ['open', 'resolved'] })
  @IsIn(['open', 'resolved'])
  status: 'open' | 'resolved';
}
