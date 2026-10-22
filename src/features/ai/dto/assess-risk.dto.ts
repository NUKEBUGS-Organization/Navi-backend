import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AssessRiskDto {
  @ApiProperty()
  @IsString()
  initiativeId: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;
}
