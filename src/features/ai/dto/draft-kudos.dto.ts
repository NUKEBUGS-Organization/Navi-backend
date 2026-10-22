import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

export class DraftKudosDto {
  @ApiProperty()
  @IsMongoId()
  initiativeId: string;

  @ApiProperty()
  @IsMongoId()
  employeeId: string;

  @ApiProperty({ required: false, description: 'Optional rough note to polish.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  roughNote?: string;

  @ApiProperty({ required: false, enum: ['Warm', 'Formal', 'Enthusiastic'] })
  @IsOptional()
  @IsIn(['Warm', 'Formal', 'Enthusiastic'])
  tone?: string;
}
