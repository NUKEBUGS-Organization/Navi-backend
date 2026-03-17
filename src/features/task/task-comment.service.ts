import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { TaskComment } from './task-comment.entity';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
import { TaskService } from './task.service';

export interface TaskCommentDto {
  _id: string;
  taskId: string;
  organizationId: string;
  userId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class TaskCommentService {
  constructor(
    @InjectModel('TaskComment') private readonly commentModel: Model<TaskComment>,
    private readonly taskService: TaskService,
  ) {}

  async create(
    taskId: string,
    organizationId: string,
    userId: string,
    dto: CreateTaskCommentDto,
  ): Promise<TaskCommentDto | null> {
    const task = await this.taskService.findOne(taskId, organizationId);
    if (!task) return null;
    const taskObjId = new mongoose.Types.ObjectId(taskId);
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const userObjId = new mongoose.Types.ObjectId(userId);
    const doc = await this.commentModel.create({
      taskId: taskObjId,
      organizationId: orgId,
      userId: userObjId,
      content: dto.content.trim(),
    });
    const raw = doc.toObject ? doc.toObject() : (doc as unknown as TaskComment & { createdAt: Date; updatedAt: Date });
    return {
      _id: (raw._id as mongoose.Types.ObjectId).toString(),
      taskId,
      organizationId,
      userId,
      content: raw.content,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  async findByTask(taskId: string, organizationId: string): Promise<TaskCommentDto[]> {
    const task = await this.taskService.findOne(taskId, organizationId);
    if (!task) return [];
    const taskObjId = new mongoose.Types.ObjectId(taskId);
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const list = await this.commentModel
      .find({ taskId: taskObjId, organizationId: orgId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return (list as Array<TaskComment & { _id: mongoose.Types.ObjectId; userId: mongoose.Types.ObjectId }>).map(
      (c) => ({
        _id: c._id.toString(),
        taskId,
        organizationId,
        userId: (c.userId as mongoose.Types.ObjectId).toString(),
        content: c.content,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }),
    );
  }

  /** Comments for all tasks of an initiative, newest first. */
  async findByInitiative(initiativeId: string, organizationId: string): Promise<TaskCommentDto[]> {
    const tasks = await this.taskService.findByInitiative(initiativeId, organizationId);
    if (tasks.length === 0) return [];
    const taskIds = tasks.map((t) => (t as { _id: mongoose.Types.ObjectId })._id ?? t);
    const list = await this.commentModel
      .find({
        taskId: { $in: taskIds },
        organizationId: new mongoose.Types.ObjectId(organizationId),
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec();
    return (list as Array<TaskComment & { _id: mongoose.Types.ObjectId; userId: mongoose.Types.ObjectId; taskId: mongoose.Types.ObjectId }>).map(
      (c) => ({
        _id: c._id.toString(),
        taskId: (c.taskId as mongoose.Types.ObjectId).toString(),
        organizationId,
        userId: (c.userId as mongoose.Types.ObjectId).toString(),
        content: c.content,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }),
    );
  }
}
