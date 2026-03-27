import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendTestMailDto {
  @ApiProperty({ example: 'qa.recipient@example.com' })
  @IsEmail()
  to: string;

  @ApiPropertyOptional({ example: 'NAVI — SendGrid test' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;
}
