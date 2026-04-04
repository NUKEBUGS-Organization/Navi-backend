import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { Communication } from './communication.entity';
import { CreateCommunicationDto } from './dto/create-communication.dto';
import { UpdateCommunicationDto } from './dto/update-communication.dto';
import { InitiativeService } from '../initiative/initiative.service';
import { User, UserRole } from '../auth/user.entity';
import { MailService } from '../mail/mail.service';

@Injectable()
export class CommunicationService {
  private readonly logger = new Logger(CommunicationService.name);

  constructor(
    @InjectModel('Communication') private readonly model: Model<Communication>,
    @InjectModel('User') private readonly userModel: Model<User>,
    private readonly initiativeService: InitiativeService,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreateCommunicationDto, organizationId: string): Promise<Communication> {
    const initiative = await this.initiativeService.findOne(dto.initiativeId, organizationId);
    if (!initiative) throw new Error('Initiative not found');
    const doc = await this.model.create({
      initiativeId: new mongoose.Types.ObjectId(dto.initiativeId),
      organizationId: new mongoose.Types.ObjectId(organizationId),
      title: dto.title.trim(),
      type: (dto.type as Communication['type']) ?? 'Email',
      audience: dto.audience?.trim() ?? '',
      scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
      status: (dto.status as Communication['status']) ?? 'Planned',
      message: dto.message?.trim() ?? '',
    });
    return doc.toObject?.() ?? (doc as unknown as Communication);
  }

  async findByInitiative(initiativeId: string, organizationId: string): Promise<Communication[]> {
    const initiative = await this.initiativeService.findOne(initiativeId, organizationId);
    if (!initiative) return [];
    const list = await this.model
      .find({
        initiativeId: new mongoose.Types.ObjectId(initiativeId),
        organizationId: new mongoose.Types.ObjectId(organizationId),
      })
      .sort({ scheduledDate: 1, createdAt: -1 })
      .lean()
      .exec();
    return list as Communication[];
  }

  async findByOrganization(organizationId: string): Promise<Communication[]> {
    const list = await this.model
      .find({ organizationId: new mongoose.Types.ObjectId(organizationId) })
      .sort({ scheduledDate: 1, createdAt: -1 })
      .lean()
      .exec();
    return list as Communication[];
  }

  async update(id: string, dto: UpdateCommunicationDto, organizationId: string): Promise<Communication | null> {
    const updates: Record<string, unknown> = {};
    if (dto.title !== undefined) updates.title = dto.title.trim();
    if (dto.type !== undefined) updates.type = dto.type;
    if (dto.audience !== undefined) updates.audience = dto.audience.trim();
    if (dto.scheduledDate !== undefined) updates.scheduledDate = dto.scheduledDate ? new Date(dto.scheduledDate) : null;
    if (dto.status !== undefined) updates.status = dto.status;
    if (dto.message !== undefined) updates.message = dto.message.trim();
    if (dto.initiativeId !== undefined) updates.initiativeId = new mongoose.Types.ObjectId(dto.initiativeId);
    const doc = await this.model
      .findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(id), organizationId: new mongoose.Types.ObjectId(organizationId) },
        { $set: updates },
        { new: true },
      )
      .lean()
      .exec();
    return doc as Communication | null;
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    const result = await this.model
      .deleteOne({ _id: new mongoose.Types.ObjectId(id), organizationId: new mongoose.Types.ObjectId(organizationId) })
      .exec();
    return (result.deletedCount ?? 0) > 0;
  }

  private resolveAudienceEmails(
    audience: string | undefined,
    users: { email?: string; role?: UserRole; isActive?: boolean }[],
  ): string[] {
    const raw = (audience ?? 'all').trim().toLowerCase();
    const active = users.filter((u) => u.isActive !== false && u.email?.trim());
    if (raw === 'managers' || raw === 'manager') {
      return active.filter((u) => u.role === UserRole.MANAGER).map((u) => String(u.email).trim());
    }
    if (raw === 'employees' || raw === 'employee' || raw === 'all-employees') {
      return active.filter((u) => u.role === UserRole.EMPLOYEE).map((u) => String(u.email).trim());
    }
    if (raw === 'leadership' || raw === 'admin' || raw === 'leadership_team') {
      return active
        .filter((u) => u.role === UserRole.ADMIN || u.role === UserRole.MANAGER)
        .map((u) => String(u.email).trim());
    }
    if (raw.includes('@')) {
      return raw
        .split(/[,;]/)
        .map((e) => e.trim())
        .filter(Boolean);
    }
    return active.map((u) => String(u.email).trim());
  }

  async sendEmailNow(id: string, organizationId: string): Promise<Communication | null> {
    const oid = new mongoose.Types.ObjectId(organizationId);
    const doc = await this.model
      .findOne({ _id: new mongoose.Types.ObjectId(id), organizationId: oid })
      .lean()
      .exec();
    if (!doc) throw new HttpException('Communication not found.', HttpStatus.NOT_FOUND);
    const c = doc as Communication & { message?: string; title?: string; audience?: string };
    const orgUsers = await this.userModel
      .find({ organizationId: oid })
      .select('email role isActive')
      .lean()
      .exec();
    const recipients = [...new Set(this.resolveAudienceEmails(c.audience, orgUsers as User[]))];
    if (recipients.length === 0) {
      throw new HttpException('No recipients resolved for this audience.', HttpStatus.BAD_REQUEST);
    }
    const subject = `[NAVI] ${c.title}`;
    const text = (c.message ?? '').trim() || '(No message body)';
    const html = `<p><strong>${c.title}</strong></p><p style="white-space:pre-wrap">${text.replace(/</g, '&lt;')}</p>`;
    let sent = 0;
    for (const to of recipients) {
      try {
        await this.mailService.send({ to, subject, text, html });
        sent += 1;
      } catch (e) {
        this.logger.warn(`Mail to ${to}: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (sent === 0) {
      throw new HttpException('Could not send email (check mail configuration).', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const updated = await this.model
      .findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(id), organizationId: oid },
        {
          $set: {
            status: 'Sent',
            emailSentAt: new Date(),
            lastRecipientEmails: recipients,
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    return updated as Communication | null;
  }
}
