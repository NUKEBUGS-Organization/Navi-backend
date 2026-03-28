import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { Organization } from './organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationSignupRequestDto } from './dto/organization-signup-request.dto';
import { User, UserRole } from '../auth/user.entity';
import { hashPassword } from '../../utils/HashPassword';
import { MailService } from '../mail/mail.service';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    @InjectModel('Organization') private readonly orgModel: Model<Organization>,
    @InjectModel('User') private readonly userModel: Model<User>,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  async notifySignupRequest(
    dto: OrganizationSignupRequestDto,
  ): Promise<{ notified: boolean; message: string }> {
    const to = (this.config.get<string>('SUPER_ADMIN_NOTIFICATION_EMAIL') ?? '').trim();
    if (!to) {
      this.logger.warn('SUPER_ADMIN_NOTIFICATION_EMAIL is not set; org signup request not emailed.');
      return {
        notified: false,
        message: 'Thanks — our team will review your request.',
      };
    }
    const rows: [string, string][] = [
      ['Organization', dto.organizationName],
      ['Contact', dto.organizationContact],
      ['Email', dto.email],
      ['Phone', dto.phoneNumber ?? '—'],
      ['City', dto.city ?? '—'],
      ['Country', dto.country ?? '—'],
      ['Industry', dto.industry ?? '—'],
      ['Employees', dto.employeeCount ?? '—'],
    ];
    const text = ['New organization signup request (create their workspace in Super Admin).', '', ...rows.map(([k, v]) => `${k}: ${v}`)].join(
      '\n',
    );
    const html = `<p><strong>New organization signup request</strong></p><table style="border-collapse:collapse">${rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 12px 4px 0;font-weight:600">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`,
      )
      .join('')}</table>`;
    try {
      await this.mailService.send({
        to,
        subject: `[NAVI] Organization signup: ${dto.organizationName}`,
        text,
        html,
      });
    } catch (e) {
      this.logger.error(e instanceof Error ? e.message : e);
      throw new HttpException(
        'Could not submit your request right now. Please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { notified: true, message: 'Thanks — our team will review your request.' };
  }

  async findAll(): Promise<Organization[]> {
    return this.orgModel.find().sort({ createdAt: -1 }).lean().exec();
  }

  /** List organizations with admin display name, departments, and employee count (for Super Admin UI). */
  async findAllWithAdminNames(): Promise<
    {
      id: string;
      name: string;
      adminName: string;
      status: string;
      createdAt: Date;
      departments: string[];
      departmentCount: number;
      employeeCount: number;
      email?: string;
      country?: string;
    }[]
  > {
    const orgs = await this.orgModel.find().sort({ createdAt: -1 }).lean().exec();
    const orgIds = orgs.map((o) => (o as { _id: mongoose.Types.ObjectId })._id);
    const admins = await this.userModel
      .find({ role: UserRole.ADMIN, organizationId: { $in: orgIds } })
      .select('name organizationId')
      .lean()
      .exec();
    const adminByOrgId: Record<string, string> = {};
    for (const a of admins) {
      const oid = (a as { organizationId?: { toString: () => string } }).organizationId?.toString();
      if (oid) adminByOrgId[oid] = (a as { name: string }).name;
    }
    return orgs.map((org) => {
      const o = org as {
        _id: { toString: () => string };
        name: string;
        status?: string;
        createdAt: Date;
        departments?: string[];
        employeeCount?: number;
        email?: string;
        country?: string;
      };
      const departments = o.departments ?? [];
      return {
        id: o._id.toString(),
        name: o.name,
        adminName: adminByOrgId[o._id.toString()] ?? '—',
        status: o.status ?? 'ACTIVE',
        createdAt: o.createdAt,
        departments,
        departmentCount: departments.length,
        employeeCount: o.employeeCount ?? 0,
        email: o.email,
        country: o.country,
      };
    });
  }

  async findOne(id: string): Promise<Organization | null> {
    return this.orgModel.findById(id).lean().exec();
  }

  /**
   * Create organization and its admin user in one transaction.
   * Only Super Admin should call this (enforced by controller guard).
   */
  async createWithAdmin(dto: CreateOrganizationDto): Promise<{
    organization: Organization;
    admin: Partial<User>;
  }> {
    const existingUser = await this.userModel.findOne({ email: dto.adminEmail });
    if (existingUser) {
      throw new HttpException(
        'Admin email is already in use. Use a different email.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const org = await this.orgModel.create({
      name: dto.organizationName,
      ownerName: dto.organizationOwner,
      email: dto.organizationEmail,
      phoneNumber: dto.phoneNumber,
      city: dto.city,
      country: dto.country,
      industry: dto.industry,
      employeeCount: dto.employeeCount ?? 0,
      departments: dto.departments ?? [],
      employees: [],
      managers: [],
      status: 'ACTIVE',
    });

    const hashedPassword = await hashPassword(dto.adminPassword);
    const adminUser = await this.userModel.create({
      name: dto.organizationOwner,
      email: dto.adminEmail,
      password: hashedPassword,
      role: UserRole.ADMIN,
      organizationId: org._id,
      departments: [],
      isActive: true,
    });

    const orgObj = org.toObject ? org.toObject() : org;
    const adminObj = (adminUser.toObject ? adminUser.toObject() : adminUser) as unknown as Record<string, unknown>;
    delete adminObj.password;

    const loginBase = (this.config.get<string>('FRONTEND_APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '');
    const loginUrl = `${loginBase}/login`;
    const welcomeText = [
      'Your NAVI workspace has been created.',
      '',
      `Sign-in URL: ${loginUrl}`,
      `Admin email (login): ${dto.adminEmail}`,
      `Temporary password: ${dto.adminPassword}`,
      '',
      'Please sign in and change your password from Settings.',
    ].join('\n');
    const welcomeHtml = `<p>Your NAVI workspace has been created.</p>
