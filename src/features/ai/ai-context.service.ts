import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { InitiativeService } from '../initiative/initiative.service';
import { Initiative } from '../initiative/initiative.entity';
import { Task } from '../task/task.entity';
import { Risk } from '../risk/risk.entity';
import { Adoption } from '../adoption/adoption.entity';
import { Stakeholder } from '../stakeholder/stakeholder.entity';
import { Communication } from '../communication/communication.entity';

function fmtDate(d?: Date | string): string {
  if (!d) return 'no date';
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? 'no date' : date.toISOString().slice(0, 10);
}

function countBy<T>(items: T[], key: (item: T) => string | undefined): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item) || 'Unknown';
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].map(([k, n]) => `${k}: ${n}`).join(', ') || 'none';
}

export interface InitiativeSnapshot {
  initiative: Initiative;
  tasks: Task[];
  risks: Risk[];
  adoption: Adoption[];
  stakeholders: Stakeholder[];
  communications: Communication[];
}

/**
 * Loads organization-scoped data and renders it as plain-text context for AI prompts.
 * Every query filters by organizationId so prompts never include another org's data.
 */
@Injectable()
export class AiContextService {
  constructor(
    private readonly initiatives: InitiativeService,
    @InjectModel('Task') private readonly taskModel: Model<Task>,
    @InjectModel('Risk') private readonly riskModel: Model<Risk>,
    @InjectModel('Adoption') private readonly adoptionModel: Model<Adoption>,
    @InjectModel('Stakeholder') private readonly stakeholderModel: Model<Stakeholder>,
    @InjectModel('Communication') private readonly communicationModel: Model<Communication>,
  ) {}

  async getInitiative(initiativeId: string, organizationId: string): Promise<Initiative> {
    const initiative = await this.initiatives.findOne(initiativeId, organizationId);
    if (!initiative) throw new NotFoundException('Initiative not found.');
    return initiative;
  }

  async getSnapshot(initiativeId: string, organizationId: string): Promise<InitiativeSnapshot> {
    const initiative = await this.getInitiative(initiativeId, organizationId);
    const filter = {
      initiativeId: new mongoose.Types.ObjectId(initiativeId),
      organizationId: new mongoose.Types.ObjectId(organizationId),
    };
    const [tasks, risks, adoption, stakeholders, communications] = await Promise.all([
      this.taskModel.find(filter).lean().exec(),
      this.riskModel.find(filter).lean().exec(),
      this.adoptionModel.find(filter).sort({ targetDate: 1 }).lean().exec(),
      this.stakeholderModel.find(filter).lean().exec(),
      this.communicationModel.find(filter).sort({ scheduledDate: 1 }).lean().exec(),
    ]);
    return {
      initiative,
      tasks: tasks as Task[],
      risks: risks as Risk[],
      adoption: adoption as Adoption[],
      stakeholders: stakeholders as Stakeholder[],
      communications: communications as Communication[],
    };
  }

  describeInitiative(initiative: Initiative): string {
    const goals = (initiative.goals ?? [])
      .filter((g) => g.goal)
      .map((g) => `- ${g.goal}${g.metric ? ` (measured by: ${g.metric})` : ''}`)
      .join('\n');
    const faqs = (initiative.faqs ?? [])
      .filter((f) => f.question && f.answer)
      .map((f) => `Q: ${f.question}\nA: ${f.answer}`)
      .join('\n');

    return [
      `Initiative: ${initiative.title}`,
      initiative.description && `Description: ${initiative.description}`,
      initiative.status && `Status: ${initiative.status}`,
      initiative.changeType && `Change type: ${initiative.changeType}`,
      initiative.leadName && `Change lead: ${initiative.leadName}`,
      initiative.sponsorName && `Sponsor: ${initiative.sponsorName}`,
      initiative.dateRange && `Timeline: ${initiative.dateRange}`,
      initiative.departments?.length && `Departments affected: ${initiative.departments.join(', ')}`,
      initiative.readiness && `Readiness: ${initiative.readiness}`,
      `Overall progress: ${initiative.progress ?? 0}%`,
      goals && `Goals:\n${goals}`,
      faqs && `FAQs:\n${faqs}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  describeSnapshot(s: InitiativeSnapshot): string {
    const today = new Date();
    const openTasks = s.tasks.filter((t) => t.status !== 'Completed');
    const overdue = openTasks.filter((t) => t.dueDate && new Date(t.dueDate) < today);
    const blocked = s.tasks.filter((t) => t.isBlocked || t.status === 'Blocked');
    const openRisks = s.risks.filter((r) => r.status !== 'Resolved' && r.status !== 'Closed');

    const sections = [
      this.describeInitiative(s.initiative),
      `Today: ${fmtDate(today)}`,

      `TASKS (${s.tasks.length} total; by status: ${countBy(s.tasks, (t) => t.status)}; by phase: ${countBy(s.tasks, (t) => t.phase)})`,
      overdue.length &&
        `Overdue tasks:\n${overdue
          .slice(0, 15)
          .map((t) => `- ${t.title} (due ${fmtDate(t.dueDate)}, ${t.status}, ${t.progress ?? 0}%)`)
          .join('\n')}`,
      blocked.length && `Blocked tasks:\n${blocked.slice(0, 10).map((t) => `- ${t.title}`).join('\n')}`,

      `RISKS (${s.risks.length} total; open: ${openRisks.length}; open by severity: ${countBy(openRisks, (r) => r.severity)})`,
      openRisks.length &&
        openRisks
          .slice(0, 15)
          .map(
            (r) =>
              `- [${r.severity ?? 'Unrated'} / ${r.status ?? 'Open'}] ${r.title}${r.description ? `: ${r.description}` : ''}${r.mitigationNotes ? ` (mitigation: ${r.mitigationNotes})` : ''}`,
          )
          .join('\n'),

      `ADOPTION MILESTONES (${s.adoption.length})`,
      s.adoption.length &&
        s.adoption
          .map(
            (a) =>
              `- ${a.milestone}: ${a.status ?? 'Not Started'}, ${a.percentAdopted ?? 0}% adopted vs target ${a.targetPercent ?? 100}%, target date ${fmtDate(a.targetDate)}${a.notes ? ` (notes: ${a.notes})` : ''}`,
          )
          .join('\n'),

      `STAKEHOLDERS (${s.stakeholders.length}; by support: ${countBy(s.stakeholders, (x) => x.support)})`,
      s.stakeholders.length &&
        s.stakeholders
          .slice(0, 25)
          .map((x) => `- ${x.name}${x.role ? ` (${x.role})` : ''}: influence ${x.influence ?? '?'}, support ${x.support ?? '?'}`)
          .join('\n'),

      `COMMUNICATIONS (${s.communications.length}; by status: ${countBy(s.communications, (c) => c.status)})`,
      s.communications.length &&
        s.communications
          .slice(0, 15)
          .map((c) => `- ${c.title} (${c.type ?? 'Email'}, ${c.status ?? 'Planned'}, ${fmtDate(c.scheduledDate)})`)
          .join('\n'),
    ];
    return sections.filter(Boolean).join('\n\n');
  }
}
