import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { User, UserRole } from '../auth/user.entity';
import { Task } from '../task/task.entity';
import { KudosContribution } from '../kudos/kudos.entity';
import { AiService } from './ai.service';
import { AiContextService } from './ai-context.service';
import { DraftKudosDto } from './dto/draft-kudos.dto';

/** Must match CreateManagerKudosDto.note's MaxLength. */
const NOTE_MAX = 500;

const SCHEMA = {
  type: 'object',
  properties: {
    note: { type: 'string', description: `The kudos message, under ${NOTE_MAX} characters.` },
  },
  required: ['note'],
  additionalProperties: false,
};

const CONTRIBUTION_LABEL: Record<string, string> = {
  task_completed: 'completed task',
  task_comment: 'task comment',
  assessment_submitted: 'assessment submitted',
  manager_award: 'previous manager award',
};

@Injectable()
export class AiKudosService {
  constructor(
    private readonly ai: AiService,
    private readonly context: AiContextService,
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectModel('Task') private readonly taskModel: Model<Task>,
    @InjectModel('KudosContribution') private readonly contributionModel: Model<KudosContribution>,
  ) {}

  async draft(dto: DraftKudosDto, requester: Partial<User>, organizationId: string): Promise<{ note: string }> {
    const initiative = await this.context.getInitiative(dto.initiativeId, organizationId);
    if (!mongoose.isValidObjectId(dto.employeeId)) throw new ForbiddenException('Employee not found in your organization.');
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const empId = new mongoose.Types.ObjectId(dto.employeeId);

    const employee = await this.userModel
      .findOne({ _id: empId, organizationId: orgId, role: UserRole.EMPLOYEE })
      .select('name departments')
      .lean()
      .exec();
    if (!employee) throw new ForbiddenException('Employee not found in your organization.');

    // Same rule as KudosService.createManagerDirectAward: managers only for employees in their departments.
    if (requester.role === UserRole.MANAGER) {
      const mine = new Set((requester.departments ?? []).map((d) => String(d).toLowerCase()));
      if (!(employee.departments ?? []).some((d) => mine.has(String(d).toLowerCase()))) {
        throw new ForbiddenException('Not allowed for this employee.');
      }
    }

    const filter = { organizationId: orgId, initiativeId: new mongoose.Types.ObjectId(dto.initiativeId) };
    const [tasks, contributions] = await Promise.all([
      this.taskModel.find({ ...filter, assigneeId: empId }).select('title status phase progress').lean().exec(),
      this.contributionModel
        .find({ ...filter, employeeId: empId })
        .sort({ createdAt: -1 })
        .limit(30)
        .select('contributionType contributionTitle contributionSubtitle')
        .lean()
        .exec(),
    ]);

    const work = [
      tasks.length
        ? `Tasks assigned:\n${tasks.map((t) => `- ${t.title} (${t.status}${t.phase ? `, ${t.phase} phase` : ''})`).join('\n')}`
        : 'No tasks assigned on this initiative.',
      contributions.length
        ? `Recorded contributions:\n${contributions
            .map(
              (c) =>
                `- ${CONTRIBUTION_LABEL[c.contributionType] ?? c.contributionType}${c.contributionTitle ? `: ${c.contributionTitle}` : ''}`,
            )
            .join('\n')}`
        : 'No recorded contributions yet.',
    ].join('\n\n');

    const firstName = (employee.name ?? '').split(' ')[0] || 'there';
    const result = await this.ai.completeJson<{ note: string }>({
      system: `You write short, sincere kudos notes from a manager to an employee in NAVI.
Be specific: name the actual work from the data and why it mattered to the initiative. Warm and professional, no clichés, no emojis, 2-4 sentences, under ${NOTE_MAX} characters.
If the manager wrote a rough note, keep its meaning and facts and improve it. Never invent achievements that are not in the data or the manager's note.`,
      user: [
        `Initiative: ${initiative.title}${initiative.description ? ` - ${initiative.description}` : ''}`,
        `Employee first name: ${firstName}`,
        work,
        dto.roughNote ? `Manager's rough note: ${dto.roughNote}` : '',
        `Tone: ${dto.tone ?? 'Warm'}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      schemaName: 'kudos_note',
      schema: SCHEMA,
      temperature: 0.7,
      maxTokens: 400,
    });
    return { note: result.note.slice(0, NOTE_MAX) };
  }
}
