import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateManagerKudosDto {
  @ApiProperty()
  @IsMongoId()
  initiativeId!: string;

  @ApiProperty()
  @IsMongoId()
  employeeId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
