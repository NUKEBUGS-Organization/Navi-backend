import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { InitiativeService } from '../initiative/initiative.service';
import { User, UserRole } from '../auth/user.entity';
import { KudosContribution } from './kudos.entity';

@Injectable()
export class KudosService {
  constructor(
    @InjectModel('KudosContribution') private readonly kudosModel: Model<KudosContribution>,
    private readonly initiativeService: InitiativeService,
    @InjectModel('User') private readonly userModel: Model<User>,
  ) {}

  private orgIdToString(orgId: unknown): string | null {
    if (!orgId) return null;
    if (typeof orgId === 'string') return orgId;
    if (typeof (orgId as any)?.toString === 'function') return (orgId as any).toString();
    return null;
  }

  private async getScopedEmployeeIds(currentUser: Partial<User>): Promise<string[]> {
    const orgIdStr = this.orgIdToString(currentUser.organizationId);
    if (!orgIdStr) return [];
    const role = currentUser.role as UserRole | undefined;

    if (role === UserRole.EMPLOYEE) {
      const id = this.orgIdToString(currentUser._id as unknown);
      return id ? [id] : [];
    }

    // Managers see stars for employees in their departments.
    if (role === UserRole.MANAGER) {
      const depts = (currentUser.departments ?? []).map((d) => String(d));
      const users = await this.userModel
        .find({
          $or: [{ organizationId: new mongoose.Types.ObjectId(orgIdStr) }, { organizationId: orgIdStr }],
          role: UserRole.EMPLOYEE,
          departments: { $in: depts },
        })
        .select('_id')
        .lean()
        .exec();
      return users.map((u) => u._id.toString());
    }

    // Admins (and super admins) see all employees in org.
    const users = await this.userModel
      .find({
        $or: [{ organizationId: new mongoose.Types.ObjectId(orgIdStr) }, { organizationId: orgIdStr }],
        role: UserRole.EMPLOYEE,
      })
      .select('_id')
      .lean()
      .exec();
    return users.map((u) => u._id.toString());
  }

  private async isEmployee(userId: string): Promise<boolean> {
    const user = await this.userModel.findById(new mongoose.Types.ObjectId(userId)).select('role').lean().exec();
    return user?.role === UserRole.EMPLOYEE;
  }

  async createSystemKudosForTaskCompletion(args: {
    initiativeId: string;
    organizationId: string;
    taskId: string;
    employeeId: string;
    taskTitle?: string;
  }): Promise<void> {
    if (!(await this.isEmployee(args.employeeId))) return;

    const existing = await this.kudosModel
      .findOne({
        initiativeId: new mongoose.Types.ObjectId(args.initiativeId),
        organizationId: new mongoose.Types.ObjectId(args.organizationId),
        employeeId: new mongoose.Types.ObjectId(args.employeeId),
        contributionType: 'task_completed',
        taskId: new mongoose.Types.ObjectId(args.taskId),
      })
      .lean()
      .exec();
    if (existing) return;

    await this.kudosModel.create({
      initiativeId: new mongoose.Types.ObjectId(args.initiativeId),
      organizationId: new mongoose.Types.ObjectId(args.organizationId),
      employeeId: new mongoose.Types.ObjectId(args.employeeId),
      contributionType: 'task_completed',
      taskId: new mongoose.Types.ObjectId(args.taskId),
      systemStars: 1,
      managerStars: 0,
      contributionTitle: args.taskTitle ?? 'Task',
      contributionSubtitle: 'Task completed',
    });
  }

