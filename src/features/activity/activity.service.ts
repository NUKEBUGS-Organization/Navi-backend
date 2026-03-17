import { Injectable } from '@nestjs/common';
import { InitiativeService } from '../initiative/initiative.service';
import { TaskService } from '../task/task.service';
import { TaskCommentService } from '../task/task-comment.service';
import { AdoptionService } from '../adoption/adoption.service';
import { Task } from '../task/task.entity';
import type { TaskCommentDto } from '../task/task-comment.service';
import { Adoption } from '../adoption/adoption.entity';

export type ActivityItemType = 'task_created' | 'task_updated' | 'comment' | 'adoption_milestone';

export interface ActivityItem {
  type: ActivityItemType;
  date: string;
  taskId?: string;
  taskTitle?: string;
  userId?: string;
  content?: string;
  milestone?: string;
  percentAdopted?: number;
  progress?: number;
}

const LIMIT = 80;

@Injectable()
export class ActivityService {
  constructor(
    private readonly initiativeService: InitiativeService,
    private readonly taskService: TaskService,
    private readonly taskCommentService: TaskCommentService,
    private readonly adoptionService: AdoptionService,
  ) {}

  async getActivity(initiativeId: string, organizationId: string): Promise<ActivityItem[]> {
    const initiative = await this.initiativeService.findOne(initiativeId, organizationId);
    if (!initiative) return [];

    const [tasks, comments, adoptions] = await Promise.all([
      this.taskService.findByInitiative(initiativeId, organizationId),
      this.taskCommentService.findByInitiative(initiativeId, organizationId),
      this.adoptionService.findByInitiative(initiativeId, organizationId),
    ]);

    const toTaskId = (t: Task): string => {
      const id = (t as unknown as { _id?: { toString?: () => string } })._id;
      return id?.toString?.() ?? String(id);
    };
    const taskById = new Map<string, Task>();
    tasks.forEach((t) => {
      const id = toTaskId(t);
      if (id) taskById.set(id, t);
    });

    const items: ActivityItem[] = [];

    for (const task of tasks) {
      const tid = toTaskId(task);
      const title = (task as Task).title ?? 'Task';
      const createdAt = (task as Task & { createdAt?: Date }).createdAt;
      const updatedAt = (task as Task & { updatedAt?: Date }).updatedAt;
      const progress = (task as Task).progress ?? 0;
      if (createdAt) {
        items.push({
          type: 'task_created',
          date: new Date(createdAt).toISOString(),
          taskId: tid,
          taskTitle: title,
        });
      }
      if (updatedAt && createdAt && new Date(updatedAt).getTime() > new Date(createdAt).getTime()) {
        items.push({
          type: 'task_updated',
          date: new Date(updatedAt).toISOString(),
          taskId: tid,
          taskTitle: title,
          progress,
        });
      }
    }

    for (const c of comments) {
      const comment = c as TaskCommentDto;
      const task = taskById.get(comment.taskId);
      const taskTitle = task ? (task as Task).title : 'Task';
      items.push({
        type: 'comment',
        date: new Date(comment.createdAt).toISOString(),
        taskId: comment.taskId,
        taskTitle,
        userId: comment.userId,
        content: comment.content?.slice(0, 200) ?? '',
      });
    }

    for (const a of adoptions) {
      const adoption = a as Adoption & { createdAt?: Date };
      if (adoption.createdAt) {
        items.push({
          type: 'adoption_milestone',
          date: new Date(adoption.createdAt).toISOString(),
          milestone: adoption.milestone,
          percentAdopted: adoption.percentAdopted ?? 0,
        });
      }
    }

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items.slice(0, LIMIT);
  }
}
