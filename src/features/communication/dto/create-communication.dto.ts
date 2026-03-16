import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateCommunicationDto {
  @ApiProperty()
  @IsString()
  initiativeId: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty({ required: false, enum: ['Email', 'Meeting', 'Newsletter', 'Workshop', 'Other'] })
  @IsOptional()
  @IsIn(['Email', 'Meeting', 'Newsletter', 'Workshop', 'Other'])
  type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  audience?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  scheduledDate?: string;

  @ApiProperty({ required: false, enum: ['Planned', 'Scheduled', 'Sent', 'Completed', 'Cancelled'] })
  @IsOptional()
  @IsIn(['Planned', 'Scheduled', 'Sent', 'Completed', 'Cancelled'])
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  message?: string;
}