  async createSystemKudosForTaskComment(args: {
    initiativeId: string;
    organizationId: string;
    taskId: string;
    commentId: string;
    employeeId: string;
    taskTitle?: string;
    commentPreview?: string;
  }): Promise<void> {
    if (!(await this.isEmployee(args.employeeId))) return;

    const existing = await this.kudosModel
      .findOne({
        initiativeId: new mongoose.Types.ObjectId(args.initiativeId),
        organizationId: new mongoose.Types.ObjectId(args.organizationId),
        employeeId: new mongoose.Types.ObjectId(args.employeeId),
        contributionType: 'task_comment',
        commentId: new mongoose.Types.ObjectId(args.commentId),
      })
      .lean()
      .exec();
    if (existing) return;

    await this.kudosModel.create({
      initiativeId: new mongoose.Types.ObjectId(args.initiativeId),
      organizationId: new mongoose.Types.ObjectId(args.organizationId),
      employeeId: new mongoose.Types.ObjectId(args.employeeId),
      contributionType: 'task_comment',
      taskId: new mongoose.Types.ObjectId(args.taskId),
      commentId: new mongoose.Types.ObjectId(args.commentId),
      systemStars: 1,
      managerStars: 0,
      contributionTitle: args.taskTitle ?? 'Task',
      contributionSubtitle: args.commentPreview ? `Comment: ${args.commentPreview}` : 'Comment added',
    });
  }

  async createSystemKudosForAssessmentSubmission(args: {
    initiativeId: string;
    organizationId: string;
    assessmentSubmissionId: string;
    employeeId: string;
    assessmentTitle?: string;
  }): Promise<void> {
    if (!(await this.isEmployee(args.employeeId))) return;

    const existing = await this.kudosModel
      .findOne({
        initiativeId: new mongoose.Types.ObjectId(args.initiativeId),
        organizationId: new mongoose.Types.ObjectId(args.organizationId),
        employeeId: new mongoose.Types.ObjectId(args.employeeId),
        contributionType: 'assessment_submitted',
        assessmentSubmissionId: new mongoose.Types.ObjectId(args.assessmentSubmissionId),
      })
      .lean()
      .exec();
    if (existing) return;

    await this.kudosModel.create({
      initiativeId: new mongoose.Types.ObjectId(args.initiativeId),
      organizationId: new mongoose.Types.ObjectId(args.organizationId),
      employeeId: new mongoose.Types.ObjectId(args.employeeId),
      contributionType: 'assessment_submitted',
      assessmentSubmissionId: new mongoose.Types.ObjectId(args.assessmentSubmissionId),
      systemStars: 1,
      managerStars: 0,
      contributionTitle: args.assessmentTitle ?? 'Assessment',
      contributionSubtitle: 'Assessment submitted',
    });
  }

  async getMySummary(currentUser: Partial<User>): Promise<{ totalStars: number; systemStars: number; managerStars: number }> {
    const employeeId = this.orgIdToString(currentUser._id as unknown);
    if (!employeeId) return { totalStars: 0, systemStars: 0, managerStars: 0 };
    const docs = await this.kudosModel.find({ employeeId: new mongoose.Types.ObjectId(employeeId) }).lean().exec();
    const systemStars = docs.reduce((s, d) => s + (d.systemStars ?? 0), 0);
    const managerStars = docs.reduce((s, d) => s + (d.managerStars ?? 0), 0);
    return { totalStars: systemStars + managerStars, systemStars, managerStars };
  }

