import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListGroupsQueryDto {
  @ApiPropertyOptional({ enum: ['error', 'all'], default: 'error' })
  @IsOptional()
  @IsIn(['error', 'all'])
  severity?: 'error' | 'all';

  @ApiPropertyOptional({ enum: ['server', 'client'] })
  @IsOptional()
  @IsIn(['server', 'client'])
  source?: 'server' | 'client';

  @ApiPropertyOptional({ enum: ['open', 'resolved', 'all'], default: 'open' })
  @IsOptional()
  @IsIn(['open', 'resolved', 'all'])
  status?: 'open' | 'resolved' | 'all';

  @ApiPropertyOptional({ description: 'Search message or route' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
