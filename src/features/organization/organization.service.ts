import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { Organization } from './organization.entity';
import { OrganizationSignupLead } from './organization-signup-lead.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationSignupRequestDto } from './dto/organization-signup-request.dto';
import { User, UserRole } from '../auth/user.entity';
import { hashPassword } from '../../utils/HashPassword';
import { MailService } from '../mail/mail.service';

/** Inbox for public organization signup form (`POST /organizations/signup-request`). Override with SUPER_ADMIN_NOTIFICATION_EMAIL. */
const DEFAULT_SUPER_ADMIN_NOTIFICATION_EMAIL = 'Navi@igcollaborative.com';

/** From address for welcome emails when Super Admin creates an org (override ORG_OWNER_WELCOME_FROM_EMAIL). */
const DEFAULT_ORG_OWNER_WELCOME_FROM_EMAIL = 'karaboyce@changewithnavi.com';

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
    @InjectModel('OrganizationSignupLead') private readonly signupLeadModel: Model<OrganizationSignupLead>,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  async notifySignupRequest(
    dto: OrganizationSignupRequestDto,
  ): Promise<{ notified: boolean; message: string }> {
    const configured = (this.config.get<string>('SUPER_ADMIN_NOTIFICATION_EMAIL') ?? '').trim();
    const to = configured || DEFAULT_SUPER_ADMIN_NOTIFICATION_EMAIL;
    await this.signupLeadModel.create({
      organizationName: dto.organizationName.trim(),
      organizationContact: dto.organizationContact.trim(),
      email: dto.email.trim().toLowerCase(),
      phoneNumber: dto.phoneNumber?.trim(),
      city: dto.city?.trim(),
      country: dto.country?.trim(),
      industry: dto.industry?.trim(),
      employeeCount: dto.employeeCount?.trim(),
      hearAboutUs: dto.hearAboutUs?.trim(),
      status: 'new',
    });

    const rows: [string, string][] = [
      ['Organization', dto.organizationName],
      ['Contact', dto.organizationContact],
      ['Organization admin email', dto.email],
      ['Phone', dto.phoneNumber ?? '—'],
      ['City', dto.city ?? '—'],
      ['Country', dto.country ?? '—'],
      ['Industry', dto.industry ?? '—'],
      ['Employees', dto.employeeCount ?? '—'],
      ['How they heard about us', dto.hearAboutUs?.trim() ?? '—'],
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
      maxEmployeeSeats?: number;
      pendingEmployeeCount?: number;
      email?: string;
      country?: string;
      industry?: string;
      adminId?: string;
      adminEmail?: string;
      adminLastActiveAt?: Date | null;
    }[]
  > {
    const orgs = await this.orgModel.find().sort({ createdAt: -1 }).lean().exec();
    const orgIds = orgs.map((o) => (o as { _id: mongoose.Types.ObjectId })._id);
    const admins = await this.userModel
      .find({ role: UserRole.ADMIN, organizationId: { $in: orgIds } })
      .select('_id name email lastActiveAt organizationId')
      .lean()
      .exec();
    const adminByOrgId: Record<string, { adminName: string; adminId: string; adminEmail?: string; adminLastActiveAt?: Date | null }> = {};
    for (const a of admins) {
      const aa = a as {
        _id: { toString: () => string };
        organizationId?: { toString: () => string };
        name: string;
        email?: string;
        lastActiveAt?: Date | null;
      };
      const oid = aa.organizationId?.toString();
      if (oid) {
        adminByOrgId[oid] = {
          adminName: aa.name,
          adminId: aa._id.toString(),
          adminEmail: aa.email,
          adminLastActiveAt: aa.lastActiveAt ?? null,
        };
      }
    }
    return orgs.map((org) => {
      const o = org as {
        _id: { toString: () => string };
        name: string;
        status?: string;
        createdAt: Date;
        departments?: string[];
        employeeCount?: number;
        maxEmployeeSeats?: number;
        email?: string;
        country?: string;
        industry?: string;
        pendingEmployeeCount?: number;
      };
      const departments = o.departments ?? [];
      const admin = adminByOrgId[o._id.toString()];
      return {
        id: o._id.toString(),
        name: o.name,
        adminName: admin?.adminName ?? '—',
        status: o.status ?? 'ACTIVE',
        createdAt: o.createdAt,
        departments,
        departmentCount: departments.length,
        employeeCount: o.employeeCount ?? 0,
        maxEmployeeSeats: o.maxEmployeeSeats ?? 100,
        pendingEmployeeCount: o.pendingEmployeeCount,
        email: o.email,
        country: o.country,
        industry: o.industry,
        adminId: admin?.adminId,
        adminEmail: admin?.adminEmail,
        adminLastActiveAt: admin?.adminLastActiveAt ?? null,
      };
    });
  }

  async findOne(id: string): Promise<Organization | null> {
    return this.orgModel.findById(id).lean().exec();
  }

  async findAllSignupLeads(): Promise<
    {
      id: string;
      organizationName: string;
      organizationContact: string;
      email: string;
      phoneNumber?: string;
      city?: string;
      country?: string;
      industry?: string;
      employeeCount?: string;
      hearAboutUs?: string;
      status: string;
      createdAt: Date;
    }[]
  > {
    const list = await this.signupLeadModel.find().sort({ createdAt: -1 }).lean().exec();
    return list.map((doc) => {
      const d = doc as unknown as {
        _id: { toString: () => string };
        organizationName: string;
        organizationContact: string;
        email: string;
        phoneNumber?: string;
        city?: string;
        country?: string;
        industry?: string;
        employeeCount?: string;
        hearAboutUs?: string;
        status?: string;
        createdAt?: Date;
      };
      return {
        id: d._id.toString(),
        organizationName: d.organizationName,
        organizationContact: d.organizationContact,
        email: d.email,
        phoneNumber: d.phoneNumber,
        city: d.city,
        country: d.country,
        industry: d.industry,
        employeeCount: d.employeeCount,
        hearAboutUs: d.hearAboutUs,
        status: d.status ?? 'new',
        createdAt: d.createdAt ?? new Date(),
      };
    });
  }

  async findSignupLeadById(id: string): Promise<{
    id: string;
    organizationName: string;
    organizationContact: string;
    email: string;
    phoneNumber?: string;
    city?: string;
    country?: string;
    industry?: string;
    employeeCount?: string;
    hearAboutUs?: string;
    status: string;
    createdAt: Date;
  } | null> {
    const doc = await this.signupLeadModel.findById(id).lean().exec();
    if (!doc) return null;
    const d = doc as unknown as {
      _id: { toString: () => string };
      organizationName: string;
      organizationContact: string;
      email: string;
      phoneNumber?: string;
      city?: string;
      country?: string;
      industry?: string;
      employeeCount?: string;
      hearAboutUs?: string;
      status?: string;
      createdAt?: Date;
    };
    return {
      id: d._id.toString(),
      organizationName: d.organizationName,
      organizationContact: d.organizationContact,
      email: d.email,
      phoneNumber: d.phoneNumber,
      city: d.city,
      country: d.country,
      industry: d.industry,
      employeeCount: d.employeeCount,
      hearAboutUs: d.hearAboutUs,
      status: d.status ?? 'new',
      createdAt: d.createdAt ?? new Date(),
    };
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
      maxEmployeeSeats: dto.maxEmployeeSeats ?? 100,
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

    const loginBase = (
      this.config.get<string>('FRONTEND_APP_URL') ?? 'https://app.changewithnavi.com'
    ).replace(/\/$/, '');
    const loginUrl = `${loginBase}/`;
    const onboardingBookingUrl = (
      this.config.get<string>('NAVI_ONBOARDING_BOOKING_URL') ?? 'https://changewithnavi.com'
    ).trim();
    const clientName = dto.organizationOwner.trim() || 'Team';
    const welcomeText = [
      `Dear ${clientName},`,
      '',
      'Welcome to NAVI.',
      '',
      'Your workspace is now live and ready to support your organization in driving change with clarity, structure, and accountability. We are excited to partner with you as you move from strategy to execution.',
      '',
      'Your Access Details',
      `- Workspace: ${loginUrl}`,
      `- Username: ${dto.adminEmail}`,
      `- Temporary Password: ${dto.adminPassword}`,
      '',
      'For security purposes, you will be prompted to update your password upon first login.',
      '',
      'Getting Started',
      'We recommend taking a few minutes to:',
      '- Log in and secure your account',
      '- Set up your first change initiative',
      '- Assign ownership across your leadership team',
      '',
      'Book Your Onboarding Session',
      'To ensure you and your team get the most value from NAVI, we encourage you to schedule your onboarding session within your first 7 days:',
      onboardingBookingUrl,
      '',
      'If a session is not scheduled within this period, a member of our team will reach out to support you.',
      '',
      'What to Expect',
      "Over the next few days, you'll receive a small number of emails from us to help you get set up and start seeing value quickly. Our goal is to guide you—without overwhelming you.",
      '',
      'This is where execution begins—not just planning.',
      '',
      'We look forward to supporting your journey.',
      '',
      'Warm regards,',
      'The NAVI Team',
      'powered by IGC Group Inc.',
    ].join('\n');
    const welcomeHtml = `<p>Dear ${escapeHtml(clientName)},</p>
<p>Welcome to NAVI.</p>
<p>Your workspace is now live and ready to support your organization in driving change with clarity, structure, and accountability. We&apos;re excited to partner with you as you move from strategy to execution.</p>
<p><strong>Your Access Details</strong></p>
<ul>
<li><strong>Workspace:</strong> <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></li>
<li><strong>Username:</strong> ${escapeHtml(dto.adminEmail)}</li>
<li><strong>Temporary Password:</strong> ${escapeHtml(dto.adminPassword)}</li>
</ul>
<p>For security purposes, you will be prompted to update your password upon first login.</p>
<p><strong>Getting Started</strong></p>
<p>We recommend taking a few minutes to:</p>
<ul>
<li>Log in and secure your account</li>
<li>Set up your first change initiative</li>
<li>Assign ownership across your leadership team</li>
</ul>
<p><strong>Book Your Onboarding Session</strong></p>
<p>To ensure you and your team get the most value from NAVI, we encourage you to schedule your onboarding session within your first 7 days:</p>
<p><a href="${escapeHtml(onboardingBookingUrl)}">Click to Book Onboarding</a></p>
<p>If a session is not scheduled within this period, a member of our team will reach out to support you.</p>
<p><strong>What to Expect</strong></p>
<p>Over the next few days, you&apos;ll receive a small number of emails from us to help you get set up and start seeing value quickly. Our goal is to guide you&mdash;without overwhelming you.</p>
<p>This is where execution begins&mdash;not just planning.</p>
<p>We look forward to supporting your journey.</p>
<p>Warm regards,<br/>The NAVI Team<br/><em>powered by IGC Group Inc.</em></p>`;
    const ownerWelcomeFrom =
      (this.config.get<string>('ORG_OWNER_WELCOME_FROM_EMAIL') ?? '').trim() ||
      DEFAULT_ORG_OWNER_WELCOME_FROM_EMAIL;
    const recipients = [...new Set([dto.organizationEmail.trim(), dto.adminEmail.trim()].filter(Boolean))];
    for (const addr of recipients) {
      try {
        await this.mailService.send({
          to: addr,
          fromEmail: ownerWelcomeFrom,
          subject: 'Your NAVI organization is ready',
          text: welcomeText,
          html: welcomeHtml,
        });
      } catch (e) {
        this.logger.error(`Welcome email to ${addr}: ${e instanceof Error ? e.message : e}`);
      }
    }

    if (dto.sourceLeadId) {
      await this.signupLeadModel
        .findOneAndUpdate(
          { _id: dto.sourceLeadId, status: 'new' },
          { $set: { status: 'converted' } },
        )
        .exec();
    }

    return {
      organization: orgObj as Organization,
      admin: adminObj as Partial<User>,
    };
  }

  /**
   * Org members (admin/manager): employee count changes require super admin approval.
   */
  async updateFromOrgMember(id: string, dto: UpdateOrganizationDto): Promise<Organization | null> {
    const existing = await this.orgModel.findById(id).lean().exec();
    if (!existing) return null;
    const updates: Record<string, unknown> = {};
    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.description !== undefined) updates.description = dto.description.trim();
    if (dto.industry !== undefined) updates.industry = dto.industry.trim();
    if (dto.email !== undefined) updates.email = dto.email.trim();
    if (dto.phoneNumber !== undefined) updates.phoneNumber = dto.phoneNumber.trim();
    if (dto.city !== undefined) updates.city = dto.city.trim();
    if (dto.country !== undefined) updates.country = dto.country.trim();
    if (dto.logo !== undefined) updates.logo = dto.logo.trim();
    if (dto.departments !== undefined) updates.departments = dto.departments.map((d) => d.trim()).filter(Boolean);
    if (dto.employeeCount !== undefined) {
      const approved = (existing as { employeeCount?: number }).employeeCount ?? 0;
      if (dto.employeeCount !== approved) {
        updates.pendingEmployeeCount = dto.employeeCount;
      }
    }
    const updated = await this.orgModel
      .findByIdAndUpdate(id, { $set: updates }, { new: true })
      .lean()
      .exec();
    return updated as Organization | null;
  }

  async approvePendingEmployeeCount(id: string): Promise<Organization | null> {
    const org = await this.orgModel.findById(id).lean().exec();
    if (!org) return null;
    const pending = (org as { pendingEmployeeCount?: number }).pendingEmployeeCount;
    if (pending == null) return org as Organization;
    const updated = await this.orgModel
      .findByIdAndUpdate(
        id,
        { $set: { employeeCount: pending }, $unset: { pendingEmployeeCount: 1 } },
        { new: true },
      )
      .lean()
      .exec();
    return updated as Organization | null;
  }

  /**
   * Super Admin: apply all fields including headcount without pending workflow.
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
    if (dto.logo !== undefined) updates.logo = dto.logo.trim();
    if (dto.employeeCount !== undefined) {
      updates.employeeCount = dto.employeeCount;
    }
    if (dto.maxEmployeeSeats !== undefined) {
      updates.maxEmployeeSeats = Math.max(1, Math.floor(dto.maxEmployeeSeats));
    }
    if (dto.departments !== undefined) updates.departments = dto.departments.map((d) => d.trim()).filter(Boolean);
    const updatePayload: { $set: Record<string, unknown>; $unset?: Record<string, 1> } = { $set: updates };
    if (dto.employeeCount !== undefined) {
      updatePayload.$unset = { pendingEmployeeCount: 1 };
    }
    const updated = await this.orgModel.findByIdAndUpdate(id, updatePayload, { new: true }).lean().exec();
    return updated as Organization | null;
  }
}
