import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TaskService } from './task.service';
import { TaskCommentService } from './task-comment.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../auth/user.entity';

function getOrgId(user: Partial<User>): string | undefined {
  const raw = (user as { organizationId?: { toString: () => string } }).organizationId;
  return raw?.toString?.() ?? (user as { organizationId?: string }).organizationId;
}

function getUserId(user: Partial<User>): string | undefined {
  const raw = (user as { _id?: { toString: () => string } })._id;
  return raw?.toString?.() ?? (user as { _id?: string })._id;
}

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TaskController {
  constructor(
    private readonly taskService: TaskService,
    private readonly taskCommentService: TaskCommentService,
  ) {}

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Post()
  async create(@Body() dto: CreateTaskDto, @CurrentUser() user: Partial<User>) {
    const orgId = getOrgId(user);
    if (!orgId) {
      throw new HttpException('Not linked to an organization.', HttpStatus.FORBIDDEN);
    }
    return this.taskService.create(dto, orgId);
  }

  @Get()
  async list(
    @Query('initiativeId') initiativeId: string,
    @CurrentUser() user: Partial<User>,
  ) {
    const orgId = getOrgId(user);
    if (!orgId) return [];
    if (initiativeId) {
      return this.taskService.findByInitiative(initiativeId, orgId);
    }
    return this.taskService.findByOrganization(orgId);
  }

  @Get(':id/comments')
  async listComments(@Param('id') taskId: string, @CurrentUser() user: Partial<User>) {
    const orgId = getOrgId(user);
    if (!orgId) return [];
    return this.taskCommentService.findByTask(taskId, orgId);
  }

  @Post(':id/comments')
  async addComment(
    @Param('id') taskId: string,
    @Body() dto: CreateTaskCommentDto,
    @CurrentUser() user: Partial<User>,
  ) {
    const orgId = getOrgId(user);
    const userId = getUserId(user);
    if (!orgId || !userId) {
      throw new HttpException('Not linked to an organization.', HttpStatus.FORBIDDEN);
    }
    const comment = await this.taskCommentService.create(taskId, orgId, userId, dto);
    if (!comment) {
      throw new HttpException('Task not found.', HttpStatus.NOT_FOUND);
    }
    return comment;
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: Partial<User>) {
    const orgId = getOrgId(user);
    if (!orgId) {
      throw new HttpException('Not linked to an organization.', HttpStatus.FORBIDDEN);
    }
    return this.taskService.findOne(id, orgId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: Partial<User>,
  ) {
    const orgId = getOrgId(user);
    const userId = getUserId(user);
    if (!orgId || !userId) {
      throw new HttpException('Not linked to an organization.', HttpStatus.FORBIDDEN);
    }
    return this.taskService.update(id, dto, orgId, userId, (user as { role?: string }).role);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: Partial<User>) {
    const orgId = getOrgId(user);
    if (!orgId) {
      throw new HttpException('Not linked to an organization.', HttpStatus.FORBIDDEN);
    }
    const deleted = await this.taskService.delete(id, orgId);
    if (!deleted) {
      throw new HttpException('Task not found.', HttpStatus.NOT_FOUND);
    }
    return { message: 'Task deleted.' };
  }
}
