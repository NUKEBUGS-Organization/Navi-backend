import { PartialType } from '@nestjs/swagger';
import { CreateStakeholderDto } from './create-stakeholder.dto';
import { IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateStakeholderDto extends PartialType(CreateStakeholderDto) {
  @ApiProperty({ required: false })
  @IsOptional()
  initiativeId?: string;
}
