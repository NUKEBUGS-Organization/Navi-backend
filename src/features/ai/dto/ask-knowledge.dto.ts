import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AskKnowledgeDto {
  @ApiProperty()
  @IsString()
  initiativeId: string;

  @ApiProperty({ description: 'Question or search query.' })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  question: string;
}
