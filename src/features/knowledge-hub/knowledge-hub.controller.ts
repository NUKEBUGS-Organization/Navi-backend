import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../auth/user.entity';
import { KnowledgeHubService } from './knowledge-hub.service';
import { CreateKnowledgeTextDto } from './dto/create-knowledge-text.dto';
import { VoteSolutionDto } from './dto/vote-solution.dto';

function knowledgeUploadDir(): string {
  const dir = join(process.cwd(), 'uploads', 'knowledge');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

@ApiTags('knowledge')
@Controller('knowledge')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
@ApiBearerAuth()
export class KnowledgeHubController {
  constructor(private readonly knowledgeHubService: KnowledgeHubService) {}

  @Get('initiatives/:initiativeId/entries')
  async list(
    @CurrentUser() user: Partial<User>,
    @Param('initiativeId') initiativeId: string,
  ) {
    return this.knowledgeHubService.listEntries(user, initiativeId);
  }

  @Post('initiatives/:initiativeId/text')
  async addText(
    @CurrentUser() user: Partial<User>,
    @Param('initiativeId') initiativeId: string,
    @Body() dto: CreateKnowledgeTextDto,
  ) {
    return this.knowledgeHubService.addText(user, initiativeId, dto.text);
  }

  @Post('initiatives/:initiativeId/upload')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 30 * 1024 * 1024 },
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, knowledgeUploadDir());
        },
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async upload(
    @CurrentUser() user: Partial<User>,
    @Param('initiativeId') initiativeId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.knowledgeHubService.addFile(user, initiativeId, file);
  }

  @Get('entries/:entryId/file')
  async download(@CurrentUser() user: Partial<User>, @Param('entryId') entryId: string) {
    return this.knowledgeHubService.getFileForDownload(user, entryId);
  }

  @Post('entries/:entryId/vote-solution')
  async voteSolution(
    @CurrentUser() user: Partial<User>,
    @Param('entryId') entryId: string,
    @Body() dto: VoteSolutionDto,
  ) {
    return this.knowledgeHubService.voteSolution(user, entryId, dto.direction);
  }

  @Delete('entries/:entryId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async deleteEntry(
    @CurrentUser() user: Partial<User>,
    @Param('entryId') entryId: string,
  ) {
    return this.knowledgeHubService.deleteEntry(user, entryId);
  }
}
