import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateRiskDto {
  @ApiProperty()
  @IsString()
  initiativeId: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, enum: ['Low', 'Medium', 'High', 'Critical'] })
  @IsOptional()
  @IsIn(['Low', 'Medium', 'High', 'Critical'])
  severity?: string;

  @ApiProperty({ required: false, enum: ['Open', 'Mitigating', 'Resolved', 'Closed'] })
  @IsOptional()
  @IsIn(['Open', 'Mitigating', 'Resolved', 'Closed'])
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  mitigationNotes?: string;
}
