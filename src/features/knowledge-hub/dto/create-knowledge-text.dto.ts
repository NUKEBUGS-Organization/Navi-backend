import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateKnowledgeTextDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text: string;
}