<ul>
<li><strong>Sign-in URL:</strong> <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></li>
<li><strong>Admin email (login):</strong> ${escapeHtml(dto.adminEmail)}</li>
<li><strong>Temporary password:</strong> ${escapeHtml(dto.adminPassword)}</li>
</ul>
<p>Please sign in and change your password from Settings.</p>`;
    const recipients = [...new Set([dto.organizationEmail.trim(), dto.adminEmail.trim()].filter(Boolean))];
    for (const addr of recipients) {
      try {
        await this.mailService.send({
          to: addr,
          subject: 'Your NAVI organization is ready',
          text: welcomeText,
          html: welcomeHtml,
        });
      } catch (e) {
        this.logger.error(`Welcome email to ${addr}: ${e instanceof Error ? e.message : e}`);
      }
    }

    return {
      organization: orgObj as Organization,
      admin: adminObj as Partial<User>,
    };
  }

  /**
   * Update organization by ID. Used by Admin (own org via me) or Super Admin (any org by id).
   */
  async update(id: string, dto: UpdateOrganizationDto): Promise<Organization | null> {
    const updates: Record<string, unknown> = {};
    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.description !== undefined) updates.description = dto.description.trim();
    if (dto.industry !== undefined) updates.industry = dto.industry.trim();
    if (dto.email !== undefined) updates.email = dto.email.trim();
    if (dto.phoneNumber !== undefined) updates.phoneNumber = dto.phoneNumber.trim();
    if (dto.city !== undefined) updates.city = dto.city.trim();
    if (dto.country !== undefined) updates.country = dto.country.trim();
    if (dto.employeeCount !== undefined) updates.employeeCount = dto.employeeCount;
    if (dto.departments !== undefined) updates.departments = dto.departments.map((d) => d.trim()).filter(Boolean);
    const updated = await this.orgModel
      .findByIdAndUpdate(id, { $set: updates }, { new: true })
      .lean()
      .exec();
    return updated as Organization | null;
  }
}
