import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateStakeholderDto {
  @ApiProperty()
  @IsString()
  initiativeId: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiProperty({ required: false, enum: ['High', 'Medium', 'Low'] })
  @IsOptional()
  @IsIn(['High', 'Medium', 'Low'])
  influence?: string;

  @ApiProperty({ required: false, enum: ['Champion', 'Supporter', 'Neutral', 'Resistant'] })
  @IsOptional()
  @IsIn(['Champion', 'Supporter', 'Neutral', 'Resistant'])
  support?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
