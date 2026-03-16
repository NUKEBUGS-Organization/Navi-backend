import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { Task } from './task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InitiativeService } from '../initiative/initiative.service';

function statusFromProgress(progress: number): Task['status'] {
  if (progress >= 100) return 'Completed';
  if (progress > 0) return 'In Progress';
  return 'Not Started';
}

@Injectable()
export class TaskService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<Task>,
    private readonly initiativeService: InitiativeService,
  ) {}

  async create(dto: CreateTaskDto, organizationId: string): Promise<Task> {
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const initId = new mongoose.Types.ObjectId(dto.initiativeId);
    const assigneeId = new mongoose.Types.ObjectId(dto.assigneeId);
    const progress = dto.progress ?? 0;
    const status = statusFromProgress(progress);
    const doc = await this.taskModel.create({
      initiativeId: initId,
      organizationId: orgId,
      title: dto.title,
      description: dto.description ?? '',
      phase: (dto.phase as Task['phase']) ?? 'Discovery',
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      assigneeId,
      status,
      progress,
      isBlocked: dto.isBlocked ?? false,
    });
    await this.recalcInitiativeProgress(dto.initiativeId, organizationId);
    return doc.toObject?.() ?? (doc as unknown as Task);
  }

  async findByInitiative(initiativeId: string, organizationId: string): Promise<Task[]> {
    const initId = new mongoose.Types.ObjectId(initiativeId);
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const list = await this.taskModel
      .find({ initiativeId: initId, organizationId: orgId })
      .sort({ createdAt: -1 })
      .populate('assigneeId', 'name')
      .lean()
      .exec();
    return this.mapTasksWithAssigneeName(list as Array<Task & { assigneeId: { _id: mongoose.Types.ObjectId; name: string } | mongoose.Types.ObjectId }>);
  }

  async findByOrganization(organizationId: string): Promise<Task[]> {
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const list = await this.taskModel
      .find({ organizationId: orgId })
      .sort({ createdAt: -1 })
      .populate('assigneeId', 'name')
      .lean()
      .exec();
    return this.mapTasksWithAssigneeName(list as Array<Task & { assigneeId: { _id: mongoose.Types.ObjectId; name: string } | mongoose.Types.ObjectId }>);
  }

  private mapTasksWithAssigneeName(
    list: Array<Task & { assigneeId: { _id: mongoose.Types.ObjectId; name: string } | mongoose.Types.ObjectId }>,
  ): Array<Task & { assigneeName?: string }> {
    return list.map((doc) => {
      const assignee = doc.assigneeId;
      const id = typeof assignee === 'object' && assignee !== null && '_id' in assignee
        ? (assignee as { _id: mongoose.Types.ObjectId })._id?.toString?.()
        : (assignee as mongoose.Types.ObjectId)?.toString?.() ?? String(assignee);
      const name = typeof assignee === 'object' && assignee !== null && 'name' in assignee
        ? (assignee as { name: string }).name
        : undefined;
      return { ...doc, assigneeId: id as unknown as mongoose.Types.ObjectId, assigneeName: name };
    }) as Array<Task & { assigneeName?: string }>;
  }

  async findOne(id: string, organizationId: string): Promise<Task | null> {
    const taskId = new mongoose.Types.ObjectId(id);
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const doc = await this.taskModel
      .findOne({ _id: taskId, organizationId: orgId })
      .lean()
      .exec();
    return doc as Task | null;
  }

  async update(
    id: string,
    dto: UpdateTaskDto,
    organizationId: string,
    userId: string,
    userRole?: string,
  ): Promise<Task | null> {
    const task = await this.findOne(id, organizationId);
    if (!task) return null;
    const assigneeStr = (task.assigneeId as mongoose.Types.ObjectId)?.toString?.() ?? (task.assigneeId as unknown as string);
    const isAssignee = assigneeStr === userId;
    const isEmployee = userRole === 'employee';

    if (isEmployee) {
      if (!isAssignee) return null;
      const updates: Partial<Task> = {};
      if (dto.progress !== undefined) {
        updates.progress = Math.min(100, Math.max(0, dto.progress));
        updates.status = statusFromProgress(updates.progress);
      }
      if (Object.keys(updates).length === 0) return task as Task | null;
      const taskId = new mongoose.Types.ObjectId(id);
      const orgId = new mongoose.Types.ObjectId(organizationId);
      const updated = await this.taskModel
        .findOneAndUpdate({ _id: taskId, organizationId: orgId }, { $set: updates }, { new: true })
        .lean()
        .exec();
      const initiativeId = (task.initiativeId as mongoose.Types.ObjectId)?.toString?.() ?? (task.initiativeId as unknown as string);
      await this.recalcInitiativeProgress(initiativeId, organizationId);
      return updated as Task | null;
    }

    const updates: Partial<Task> = {};
    if (dto.title !== undefined) updates.title = dto.title;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.phase !== undefined) updates.phase = dto.phase as Task['phase'];
    if (dto.dueDate !== undefined) updates.dueDate = dto.dueDate ? new Date(dto.dueDate) : undefined;
    if (dto.assigneeId !== undefined) updates.assigneeId = new mongoose.Types.ObjectId(dto.assigneeId) as unknown as mongoose.Types.ObjectId;
    if (dto.progress !== undefined) {
      updates.progress = Math.min(100, Math.max(0, dto.progress));
      updates.status = statusFromProgress(updates.progress);
    }
    if (dto.status !== undefined && dto.progress === undefined) updates.status = dto.status as Task['status'];
    if (dto.isBlocked !== undefined) updates.isBlocked = dto.isBlocked;
    const taskId = new mongoose.Types.ObjectId(id);
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const updated = await this.taskModel
      .findOneAndUpdate({ _id: taskId, organizationId: orgId }, { $set: updates }, { new: true })
      .lean()
      .exec();
    const initiativeId = (task.initiativeId as mongoose.Types.ObjectId)?.toString?.() ?? (task.initiativeId as unknown as string);
    await this.recalcInitiativeProgress(initiativeId, organizationId);
    return updated as Task | null;
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    const task = await this.findOne(id, organizationId);
    if (!task) return false;
    const taskId = new mongoose.Types.ObjectId(id);
    const orgId = new mongoose.Types.ObjectId(organizationId);
    await this.taskModel.deleteOne({ _id: taskId, organizationId: orgId }).exec();
    const initiativeId = (task.initiativeId as mongoose.Types.ObjectId)?.toString?.() ?? (task.initiativeId as unknown as string);
    await this.recalcInitiativeProgress(initiativeId, organizationId);
    return true;
  }

  private async recalcInitiativeProgress(initiativeId: string, organizationId: string): Promise<void> {
    const initId = new mongoose.Types.ObjectId(initiativeId);
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const tasks = await this.taskModel.find({ initiativeId: initId, organizationId: orgId }).lean().exec();
    if (tasks.length === 0) {
      await this.initiativeService.updateProgress(initiativeId, organizationId, 0);
      return;
    }
    const total = tasks.reduce((sum, t) => sum + ((t as Task).progress ?? 0), 0);
    const avg = Math.round(total / tasks.length);
    await this.initiativeService.updateProgress(initiativeId, organizationId, avg);
  }
}
