import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class DraftCommunicationDto {
  @ApiProperty()
  @IsString()
  initiativeId: string;

  @ApiProperty({ required: false, enum: ['Email', 'Meeting', 'Newsletter', 'Workshop', 'Other'] })
  @IsOptional()
  @IsIn(['Email', 'Meeting', 'Newsletter', 'Workshop', 'Other'])
  type?: string;

  @ApiProperty({ required: false, description: 'Who the message is for, e.g. "Frontline staff in Operations".' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  audience?: string;

  @ApiProperty({ required: false, enum: ['Formal', 'Friendly', 'Urgent', 'Inspiring'] })
  @IsOptional()
  @IsIn(['Formal', 'Friendly', 'Urgent', 'Inspiring'])
  tone?: string;

  @ApiProperty({ required: false, enum: ['Short', 'Medium', 'Long'] })
  @IsOptional()
  @IsIn(['Short', 'Medium', 'Long'])
  length?: string;

  @ApiProperty({ required: false, description: 'Extra guidance, e.g. "mention training starts May 3".' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  instructions?: string;

  @ApiProperty({ required: false, description: 'Existing draft to rewrite/improve instead of starting fresh.' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  existingMessage?: string;
}
