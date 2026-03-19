import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
  StreamableFile,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { createReadStream } from 'fs';
import { KnowledgeEntry } from './knowledge-entry.entity';
import { InitiativeService } from '../initiative/initiative.service';
import { User } from '../auth/user.entity';

@Injectable()
export class KnowledgeHubService implements OnModuleInit {
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'knowledge');

  constructor(
    @InjectModel('KnowledgeEntry') private readonly entryModel: Model<KnowledgeEntry>,
    private readonly initiativeService: InitiativeService,
  ) {}

  onModuleInit() {
    fs.mkdirSync(this.uploadDir, { recursive: true });
  }

  private getOrgId(user: Partial<User>): string {
    const orgId = user.organizationId;
    if (!orgId) {
      throw new HttpException('Not linked to an organization.', HttpStatus.FORBIDDEN);
    }
    return typeof orgId === 'string' ? orgId : (orgId as { toString: () => string }).toString();
  }

  private toObjectId(value: string): mongoose.Types.ObjectId | null {
    if (!value || typeof value !== 'string') return null;
    if (mongoose.Types.ObjectId.isValid(value)) {
      return new mongoose.Types.ObjectId(value);
    }
    return null;
  }

  private async assertInitiativeInOrg(initiativeId: string, orgIdStr: string) {
    const ini = await this.initiativeService.findOne(initiativeId, orgIdStr);
    if (!ini) {
      throw new HttpException('Initiative not found.', HttpStatus.NOT_FOUND);
    }
    return ini;
  }

  async listEntries(user: Partial<User>, initiativeId: string) {
    const orgIdStr = this.getOrgId(user);
    await this.assertInitiativeInOrg(initiativeId, orgIdStr);
    const orgOid = this.toObjectId(orgIdStr);
    const iniOid = this.toObjectId(initiativeId);
    if (!orgOid || !iniOid) {
      throw new HttpException('Invalid id', HttpStatus.BAD_REQUEST);
    }
    return this.entryModel
      .find({ organizationId: orgOid, initiativeId: iniOid })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async addText(user: Partial<User>, initiativeId: string, text: string) {
    const orgIdStr = this.getOrgId(user);
    await this.assertInitiativeInOrg(initiativeId, orgIdStr);
    const orgOid = this.toObjectId(orgIdStr);
    const iniOid = this.toObjectId(initiativeId);
    const uid = user._id;
    if (!orgOid || !iniOid || !uid) {
      throw new HttpException('Invalid request', HttpStatus.BAD_REQUEST);
    }
    const authorId =
      typeof uid === 'string' ? new mongoose.Types.ObjectId(uid) : (uid as mongoose.Types.ObjectId);
    const created = await this.entryModel.create({
      organizationId: orgOid,
      initiativeId: iniOid,
      authorId,
      authorName: user.name ?? 'User',
      kind: 'text',
      textBody: text.trim(),
    });
    return created.toObject ? created.toObject() : created;
  }

  async addFile(
    user: Partial<User>,
    initiativeId: string,
    file: Express.Multer.File | undefined,
  ) {
    if (!file?.filename) {
      throw new HttpException('File required', HttpStatus.BAD_REQUEST);
    }
    const orgIdStr = this.getOrgId(user);
    await this.assertInitiativeInOrg(initiativeId, orgIdStr);
    const orgOid = this.toObjectId(orgIdStr);
    const iniOid = this.toObjectId(initiativeId);
    const uid = user._id;
    if (!orgOid || !iniOid || !uid) {
      throw new HttpException('Invalid request', HttpStatus.BAD_REQUEST);
    }
    const authorId =
      typeof uid === 'string' ? new mongoose.Types.ObjectId(uid) : (uid as mongoose.Types.ObjectId);
    const created = await this.entryModel.create({
      organizationId: orgOid,
      initiativeId: iniOid,
      authorId,
      authorName: user.name ?? 'User',
      kind: 'file',
      storedFileName: file.filename,
      originalFileName: file.originalname,
      mimeType: file.mimetype || 'application/octet-stream',
    });
    return created.toObject ? created.toObject() : created;
  }

  async getFileForDownload(user: Partial<User>, entryId: string): Promise<StreamableFile> {
    const orgIdStr = this.getOrgId(user);
    const orgOid = this.toObjectId(orgIdStr);
    const eid = this.toObjectId(entryId);
    if (!orgOid || !eid) {
      throw new HttpException('Invalid id', HttpStatus.BAD_REQUEST);
    }
    const entry = await this.entryModel.findOne({ _id: eid, organizationId: orgOid }).lean().exec();
    if (!entry || entry.kind !== 'file' || !entry.storedFileName) {
      throw new HttpException('File not found.', HttpStatus.NOT_FOUND);
    }
    const fullPath = path.join(this.uploadDir, entry.storedFileName);
    if (!fs.existsSync(fullPath)) {
      throw new HttpException('File missing on server.', HttpStatus.NOT_FOUND);
    }
    const stream = createReadStream(fullPath);
    const name = entry.originalFileName || 'download';
    const mime = entry.mimeType || 'application/octet-stream';
    return new StreamableFile(stream, {
      type: mime,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    });
  }

}
