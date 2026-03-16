import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { Organization } from './organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { User, UserRole } from '../auth/user.entity';
import { hashPassword } from '../../utils/HashPassword';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectModel('Organization') private readonly orgModel: Model<Organization>,
    @InjectModel('User') private readonly userModel: Model<User>,
  ) {}

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
