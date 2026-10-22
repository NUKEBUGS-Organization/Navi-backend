import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class DraftInitiativeDto {
  @ApiProperty({ description: 'A few sentences describing the change the user wants to make.' })
  @IsString()
  @MinLength(15)
  @MaxLength(3000)
  idea: string;

  @ApiProperty({ required: false, type: [String], description: "The organization's departments to choose from." })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  departments?: string[];
}
