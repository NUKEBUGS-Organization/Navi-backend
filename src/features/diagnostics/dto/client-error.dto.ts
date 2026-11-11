import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const CLIENT_ERROR_KINDS = [
  'render',
  'window_error',
  'promise_rejection',
  'network',
] as const;

export class ClientErrorReportDto {
  @IsIn(CLIENT_ERROR_KINDS)
  kind: (typeof CLIENT_ERROR_KINDS)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsString()
  @MaxLength(5000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  componentStack?: string;

  @IsString()
  @MaxLength(2000)
  pageUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  appVersion?: string;
}

export class ClientErrorBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ClientErrorReportDto)
  reports: ClientErrorReportDto[];
}
