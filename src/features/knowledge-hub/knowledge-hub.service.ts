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
import { KnowledgeSolutionVote } from './knowledge-solution-vote.entity';
import { InitiativeService } from '../initiative/initiative.service';
import { User, UserRole } from '../auth/user.entity';

@Injectable()
export class KnowledgeHubService implements OnModuleInit {
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'knowledge');

  constructor(
    @InjectModel('KnowledgeEntry') private readonly entryModel: Model<KnowledgeEntry>,
    @InjectModel('KnowledgeSolutionVote')
    private readonly voteModel: Model<KnowledgeSolutionVote>,
    private readonly initiativeService: InitiativeService,
  ) {}

  /** Link-format bodies must include a non-empty Description block (matches Knowledge Hub UI). */
  private assertLinkContributionHasDescription(text: string): void {
    const t = text.trim();
    if (!/^Link:/i.test(t)) return;
    const m = t.match(/Description:\s*([\s\S]*)/i);
    const desc = (m?.[1] ?? '').trim();
    if (!desc) {
      throw new HttpException(
        'Link contributions must include a non-empty description.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

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
    const entries = await this.entryModel
      .find({ organizationId: orgOid, initiativeId: iniOid })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const uid = user._id;
    if (!uid) return entries;

    const userOid =
      typeof uid === 'string' ? new mongoose.Types.ObjectId(uid) : (uid as mongoose.Types.ObjectId);

    const entryIds = entries.map((e) => String(e._id));
    if (entryIds.length === 0) return entries;

    const votes = await this.voteModel
      .find({
        organizationId: orgOid,
        entryId: { $in: entryIds.map((id) => new mongoose.Types.ObjectId(id)) },
        userId: userOid,
      })
      .lean()
      .exec();

    const voteByEntryId = new Map<string, 'up' | 'down'>(
      votes.map((v) => [String(v.entryId), v.direction]),
    );

    return entries.map((e) => ({
      ...e,
      mySolutionVote: voteByEntryId.get(String(e._id)) ?? undefined,
    }));
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
    this.assertLinkContributionHasDescription(text);
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

  async updateTextEntry(user: Partial<User>, entryId: string, text: string) {
    const orgIdStr = this.getOrgId(user);
    const orgOid = this.toObjectId(orgIdStr);
    const eid = this.toObjectId(entryId);
    if (!orgOid || !eid) {
      throw new HttpException('Invalid id', HttpStatus.BAD_REQUEST);
    }

    const entry = await this.entryModel
      .findOne({ _id: eid, organizationId: orgOid, kind: 'text' })
      .lean()
      .exec();
    if (!entry) {
      throw new HttpException('Text entry not found.', HttpStatus.NOT_FOUND);
    }

    const uid = user._id;
    const userIdStr =
      uid == null
        ? ''
        : typeof uid === 'string'
          ? uid
          : (uid as { toString?: () => string }).toString?.() ?? String(uid);
    const authorId = (entry as unknown as { authorId?: { toString?: () => string } }).authorId;
    const authorIdStr = authorId?.toString?.() ?? '';
    const canManage = user.role === UserRole.ADMIN || user.role === UserRole.MANAGER;
    const isAuthor = Boolean(userIdStr && authorIdStr && userIdStr === authorIdStr);
    if (!canManage && !isAuthor) {
      throw new HttpException('You cannot edit this contribution.', HttpStatus.FORBIDDEN);
    }

    this.assertLinkContributionHasDescription(text);

    const updated = await this.entryModel
      .findOneAndUpdate(
        { _id: eid, organizationId: orgOid, kind: 'text' },
        { $set: { textBody: text.trim() } },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) {
      throw new HttpException('Text entry not found.', HttpStatus.NOT_FOUND);
    }
    return updated;
  }

  async voteSolution(
    user: Partial<User>,
    entryId: string,
    direction: 'up' | 'down',
  ) {
    const orgIdStr = this.getOrgId(user);
    const orgOid = this.toObjectId(orgIdStr);
    const eid = this.toObjectId(entryId);
    if (!orgOid || !eid) {
      throw new HttpException('Invalid id', HttpStatus.BAD_REQUEST);
    }

    const uid = user._id;
    if (!uid) throw new HttpException('Invalid user', HttpStatus.BAD_REQUEST);
    const userOid =
      typeof uid === 'string' ? new mongoose.Types.ObjectId(uid) : (uid as mongoose.Types.ObjectId);

    const entryForVote = await this.entryModel
      .findOne({ _id: eid, organizationId: orgOid, kind: 'text' })
      .lean()
      .exec();
    if (!entryForVote) throw new HttpException('Entry not found.', HttpStatus.NOT_FOUND);

    const authorId = (entryForVote as unknown as { authorId?: { toString?: () => string } }).authorId;
    const authorIdStr = authorId?.toString?.() ?? '';
    if (authorIdStr && authorIdStr === userOid.toString()) {
      throw new HttpException('You cannot vote on your own contribution.', HttpStatus.FORBIDDEN);
    }

    const existing = await this.voteModel
      .findOne({ organizationId: orgOid, entryId: eid, userId: userOid })
      .lean()
      .exec();

    // One vote per user per contribution:
    // - Clicking the same direction again rolls back (removes the vote + decrements).
    // - Clicking the opposite direction switches the vote (adjusts counters).
    if (existing) {
      const existingDir = existing.direction;
      if (existingDir === direction) {
        // Rollback
        await this.voteModel.deleteOne({ _id: existing._id });
        const inc =
          direction === 'up' ? { solutionUpvotes: -1 } : { solutionDownvotes: -1 };
        const updated = await this.entryModel
          .findOneAndUpdate(
            { _id: eid, organizationId: orgOid, kind: 'text' },
            { $inc: inc },
            { new: true },
          )
          .lean()
          .exec();
        if (!updated) throw new HttpException('Entry not found.', HttpStatus.NOT_FOUND);
        return { ...updated, mySolutionVote: undefined };
      }

      // Switch vote direction
      await this.voteModel.updateOne({ _id: existing._id }, { direction });
      const inc =
        existingDir === 'up' && direction === 'down'
          ? { solutionUpvotes: -1, solutionDownvotes: 1 }
          : { solutionUpvotes: 1, solutionDownvotes: -1 };

      const updated = await this.entryModel
        .findOneAndUpdate(
          { _id: eid, organizationId: orgOid, kind: 'text' },
          { $inc: inc },
          { new: true },
        )
        .lean()
        .exec();
      if (!updated) throw new HttpException('Entry not found.', HttpStatus.NOT_FOUND);
      return { ...updated, mySolutionVote: direction };
    }

    await this.voteModel.create({
      organizationId: orgOid,
      entryId: eid,
      userId: userOid,
      direction,
    });

    const inc =
      direction === 'up' ? { solutionUpvotes: 1 } : { solutionDownvotes: 1 };

    const updated = await this.entryModel
      .findOneAndUpdate(
        { _id: eid, organizationId: orgOid, kind: 'text' },
        { $inc: inc },
        { new: true },
      )
      .lean()
      .exec();

    if (!updated) throw new HttpException('Entry not found.', HttpStatus.NOT_FOUND);

    return { ...updated, mySolutionVote: direction };
  }

  async deleteEntry(user: Partial<User>, entryId: string) {
    const orgIdStr = this.getOrgId(user);
    const orgOid = this.toObjectId(orgIdStr);
    const eid = this.toObjectId(entryId);
    if (!orgOid || !eid) {
      throw new HttpException('Invalid id', HttpStatus.BAD_REQUEST);
    }

    const entry = await this.entryModel
      .findOne({ _id: eid, organizationId: orgOid })
      .lean()
      .exec();
    if (!entry) {
      throw new HttpException('Entry not found.', HttpStatus.NOT_FOUND);
    }

    if (entry.kind === 'file' && entry.storedFileName) {
      const fullPath = path.join(this.uploadDir, entry.storedFileName);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch {
          // ignore fs deletion errors; db record will be removed anyway
        }
      }
    }

    await this.voteModel.deleteMany({ organizationId: orgOid, entryId: eid }).exec();
    await this.entryModel.deleteOne({ _id: eid, organizationId: orgOid }).exec();

    return { message: 'Entry deleted.' };
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
