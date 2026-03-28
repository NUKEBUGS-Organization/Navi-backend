import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { Task } from './task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InitiativeService } from '../initiative/initiative.service';
import { computeInitiativeProgressPercent } from '../initiative/initiative-progress.util';
import { Adoption } from '../adoption/adoption.entity';
import { KudosService } from '../kudos/kudos.service';

function statusFromProgress(progress: number): Task['status'] {
  if (progress >= 100) return 'Completed';
  if (progress > 0) return 'In Progress';
  return 'Not Started';
}

@Injectable()
export class TaskService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<Task>,
    @InjectModel('Adoption') private readonly adoptionModel: Model<Adoption>,
    private readonly initiativeService: InitiativeService,
    private readonly kudosService: KudosService,
  ) {}

  async create(dto: CreateTaskDto, organizationId: string): Promise<Task> {
    const initiative = await this.initiativeService.findOne(dto.initiativeId, organizationId);
    if (!initiative || initiative.status === 'DRAFT') {
      throw new HttpException(
        'Cannot add tasks to an initiative in Draft. An admin must set the initiative to Active first.',
        HttpStatus.FORBIDDEN,
      );
    }
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const initId = new mongoose.Types.ObjectId(dto.initiativeId);
    const assigneeId = new mongoose.Types.ObjectId(dto.assigneeId);
    const progress = dto.progress ?? 0;
    const status = statusFromProgress(progress);
    const adoptionMilestoneId = dto.adoptionMilestoneId ? new mongoose.Types.ObjectId(dto.adoptionMilestoneId) : undefined;
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
      adoptionMilestoneId,
    });
    if (adoptionMilestoneId) await this.recalcAdoptionProgress(adoptionMilestoneId.toString(), organizationId);
    await this.recalcInitiativeProgressWithAdoptions(dto.initiativeId, organizationId);
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
    const previousProgress = (task as Task).progress ?? 0;
    const initiativeIdStr = (task.initiativeId as mongoose.Types.ObjectId)?.toString?.() ?? (task.initiativeId as unknown as string);
    const initiative = await this.initiativeService.findOne(initiativeIdStr, organizationId);
    if (!initiative || initiative.status === 'DRAFT') {
      throw new HttpException(
        'Cannot update tasks for an initiative in Draft. An admin must set the initiative to Active first.',
        HttpStatus.FORBIDDEN,
      );
    }
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

      const nextProgress = updates.progress ?? previousProgress;
      const wasCompletedBefore = previousProgress >= 100;
      const isCompletedNow = nextProgress >= 100;
      if (!wasCompletedBefore && isCompletedNow) {
        // System kudos for completing a task.
        await this.kudosService.createSystemKudosForTaskCompletion({
          initiativeId: initiativeIdStr,
          organizationId,
          taskId: String(id),
          employeeId: String(userId),
          taskTitle: (task as Task).title,
        });
      }

      const initiativeId = (task.initiativeId as mongoose.Types.ObjectId)?.toString?.() ?? (task.initiativeId as unknown as string);
      const oldAdoptionId = (task as Task & { adoptionMilestoneId?: mongoose.Types.ObjectId }).adoptionMilestoneId?.toString?.();
      if (oldAdoptionId) await this.recalcAdoptionProgress(oldAdoptionId, organizationId);
      await this.recalcInitiativeProgressWithAdoptions(initiativeId, organizationId);
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
    if (dto.adoptionMilestoneId !== undefined) {
      updates.adoptionMilestoneId = dto.adoptionMilestoneId
        ? (new mongoose.Types.ObjectId(dto.adoptionMilestoneId) as unknown as mongoose.Types.ObjectId)
        : undefined;
    }
    const taskId = new mongoose.Types.ObjectId(id);
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const oldAdoptionId = (task as Task & { adoptionMilestoneId?: mongoose.Types.ObjectId }).adoptionMilestoneId?.toString?.();
    const updated = await this.taskModel
      .findOneAndUpdate({ _id: taskId, organizationId: orgId }, { $set: updates }, { new: true })
      .lean()
      .exec();
    const initiativeId = (task.initiativeId as mongoose.Types.ObjectId)?.toString?.() ?? (task.initiativeId as unknown as string);
    if (oldAdoptionId) await this.recalcAdoptionProgress(oldAdoptionId, organizationId);
    const newAdoptionId = (updated as Task & { adoptionMilestoneId?: mongoose.Types.ObjectId })?.adoptionMilestoneId?.toString?.();
    if (newAdoptionId && newAdoptionId !== oldAdoptionId) await this.recalcAdoptionProgress(newAdoptionId, organizationId);
    await this.recalcInitiativeProgressWithAdoptions(initiativeId, organizationId);
    return updated as Task | null;
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    const task = await this.findOne(id, organizationId);
    if (!task) return false;
    const adoptionId = (task as Task & { adoptionMilestoneId?: mongoose.Types.ObjectId }).adoptionMilestoneId?.toString?.();
    const taskId = new mongoose.Types.ObjectId(id);
    const orgId = new mongoose.Types.ObjectId(organizationId);
    await this.taskModel.deleteOne({ _id: taskId, organizationId: orgId }).exec();
    const initiativeId = (task.initiativeId as mongoose.Types.ObjectId)?.toString?.() ?? (task.initiativeId as unknown as string);
    if (adoptionId) await this.recalcAdoptionProgress(adoptionId, organizationId);
    await this.recalcInitiativeProgressWithAdoptions(initiativeId, organizationId);
    return true;
  }

  /** Recompute adoption.percentAdopted from linked tasks: completed ratio (0..100). */
  private async recalcAdoptionProgress(adoptionId: string, organizationId: string): Promise<void> {
    const adoption = await this.adoptionModel
      .findOne({ _id: new mongoose.Types.ObjectId(adoptionId), organizationId: new mongoose.Types.ObjectId(organizationId) })
      .lean()
      .exec();
    if (!adoption) return;
    const adoptionOid = new mongoose.Types.ObjectId(adoptionId);
    const linked = await this.taskModel
      .find({ adoptionMilestoneId: adoptionOid, organizationId: new mongoose.Types.ObjectId(organizationId) })
      .lean()
      .exec();
    const total = linked.length;
    const completed = linked.filter((t) => ((t as Task).progress ?? 0) >= 100).length;
    const percentAdopted = total === 0 ? 0 : Math.round((completed / total) * 100);
    await this.adoptionModel
      .updateOne(
        { _id: adoptionOid, organizationId: new mongoose.Types.ObjectId(organizationId) },
        { $set: { percentAdopted } },
      )
      .exec();
  }

  /** Recompute stored initiative progress from tasks + adoption milestones (see initiative-progress.util). */
  private async recalcInitiativeProgressWithAdoptions(initiativeId: string, organizationId: string): Promise<void> {
    const initId = new mongoose.Types.ObjectId(initiativeId);
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const initiative = await this.initiativeService.findOne(initiativeId, organizationId);
    const [tasks, adoptionsRaw] = await Promise.all([
      this.taskModel.find({ initiativeId: initId, organizationId: orgId }).lean().exec(),
      this.adoptionModel.find({ initiativeId: initId, organizationId: orgId }).lean().exec(),
    ]);
    const adoptions =
      initiative && (initiative as { adoptionTrackingEnabled?: boolean }).adoptionTrackingEnabled === false
        ? []
        : adoptionsRaw;
    const progress = computeInitiativeProgressPercent(tasks as Task[], adoptions as Adoption[]);
    await this.initiativeService.updateProgress(initiativeId, organizationId, progress);
  }

  /** Public so initiative GET (and others) can refresh stored progress after formula changes or stale data. */
  async refreshInitiativeProgress(initiativeId: string, organizationId: string): Promise<void> {
    await this.recalcInitiativeProgressWithAdoptions(initiativeId, organizationId);
  }

  /** Recompute progress for all initiatives in an organization. */
  async refreshOrganizationInitiativeProgress(organizationId: string): Promise<void> {
    const list = await this.initiativeService.findAllByOrganization(organizationId);
    await Promise.all(
      (list ?? [])
        .map((i) => {
          const raw = i as unknown as { _id?: { toString?: () => string }; id?: string };
          return raw._id?.toString?.() ?? raw.id ?? '';
        })
        .filter((id): id is string => Boolean(id))
        .map((initiativeId) => this.recalcInitiativeProgressWithAdoptions(initiativeId, organizationId)),
    );
  }
}