  async getMyKudosList(currentUser: Partial<User>): Promise<any[]> {
    const employeeId = this.orgIdToString(currentUser._id as unknown);
    if (!employeeId) return [];
    const list = await this.kudosModel
      .find({ employeeId: new mongoose.Types.ObjectId(employeeId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return list.map((c) => ({
      _id: c._id.toString(),
      initiativeId: c.initiativeId.toString(),
      contributionType: c.contributionType,
      createdAt: c.createdAt,
      taskId: c.taskId?.toString?.(),
      commentId: c.commentId?.toString?.(),
      assessmentSubmissionId: c.assessmentSubmissionId?.toString?.(),
      contributionTitle: c.contributionTitle,
      contributionSubtitle: c.contributionSubtitle,
      systemStars: c.systemStars ?? 0,
      managerStars: c.managerStars ?? 0,
    }));
  }

  async listKudosInitiatives(currentUser: Partial<User>): Promise<Array<{ initiativeId: string; title: string }>> {
    const orgIdStr = this.orgIdToString(currentUser.organizationId);
    if (!orgIdStr) return [];

    // For the manager "Give Kudos" flow we need initiatives to be selectable even
    // before any kudos exist yet, so we list initiatives from the org.
    const initiatives = await this.initiativeService.findAllByOrganization(orgIdStr);
    return initiatives
      .map((i: any) => ({
        initiativeId: i.id?.toString?.() ?? i._id?.toString?.() ?? String(i.id ?? i._id ?? ""),
        title: i.title ?? "Initiative",
      }))
      .filter((x) => x.initiativeId)
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  async listContributionsForInitiative(currentUser: Partial<User>, initiativeId: string): Promise<any[]> {
    const orgIdStr = this.orgIdToString(currentUser.organizationId);
    if (!orgIdStr) return [];
    const employeeIds = await this.getScopedEmployeeIds(currentUser);
    if (employeeIds.length === 0) return [];

    const contributions = await this.kudosModel
      .find({
        initiativeId: new mongoose.Types.ObjectId(initiativeId),
        organizationId: new mongoose.Types.ObjectId(orgIdStr),
        employeeId: { $in: employeeIds.map((id) => new mongoose.Types.ObjectId(id)) },
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const employeeIdSet = new Set(contributions.map((c) => c.employeeId.toString()));
    const employees = await this.userModel
      .find({ _id: { $in: [...employeeIdSet].map((id) => new mongoose.Types.ObjectId(id)) } })
      .select('_id name')
      .lean()
      .exec();
    const nameById: Record<string, string> = {};
    employees.forEach((u) => { nameById[u._id.toString()] = (u as any).name ?? 'Employee'; });

    return contributions.map((c) => ({
      _id: c._id.toString(),
      employeeId: c.employeeId.toString(),
      employeeName: nameById[c.employeeId.toString()] ?? 'Employee',
      contributionType: c.contributionType,
      contributionTitle: c.contributionTitle,
      contributionSubtitle: c.contributionSubtitle,
      systemStars: c.systemStars ?? 0,
      managerStars: c.managerStars ?? 0,
      managerId: c.managerId?.toString?.(),
      createdAt: c.createdAt,
    }));
  }

  async awardManagerStar(currentUser: Partial<User>, contributionId: string): Promise<any> {
    const role = currentUser.role as UserRole | undefined;
    if (!role || !(role === UserRole.MANAGER || role === 'admin' || role === 'super_admin')) {
      throw new ForbiddenException('Only managers/admins can award kudos.');
    }

    const orgIdStr = this.orgIdToString(currentUser.organizationId);
    if (!orgIdStr) throw new ForbiddenException('Not linked to an organization.');
    const requesterId = this.orgIdToString(currentUser._id as unknown);
    if (!requesterId) throw new ForbiddenException('Missing user id.');

    const contribution = await this.kudosModel
      .findOne({
        _id: new mongoose.Types.ObjectId(contributionId),
        organizationId: new mongoose.Types.ObjectId(orgIdStr),
      })
      .lean()
      .exec();
    if (!contribution) throw new NotFoundException('Contribution not found.');

    if (role === UserRole.MANAGER) {
      const managerDeptSet = new Set((currentUser.departments ?? []).map((d) => String(d).toLowerCase()));
      const employee = await this.userModel
        .findOne({
          _id: new mongoose.Types.ObjectId(contribution.employeeId.toString()),
          organizationId: new mongoose.Types.ObjectId(orgIdStr),
        })
        .select('departments role')
        .lean()
        .exec();
      const employeeDepts: string[] = (employee as any)?.departments ?? [];
      const intersects = employeeDepts.some((d) => managerDeptSet.has(String(d).toLowerCase()));
      if (!intersects) throw new ForbiddenException('Not allowed for this employee.');
    }

    if ((contribution.managerStars ?? 0) >= 1) return contribution;

    await this.kudosModel.updateOne(
      { _id: new mongoose.Types.ObjectId(contributionId) },
      { $set: { managerStars: 1, managerId: new mongoose.Types.ObjectId(requesterId) } },
    ).exec();

    return this.kudosModel.findOne({ _id: new mongoose.Types.ObjectId(contributionId) }).lean().exec();
  }
}

