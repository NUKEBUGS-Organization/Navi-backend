import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomInt } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserRole } from './user.entity';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import {
  ChangePasswordDto,
  CreateUserDto,
  LoginDto,
  ResetPasswordDto,
  SendAccessEmailsDto,
  SignupDto,
  UpdateUserDto,
} from './dto/auth.dto';
import { Organization } from '../organization/organization.entity';
import { PasswordResetOtp } from './password-reset-otp.entity';
import { MailService } from '../mail/mail.service';
import { hashPassword, comparePassword } from '../../utils/HashPassword';

const SUPER_ADMIN_EMAIL = 'superadmin@gmail.com';

/** Super admins seeded on startup; also reset on failed login for these emails. */
const SEED_SUPER_ADMINS: { email: string; password: string; name: string }[] = [
  { email: 'superadmin@gmail.com', password: 'karaboyce', name: 'Super Admin' },
  { email: 'superadmin2@gmail.com', password: 'superadmin', name: 'Super Admin 2' },
  { email: 'superadmin@azib.com', password: 'azib@123', name: 'Super Admin' },
];
const SEED_SUPER_ADMIN_EMAILS = new Set(SEED_SUPER_ADMINS.map((s) => s.email));

const PASSWORD_RESET_OTP_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;

function generateSixDigitOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function escapeHtmlEmail(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeOrgNameForPassword(name: string): string {
  const compact = name.trim().replace(/@/g, '').replace(/\s+/g, '');
  const base = compact.length > 0 ? compact : 'Organization';
  return base.length > 48 ? base.slice(0, 48) : base;
}

function generateRandomPassword(minLen = 12): string {
  const raw = randomBytes(16).toString('base64url');
  return `Aa1${raw}`.slice(0, Math.max(minLen, 12));
}

export interface LoginResponse {
  access_token: string;
  user: Partial<User>;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectModel('PasswordResetOtp') private readonly passwordResetOtpModel: Model<PasswordResetOtp>,
    @InjectModel('Organization') private readonly orgModel: Model<Organization>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  private extractOrgIdString(orgRef: unknown): string | null {
    if (orgRef == null) return null;
    if (typeof orgRef === 'string') return orgRef;
    if (typeof (orgRef as { toString?: () => string }).toString === 'function') {
      return (orgRef as { toString: () => string }).toString();
    }
    return null;
  }

  private async countEmployeesInOrganization(organizationId: string): Promise<number> {
    const orgObjectId = new mongoose.Types.ObjectId(organizationId);
    return this.userModel.countDocuments({
      role: UserRole.EMPLOYEE,
      isActive: { $ne: false },
      $or: [{ organizationId: orgObjectId }, { organizationId }],
    });
  }

  private async assertCanAddEmployees(organizationId: string, additional: number): Promise<void> {
    if (additional <= 0) return;
    const org = await this.orgModel.findById(organizationId).lean().exec();
    if (!org) {
      throw new HttpException('Organization not found.', HttpStatus.BAD_REQUEST);
    }
    const max = Math.max(1, Math.floor(Number((org as { maxEmployeeSeats?: number }).maxEmployeeSeats ?? 100)));
    const current = await this.countEmployeesInOrganization(organizationId);
    if (current + additional > max) {
      throw new HttpException(
        `Employee seat limit reached (${current}/${max}). Contact your super admin to raise the limit or remove employees.`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async getOrganizationPasswordPrefix(organizationId: string): Promise<string> {
    const org = await this.orgModel.findById(organizationId).lean().exec();
    const name = (org as { name?: string } | null)?.name ?? 'Organization';
    return sanitizeOrgNameForPassword(name);
  }

  /**
   * Sends login credentials to a new org user (manager/employee). Does not throw.
   */
  private async sendLoginCredentialsEmail(
    email: string,
    name: string,
    temporaryPassword: string,
  ): Promise<void> {
    const loginBase = (
      this.config.get<string>('FRONTEND_APP_URL') ?? 'https://app.changewithnavi.com'
    ).replace(/\/$/, '');
    const loginUrl = `${loginBase}/`;
    const greeting = name.trim() || 'there';
    const text = [
      `Dear ${greeting},`,
      '',
      'Welcome to NAVI.',
      'An administrator has created an account for you on your organization workspace.',
      '',
      `Sign-in URL: ${loginUrl}`,
      `Username: ${email}`,
      `Temporary password: ${temporaryPassword}`,
      '',
      'For security, please sign in and update your password from Settings when prompted.',
      '',
      'Schedule your onboarding call with NAVI: https://zbooking.us/F2RUo',
      '',
      'Warm regards,',
      'The NAVI Team',
    ].join('\n');
    const html = `<p>Dear ${escapeHtmlEmail(greeting)},</p>
<p>Welcome to NAVI.</p>
<p>An administrator has created an account for you on your organization workspace.</p>
<p><strong>Your Access Details</strong></p>
<ul>
<li><strong>Workspace:</strong> <a href="${escapeHtmlEmail(loginUrl)}">${escapeHtmlEmail(loginUrl)}</a></li>
<li><strong>Username:</strong> ${escapeHtmlEmail(email)}</li>
<li><strong>Temporary Password:</strong> ${escapeHtmlEmail(temporaryPassword)}</li>
</ul>
<p>For security, please sign in and update your password from Settings when prompted.</p>
<p><strong>Onboarding call:</strong> <a href="https://zbooking.us/F2RUo">Book your NAVI onboarding session</a></p>
<p>Warm regards,<br/>The NAVI Team</p>`;
    try {
      await this.mailService.send({
        to: email.trim(),
        subject: 'Your NAVI account is ready',
        text,
        html,
      });
    } catch (e) {
      this.logger.error(
        `Staff welcome email to ${email}: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /** Strip password and return safe user object for API responses */
  sanitizeUser(user: User): Partial<User> {
    const u = user as unknown as Record<string, unknown>;
    const obj = typeof u.toObject === 'function' ? (u.toObject as () => Record<string, unknown>)() : { ...u };
    delete obj.password;
    if (obj._id && typeof (obj._id as { toString?: () => string }).toString === 'function') {
      obj._id = (obj._id as { toString: () => string }).toString();
    }
    return obj as Partial<User>;
  }

  /** Generate JWT for user */
  async loginWithToken(loginDto: LoginDto): Promise<LoginResponse> {
    const user = await this.Login(loginDto);
    if (!user) {
      throw new HttpException(
        'Invalid email or password.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const payload = { sub: (user as User & { _id: string })._id.toString(), email: user.email };
    const access_token = this.jwtService.sign(payload);
    return {
      access_token,
      user: this.sanitizeUser(user),
    };
  }

  async findAll(): Promise<User[]> {
    try {
      return await this.userModel.find();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to fetch users. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** List users in an organization (for org admin and managers). Returns sanitized users. */
  async findAllByOrganization(organizationId: string): Promise<Partial<User>[]> {
    try {
      const orgObjectId = new mongoose.Types.ObjectId(organizationId);
      // Match both ObjectId and string so all org users are returned regardless of storage type
      const users = await this.userModel
        .find({
          $or: [
            { organizationId: orgObjectId },
            { organizationId },
          ],
        })
        .sort({ createdAt: -1 })
        .lean()
        .exec();
      return users.map((u) => this.sanitizeUser(u as User));
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to fetch organization users.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOne(id: string): Promise<User | null> {
    try {
      return await this.userModel.findById(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to fetch user. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async create(
    user: CreateUserDto,
    createdByRole?: UserRole,
    currentUser?: Partial<User>,
    options?: { skipCredentialEmail?: boolean },
  ): Promise<User> {
    try {
      const role = user.role ?? UserRole.EMPLOYEE;
      if (role === UserRole.SUPER_ADMIN) {
        throw new HttpException(
          'Only system can create super admin.',
          HttpStatus.FORBIDDEN,
        );
      }

      const normalizedEmail = user.email.trim().toLowerCase();
      const dup = await this.userModel.findOne({ email: normalizedEmail }).lean().exec();
      if (dup) {
        throw new HttpException('Email already in use.', HttpStatus.BAD_REQUEST);
      }
      user.email = normalizedEmail;

      const isAdminCreator = createdByRole === UserRole.ADMIN;
      const isManagerCreator = createdByRole === UserRole.MANAGER;
      const isOrgAdminOrManager = isAdminCreator || isManagerCreator;

      if (isManagerCreator && role === UserRole.ADMIN) {
        throw new HttpException(
          'Managers cannot create organization admins.',
          HttpStatus.FORBIDDEN,
        );
      }

      if (isOrgAdminOrManager) {
        if (role !== UserRole.ADMIN && role !== UserRole.MANAGER && role !== UserRole.EMPLOYEE) {
          throw new HttpException(
            'You can only create admins, managers, and employees for your organization.',
            HttpStatus.FORBIDDEN,
          );
        }
        const orgId = currentUser?.organizationId;
        if (!orgId) {
          throw new HttpException(
            'Your account is not linked to an organization.',
            HttpStatus.FORBIDDEN,
          );
        }
        const orgIdForDb =
          typeof orgId === 'string'
            ? new mongoose.Types.ObjectId(orgId)
            : (orgId as mongoose.Types.ObjectId);
        (user as CreateUserDto & { organizationId?: unknown }).organizationId = orgIdForDb;
      }

      if (role === UserRole.ADMIN && createdByRole === UserRole.SUPER_ADMIN && !user.organizationId) {
        throw new HttpException(
          'Organization is required when creating an admin.',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (
        (role === UserRole.EMPLOYEE || role === UserRole.MANAGER) &&
        createdByRole === UserRole.SUPER_ADMIN &&
        !user.organizationId
      ) {
        throw new HttpException(
          'Organization is required when creating this user.',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (createdByRole === UserRole.SUPER_ADMIN && user.organizationId) {
        const o = user.organizationId;
        const orgIdForDb =
          typeof o === 'string' ? new mongoose.Types.ObjectId(o) : (o as mongoose.Types.ObjectId);
        (user as CreateUserDto & { organizationId?: unknown }).organizationId = orgIdForDb;
      }

      if (!user.role) user.role = role;

      const orgIdStr = this.extractOrgIdString(
        (user as { organizationId?: unknown }).organizationId ?? currentUser?.organizationId,
      );

      let plainPassword: string;

      if (
        role === UserRole.EMPLOYEE &&
        orgIdStr &&
        (isOrgAdminOrManager || createdByRole === UserRole.SUPER_ADMIN)
      ) {
        await this.assertCanAddEmployees(orgIdStr, 1);
        const prefix = await this.getOrganizationPasswordPrefix(orgIdStr);
        const nextIndex = (await this.countEmployeesInOrganization(orgIdStr)) + 1;
        plainPassword = `${prefix}@${nextIndex}`;
        user.password = await hashPassword(plainPassword);
      } else {
        const p = user.password?.trim();
        if (!p || p.length < 8) {
          throw new HttpException(
            'Password is required (min 8 characters) unless creating an employee in an organization.',
            HttpStatus.BAD_REQUEST,
          );
        }
        plainPassword = p;
        user.password = await hashPassword(plainPassword);
      }

      if (user.phoneNumber !== undefined) {
        (user as CreateUserDto & { phoneNumber?: string }).phoneNumber = user.phoneNumber.trim();
      }

      const createdUser = new this.userModel(user);
      const saved = await createdUser.save();

      if (!options?.skipCredentialEmail && plainPassword && saved.email) {
        this.sendLoginCredentialsEmail(saved.email, saved.name ?? 'Staff', plainPassword).catch(() => {});
      }
      return saved;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to create user. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async Signup(user: SignupDto): Promise<User> {
    try {
      const existingUser = await this.userModel.findOne({ email: user.email });
      if (existingUser) {
        throw new HttpException(
          'Email already in use. Please use a different email.',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (user.password) {
        user.password = await hashPassword(user.password);
      }
      const createdUser = new this.userModel({
        ...user,
        role: UserRole.EMPLOYEE,
      });
      return await createdUser.save();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to sign up user. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async Login(loginDto: LoginDto): Promise<User | null> {
    try {
      const email = typeof loginDto.email === 'string' ? loginDto.email.trim() : '';
      let user = await this.userModel.findOne({ email }).select('+password');
      if (!user && SEED_SUPER_ADMIN_EMAILS.has(email)) {
        await this.seedSuperAdmins();
        user = await this.userModel.findOne({ email }).select('+password');
      }
      if (!user) {
        throw new HttpException(
          'Invalid email or password.',
          HttpStatus.UNAUTHORIZED,
        );
      }
      const storedHash = (user as unknown as { password?: string }).password;
      let isValid = storedHash ? await comparePassword(loginDto.password, storedHash) : false;
      if (!isValid && SEED_SUPER_ADMIN_EMAILS.has(email)) {
        await this.seedSuperAdmins();
        user = await this.userModel.findOne({ email }).select('+password');
        if (user) {
          const retryHash = (user as unknown as { password?: string }).password;
          isValid = retryHash ? await comparePassword(loginDto.password, retryHash) : false;
        }
      }
      if (!isValid) {
        throw new HttpException(
          'Invalid email or password.',
          HttpStatus.UNAUTHORIZED,
        );
      }
      return user;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to login. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  /**
   * Public forgot-password: if user exists, store OTP and email it. Response is generic for privacy.
   */
  async requestPasswordResetOtp(emailRaw: string): Promise<{ message: string }> {
    const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
    const genericMessage =
      'If an account exists for this email, you will receive a verification code shortly.';
    if (!email) {
      return { message: genericMessage };
    }

    const user = await this.userModel.findOne({ email }).lean().exec();
    if (!user) {
      return { message: genericMessage };
    }

    const existing = await this.passwordResetOtpModel
      .findOne({ email })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    if (existing?.createdAt) {
      const elapsed = Date.now() - new Date(existing.createdAt).getTime();
      if (elapsed < PASSWORD_RESET_RESEND_COOLDOWN_MS) {
        throw new HttpException(
          'Please wait a minute before requesting another code.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const otp = generateSixDigitOtp();
    const codeHash = await hashPassword(otp);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_OTP_TTL_MS);

    await this.passwordResetOtpModel.deleteMany({ email }).exec();
    await this.passwordResetOtpModel.create({
      email,
      codeHash,
      expiresAt,
      attempts: 0,
    });

    const text = [
      'Your NAVI password reset code is:',
      '',
      otp,
      '',
      `This code expires in ${PASSWORD_RESET_OTP_TTL_MS / 60000} minutes.`,
      'If you did not request this, you can ignore this email.',
    ].join('\n');
    const html = `<p>Your NAVI password reset code is:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${otp}</p><p>This code expires in ${PASSWORD_RESET_OTP_TTL_MS / 60000} minutes.</p><p>If you did not request this, you can ignore this email.</p>`;

    try {
      await this.mailService.send({
        to: email,
        subject: 'NAVI — Password reset code',
        text,
        html,
      });
    } catch (err) {
      await this.passwordResetOtpModel.deleteMany({ email }).exec();
      this.logger.error(`Password reset email failed for ${email}: ${err instanceof Error ? err.message : err}`);
      throw new HttpException(
        'Could not send reset email. Check mail configuration or try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (this.mailService.isDryRun()) {
      this.logger.log(`[PASSWORD_RESET_OTP] ${email} code=${otp} (MAIL_DRY_RUN)`);
    }

    return { message: genericMessage };
  }

  async resetPasswordWithOtp(dto: ResetPasswordDto): Promise<{ message: string }> {
    const email = dto.email.trim().toLowerCase();
    const doc = await this.passwordResetOtpModel
      .findOne({ email, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .exec();

    if (!doc) {
      throw new HttpException(
        'Invalid or expired code. Request a new one from Forgot password.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if ((doc.attempts ?? 0) >= PASSWORD_RESET_MAX_ATTEMPTS) {
      await this.passwordResetOtpModel.deleteOne({ _id: doc._id }).exec();
      throw new HttpException(
        'Too many failed attempts. Request a new code.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const match = await comparePassword(dto.otp, doc.codeHash);
    if (!match) {
      await this.passwordResetOtpModel
        .updateOne({ _id: doc._id }, { $inc: { attempts: 1 } })
        .exec();
      const left = PASSWORD_RESET_MAX_ATTEMPTS - (doc.attempts ?? 0) - 1;
      throw new HttpException(
        left > 0
          ? `Invalid code. ${left} attempt(s) remaining.`
          : 'Invalid code. Request a new one.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const user = await this.userModel.findOne({ email }).select('+password').exec();
    if (!user) {
      await this.passwordResetOtpModel.deleteOne({ _id: doc._id }).exec();
      throw new HttpException('User not found.', HttpStatus.NOT_FOUND);
    }

    user.password = await hashPassword(dto.newPassword);
    await user.save();
    await this.passwordResetOtpModel.deleteMany({ email }).exec();

    return { message: 'Your password has been updated. You can sign in now.' };
  }

  async ChangePassword(
    changePasswordDto: ChangePasswordDto,
  ): Promise<User | null> {
    try {
      const user = await this.userModel
        .findOne({ email: changePasswordDto.email.trim().toLowerCase() })
        .select('+password');
      if (!user) {
        throw new HttpException(
          'User not found with the provided email.',
          HttpStatus.NOT_FOUND,
        );
      }
      const isValid = await comparePassword(
        changePasswordDto.oldPassword,
        user.password,
      );
      if (!isValid) {
        throw new HttpException(
          'Old password is incorrect.',
          HttpStatus.UNAUTHORIZED,
        );
      }
      user.password = await hashPassword(changePasswordDto.newPassword);
      return await user.save();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to change password. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    currentUser?: Partial<User>,
  ): Promise<User | null> {
    try {
      const target = await this.userModel.findById(id).lean().exec();
      if (!target) {
        throw new HttpException('User not found.', HttpStatus.NOT_FOUND);
      }
      const targetUser = target as User & { organizationId?: unknown };
      const callerRole = currentUser?.role;

      if (callerRole === UserRole.ADMIN) {
        const callerOrgId =
          (currentUser as { organizationId?: { toString?: () => string } })?.organizationId?.toString?.() ??
          (currentUser as { organizationId?: string })?.organizationId;
        const targetOrgId =
          (targetUser.organizationId as { toString?: () => string })?.toString?.() ??
          (targetUser.organizationId as string | undefined);
        if (!callerOrgId || callerOrgId !== targetOrgId) {
          throw new HttpException(
            'You can only update users in your organization.',
            HttpStatus.FORBIDDEN,
          );
        }
        const allowedRole =
          dto.role === UserRole.ADMIN || dto.role === UserRole.MANAGER || dto.role === UserRole.EMPLOYEE
            ? dto.role
            : undefined;
        const updatePayload: Record<string, unknown> = {};
        if (dto.name !== undefined) updatePayload.name = dto.name;
        if (dto.email !== undefined) updatePayload.email = dto.email;
        if (allowedRole !== undefined) updatePayload.role = allowedRole;
        if (dto.departments !== undefined) updatePayload.departments = dto.departments;
        if (dto.isActive !== undefined) updatePayload.isActive = dto.isActive;
        if (dto.phoneNumber !== undefined) updatePayload.phoneNumber = dto.phoneNumber.trim();
        if (dto.password?.trim()) {
          updatePayload.password = await hashPassword(dto.password);
        }
        if (dto.photoDataUrl !== undefined) {
          const s = dto.photoDataUrl.trim();
          if (s.length > 450000) {
            throw new HttpException('Profile image is too large.', HttpStatus.BAD_REQUEST);
          }
          updatePayload.photoDataUrl = s || null;
        }
        const updated = await this.userModel
          .findByIdAndUpdate(id, { $set: updatePayload }, { new: true })
          .exec();
        return updated ?? null;
      }

      if (callerRole === UserRole.MANAGER) {
        const callerOrgId =
          (currentUser as { organizationId?: { toString?: () => string } })?.organizationId?.toString?.() ??
          (currentUser as { organizationId?: string })?.organizationId;
        const targetOrgId =
          (targetUser.organizationId as { toString?: () => string })?.toString?.() ??
          (targetUser.organizationId as string | undefined);
        if (!callerOrgId || callerOrgId !== targetOrgId) {
          throw new HttpException(
            'You can only update users in your organization.',
            HttpStatus.FORBIDDEN,
          );
        }
        const targetRole = (target as User & { role?: UserRole }).role;
        if (targetRole === UserRole.ADMIN) {
          throw new HttpException(
            'Managers cannot modify organization admins.',
            HttpStatus.FORBIDDEN,
          );
        }
        if (dto.role === UserRole.ADMIN) {
          throw new HttpException(
            'Managers cannot assign the admin role.',
            HttpStatus.FORBIDDEN,
          );
        }
        const allowedRole =
          dto.role === UserRole.MANAGER || dto.role === UserRole.EMPLOYEE ? dto.role : undefined;
        const updatePayload: Record<string, unknown> = {};
        if (dto.name !== undefined) updatePayload.name = dto.name;
        if (dto.email !== undefined) updatePayload.email = dto.email;
        if (allowedRole !== undefined) updatePayload.role = allowedRole;
        if (dto.departments !== undefined) updatePayload.departments = dto.departments;
        if (dto.isActive !== undefined) updatePayload.isActive = dto.isActive;
        if (dto.phoneNumber !== undefined) updatePayload.phoneNumber = dto.phoneNumber.trim();
        if (dto.password?.trim()) {
          updatePayload.password = await hashPassword(dto.password);
        }
        if (dto.photoDataUrl !== undefined) {
          const s = dto.photoDataUrl.trim();
          if (s.length > 450000) {
            throw new HttpException('Profile image is too large.', HttpStatus.BAD_REQUEST);
          }
          updatePayload.photoDataUrl = s || null;
        }
        const updated = await this.userModel
          .findByIdAndUpdate(id, { $set: updatePayload }, { new: true })
          .exec();
        return updated ?? null;
      }

      const payload: Record<string, unknown> = { ...dto } as Record<string, unknown>;
      if (typeof payload.password === 'string' && payload.password.trim()) {
        payload.password = await hashPassword(payload.password as string);
      }
      const updated = await this.userModel
        .findByIdAndUpdate(id, { $set: payload }, { new: true })
        .exec();
      return updated ?? null;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to update user. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async delete(id: string, currentUser?: Partial<User>): Promise<void> {
    try {
      const target = await this.userModel.findById(id).lean().exec();
      if (!target) {
        throw new HttpException('User not found.', HttpStatus.NOT_FOUND);
      }
      const callerRole = currentUser?.role;
      if (callerRole === UserRole.ADMIN) {
        const callerOrgId =
          (currentUser as { organizationId?: { toString?: () => string } })?.organizationId?.toString?.() ??
          (currentUser as { organizationId?: string })?.organizationId;
        const targetUser = target as User & { organizationId?: unknown };
        const targetOrgId =
          (targetUser.organizationId as { toString?: () => string })?.toString?.() ??
          (targetUser.organizationId as string | undefined);
        if (!callerOrgId || callerOrgId !== targetOrgId) {
          throw new HttpException(
            'You can only delete users in your organization.',
            HttpStatus.FORBIDDEN,
          );
        }
        const currentUserId = (currentUser as User & { _id?: unknown })._id?.toString?.() ?? (currentUser as { _id?: string })._id;
        if (currentUserId && id === currentUserId) {
          throw new HttpException(
            'You cannot delete your own account.',
            HttpStatus.FORBIDDEN,
          );
        }
      } else if (callerRole === UserRole.MANAGER) {
        const callerOrgId =
          (currentUser as { organizationId?: { toString?: () => string } })?.organizationId?.toString?.() ??
          (currentUser as { organizationId?: string })?.organizationId;
        const targetUser = target as User & { organizationId?: unknown; role?: UserRole };
        const targetOrgId =
          (targetUser.organizationId as { toString?: () => string })?.toString?.() ??
          (targetUser.organizationId as string | undefined);
        if (!callerOrgId || callerOrgId !== targetOrgId) {
          throw new HttpException(
            'You can only delete users in your organization.',
            HttpStatus.FORBIDDEN,
          );
        }
        if (targetUser.role === UserRole.ADMIN) {
          throw new HttpException(
            'Managers cannot delete organization admins.',
            HttpStatus.FORBIDDEN,
          );
        }
        const currentUserId = (currentUser as User & { _id?: unknown })._id?.toString?.() ?? (currentUser as { _id?: string })._id;
        if (currentUserId && id === currentUserId) {
          throw new HttpException(
            'You cannot delete your own account.',
            HttpStatus.FORBIDDEN,
          );
        }
      }
      await this.userModel.findByIdAndDelete(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to delete user. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateMyProfile(
    userId: string,
    dto: { name?: string; photoDataUrl?: string },
  ): Promise<Partial<User> | null> {
    const updates: Record<string, unknown> = {};
    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.photoDataUrl !== undefined) {
      const s = dto.photoDataUrl.trim();
      if (s.length > 450000) {
        throw new HttpException('Profile image is too large.', HttpStatus.BAD_REQUEST);
      }
      updates.photoDataUrl = s || null;
    }
    if (Object.keys(updates).length === 0) {
      const u = await this.userModel.findById(userId).exec();
      return u ? this.sanitizeUser(u) : null;
    }
    const updated = await this.userModel.findByIdAndUpdate(userId, { $set: updates }, { new: true }).exec();
    return updated ? this.sanitizeUser(updated) : null;
  }

  async bulkImportUsersFromCsv(
    csvText: string,
    currentUser: Partial<User>,
  ): Promise<{
    created: number;
    skipped: number;
    errors: string[];
    credentials: { email: string; name: string; password: string; phone?: string; role: UserRole }[];
  }> {
    if (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.MANAGER) {
      throw new HttpException('Only organization admins and managers can bulk import.', HttpStatus.FORBIDDEN);
    }
    const orgRaw = currentUser.organizationId;
    const organizationId =
      typeof orgRaw === 'string' ? orgRaw : (orgRaw as { toString?: () => string })?.toString?.();
    if (!organizationId) {
      throw new HttpException('Not linked to an organization.', HttpStatus.FORBIDDEN);
    }

    const isRoleToken = (s: string) => {
      const t = (s ?? '').trim().toLowerCase();
      return t === 'manager' || t === 'admin' || t === 'employee' || t === 'staff';
    };

    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const start = /^name\s*,/i.test(lines[0] ?? '') ? 1 : 0;

    type ParsedRow = {
      rowIndex: number;
      name: string;
      email: string;
      phone: string;
      role: UserRole;
      departments: string[];
    };
    const parsed: ParsedRow[] = [];
    const errors: string[] = [];

    for (let i = start; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
      if (parts.length < 3) {
        errors.push(`Row ${i + 1}: expected name,email[,phone],role[,departments]`);
        continue;
      }
      const name = parts[0];
      const email = parts[1]?.toLowerCase() ?? '';
      let phone = '';
      let roleOffset = 2;
      if (parts.length >= 4 && !isRoleToken(parts[2])) {
        phone = parts[2];
        roleOffset = 3;
      }
      const roleStr = (parts[roleOffset] ?? '').toLowerCase();
      const deptPart = parts.slice(roleOffset + 1).join(',').trim();
      if (!email || !name) {
        continue;
      }
      const role =
        roleStr === 'manager'
          ? UserRole.MANAGER
          : roleStr === 'admin'
            ? UserRole.ADMIN
            : UserRole.EMPLOYEE;
      if (currentUser.role === UserRole.MANAGER && role === UserRole.ADMIN) {
        errors.push(`Row ${i + 1}: managers cannot import organization admins.`);
        continue;
      }
      const departments = deptPart
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean);
      parsed.push({ rowIndex: i + 1, name, email, phone, role, departments });
    }

    let newEmployeeRows = 0;
    for (const row of parsed) {
      if (row.role !== UserRole.EMPLOYEE) continue;
      const existing = await this.userModel.findOne({ email: row.email }).lean().exec();
      if (!existing) newEmployeeRows++;
    }
    await this.assertCanAddEmployees(organizationId, newEmployeeRows);

    let created = 0;
    let skipped = 0;
    const credentials: { email: string; name: string; password: string; phone?: string; role: UserRole }[] = [];

    for (const row of parsed) {
      const existing = await this.userModel.findOne({ email: row.email }).exec();
      if (existing) {
        skipped++;
        continue;
      }
      const plainPasswordForRow =
        row.role === UserRole.EMPLOYEE ? undefined : generateRandomPassword();
      try {
        const saved = await this.create(
          {
            name: row.name,
            email: row.email,
            password: plainPasswordForRow,
            role: row.role,
            departments: row.departments,
            phoneNumber: row.phone || undefined,
          },
          currentUser.role as UserRole,
          currentUser as User,
          { skipCredentialEmail: true },
        );
        created++;
        const plain =
          row.role === UserRole.EMPLOYEE
            ? await this.revealEmployeePasswordFromHash(saved)
            : plainPasswordForRow!;
        credentials.push({
          email: row.email,
          name: row.name,
          password: plain,
          phone: row.phone || undefined,
          role: row.role,
        });
      } catch (e) {
        errors.push(`Row ${row.rowIndex}: ${e instanceof Error ? e.message : 'failed'}`);
        skipped++;
      }
    }

    return { created, skipped, errors, credentials };
  }

  /**
   * Re-derive employee default password after create (same algorithm as create, using count before save).
   * Used only for bulk-import credentials list; avoids widening create()'s return type.
   */
  private async revealEmployeePasswordFromHash(saved: User): Promise<string> {
    const orgIdStr = this.extractOrgIdString((saved as { organizationId?: unknown }).organizationId);
    if (!orgIdStr || saved.role !== UserRole.EMPLOYEE) {
      return '';
    }
    const prefix = await this.getOrganizationPasswordPrefix(orgIdStr);
    const idx = await this.countEmployeesInOrganization(orgIdStr);
    return `${prefix}@${idx}`;
  }

  async sendAccessEmails(
    dto: SendAccessEmailsDto,
    currentUser: Partial<User>,
  ): Promise<{ sent: number; failed: { email: string; reason: string }[] }> {
    if (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.MANAGER) {
      throw new HttpException('Forbidden.', HttpStatus.FORBIDDEN);
    }
    const orgRaw = currentUser.organizationId;
    const organizationId =
      typeof orgRaw === 'string' ? orgRaw : (orgRaw as { toString?: () => string })?.toString?.();
    if (!organizationId) {
      throw new HttpException('Not linked to an organization.', HttpStatus.FORBIDDEN);
    }
    const orgObjectId = new mongoose.Types.ObjectId(organizationId);
    let sent = 0;
    const failed: { email: string; reason: string }[] = [];

    for (const entry of dto.entries ?? []) {
      const email = entry.email.trim().toLowerCase();
      const user = await this.userModel
        .findOne({
          email,
          $or: [{ organizationId: orgObjectId }, { organizationId }],
        })
        .select('+password')
        .exec();
      if (!user) {
        failed.push({ email, reason: 'User not found in your organization.' });
        continue;
      }
      if (currentUser.role === UserRole.MANAGER && user.role === UserRole.ADMIN) {
        failed.push({ email, reason: 'Not allowed.' });
        continue;
      }
      const storedHash = (user as unknown as { password?: string }).password;
      const ok = storedHash ? await comparePassword(entry.password, storedHash) : false;
      if (!ok) {
        failed.push({ email, reason: 'Password does not match the account.' });
        continue;
      }
      await this.sendLoginCredentialsEmail(email, user.name ?? 'Staff', entry.password);
      sent++;
    }

    return { sent, failed };
  }

  /** Ensure all seeded super admins exist with correct credentials. Creates or resets each. */
  async seedSuperAdmins(): Promise<void> {
    for (const { email, password: plainPassword, name } of SEED_SUPER_ADMINS) {
      const password = await hashPassword(plainPassword);
      const existing = await this.userModel.findOne({
        email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      });
      if (existing) {
        await this.userModel.updateOne(
          { _id: existing._id },
          {
            $set: {
              email,
              password,
              role: UserRole.SUPER_ADMIN,
              isActive: true,
              name,
            },
          },
        );
      } else {
        await this.userModel.create({
          name,
          email,
          password,
          role: UserRole.SUPER_ADMIN,
          isActive: true,
        });
      }
    }
  }
}
