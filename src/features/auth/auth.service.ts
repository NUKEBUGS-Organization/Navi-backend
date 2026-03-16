import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
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
  SignupDto,
  UpdateUserDto,
} from './dto/auth.dto';
import { hashPassword, comparePassword } from '../../utils/HashPassword';

const SUPER_ADMIN_EMAIL = 'superadmin@gmail.com';

/** Super admins seeded on startup; also reset on failed login for these emails. */
const SEED_SUPER_ADMINS: { email: string; password: string; name: string }[] = [
  { email: 'superadmin@gmail.com', password: 'karaboyce', name: 'Super Admin' },
  { email: 'superadmin2@gmail.com', password: 'superadmin', name: 'Super Admin 2' },
];
const SEED_SUPER_ADMIN_EMAILS = new Set(SEED_SUPER_ADMINS.map((s) => s.email));

export interface LoginResponse {
  access_token: string;
  user: Partial<User>;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel('User') private readonly userModel: Model<User>,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Placeholder: send login credentials to the new staff member's email.
   * To be implemented when SMTP is provided. Do not throw; failures should not block user creation.
   */
  private async sendLoginCredentialsEmail(
    _email: string,
    _name: string,
    _temporaryPassword: string,
  ): Promise<void> {
    // TODO: integrate SMTP and send email with login link/credentials
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

  /** List users in an organization (for org admin). Returns sanitized users. */
  async findAllByOrganization(organizationId: string): Promise<Partial<User>[]> {
    try {
      const orgObjectId = new mongoose.Types.ObjectId(organizationId);
      const users = await this.userModel
        .find({ organizationId: orgObjectId })
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
  ): Promise<User> {
    try {
      const role = user.role ?? UserRole.EMPLOYEE;
      if (role === UserRole.SUPER_ADMIN) {
        throw new HttpException(
          'Only system can create super admin.',
          HttpStatus.FORBIDDEN,
        );
      }
      if (createdByRole === UserRole.ADMIN) {
        if (role !== UserRole.ADMIN && role !== UserRole.MANAGER && role !== UserRole.EMPLOYEE) {
          throw new HttpException(
            'Organization admins can only create admins, managers, and employees for their organization.',
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
        (user as CreateUserDto & { organizationId?: unknown }).organizationId = orgId;
      }
      if (role === UserRole.ADMIN && createdByRole === UserRole.SUPER_ADMIN && !user.organizationId) {
        throw new HttpException(
          'Organization is required when creating an admin.',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!user.role) user.role = role;
      const plainPassword = user.password ?? null;
      if (user.password) {
        user.password = await hashPassword(user.password);
      }
      const createdUser = new this.userModel(user);
      const saved = await createdUser.save();
      if (plainPassword && user.email) {
        this.sendLoginCredentialsEmail(user.email, user.name ?? 'Staff', plainPassword).catch(() => {});
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
  async ResetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<User | null> {
    try {
      const user = await this.userModel.findOne({ email: resetPasswordDto.email });
      if (!user) {
        throw new HttpException(
          'User not found with the provided email.',
          HttpStatus.NOT_FOUND,
        );
      }
      user.password = await hashPassword(resetPasswordDto.newPassword);
      return await user.save();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to reset password. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async ChangePassword(
    changePasswordDto: ChangePasswordDto,
  ): Promise<User | null> {
    try {
      const user = await this.userModel.findOne({ email: changePasswordDto.email });
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
        if (dto.password?.trim()) {
          updatePayload.password = await hashPassword(dto.password);
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
