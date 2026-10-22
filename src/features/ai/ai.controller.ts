import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../auth/user.entity';
import { AiService } from './ai.service';
import { AiCommunicationService } from './ai-communication.service';
import { AiInitiativeHealthService } from './ai-initiative-health.service';
import { AiRiskService } from './ai-risk.service';
import { AiAssessmentService } from './ai-assessment.service';
import { AiKnowledgeService } from './ai-knowledge.service';
import { AiStakeholderService } from './ai-stakeholder.service';
import { AiAdoptionService } from './ai-adoption.service';
import { AiInitiativeDraftService } from './ai-initiative-draft.service';
import { DraftInitiativeDto } from './dto/draft-initiative.dto';
import { AiKudosService } from './ai-kudos.service';
import { DraftKudosDto } from './dto/draft-kudos.dto';
import { AiAssessmentGeneratorService } from './ai-assessment-generator.service';
import { GenerateAssessmentDto } from './dto/generate-assessment.dto';
import { AiChatService } from './ai-chat.service';
import { ChatDto } from './dto/chat.dto';
import { DraftCommunicationDto } from './dto/draft-communication.dto';
import { AssessRiskDto } from './dto/assess-risk.dto';
import { AskKnowledgeDto } from './dto/ask-knowledge.dto';

function getOrgId(user: Partial<User>): string | undefined {
  const raw = (user as { organizationId?: { toString: () => string } }).organizationId;
  return raw?.toString?.() ?? (user as { organizationId?: string }).organizationId;
}

@ApiTags('ai')
@Controller('ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly communications: AiCommunicationService,
    private readonly initiativeHealth: AiInitiativeHealthService,
    private readonly risks: AiRiskService,
    private readonly assessments: AiAssessmentService,
    private readonly knowledge: AiKnowledgeService,
    private readonly stakeholders: AiStakeholderService,
    private readonly adoption: AiAdoptionService,
    private readonly initiativeDrafts: AiInitiativeDraftService,
    private readonly kudos: AiKudosService,
    private readonly assessmentGenerator: AiAssessmentGeneratorService,
    private readonly chatService: AiChatService,
  ) {}

  /** Every AI request: resolve the caller's organization and apply the per-user rate limit. */
  private begin(user: Partial<User>): string {
    const orgId = getOrgId(user);
    if (!orgId) throw new BadRequestException('Not linked to an organization.');
    this.ai.checkRateLimit(String(user._id ?? orgId));
    return orgId;
  }

  /** Lets the frontend hide AI buttons when no key is configured. */
  @Get('status')
  status() {
    return { enabled: this.ai.isEnabled };
  }

  /** "Navi AI" assistant: answers questions using read-only, org-scoped tools. */
  @Post('chat')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async chat(@Body() dto: ChatDto, @CurrentUser() user: Partial<User>) {
    return this.chatService.chat(dto.messages, user, this.begin(user), dto.currentInitiativeId);
  }

  @Post('communications/draft')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async draftCommunication(@Body() dto: DraftCommunicationDto, @CurrentUser() user: Partial<User>) {
    return this.communications.draft(dto, this.begin(user));
  }

  @Post('initiatives/draft')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async draftInitiative(@Body() dto: DraftInitiativeDto, @CurrentUser() user: Partial<User>) {
    this.begin(user);
    return this.initiativeDrafts.draft(dto);
  }

  @Post('initiatives/:id/health')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async getInitiativeHealth(@Param('id') id: string, @CurrentUser() user: Partial<User>) {
    return this.initiativeHealth.summarize(id, this.begin(user));
  }

  @Post('initiatives/:id/risks/suggest')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async suggestRisks(@Param('id') id: string, @CurrentUser() user: Partial<User>) {
    return this.risks.suggest(id, this.begin(user));
  }

  @Post('risks/assess')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async assessRisk(@Body() dto: AssessRiskDto, @CurrentUser() user: Partial<User>) {
    return this.risks.assess(dto, this.begin(user));
  }

  @Post('initiatives/:id/stakeholders/analyze')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async analyzeStakeholders(@Param('id') id: string, @CurrentUser() user: Partial<User>) {
    return this.stakeholders.analyze(id, this.begin(user));
  }

  @Post('initiatives/:id/adoption/explain')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async explainAdoption(@Param('id') id: string, @CurrentUser() user: Partial<User>) {
    return this.adoption.explain(id, this.begin(user));
  }

  @Post('assessments/generate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async generateAssessment(@Body() dto: GenerateAssessmentDto, @CurrentUser() user: Partial<User>) {
    return this.assessmentGenerator.generate(dto, this.begin(user));
  }

  @Post('assessments/:id/insights')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async assessmentInsights(@Param('id') id: string, @CurrentUser() user: Partial<User>) {
    return this.assessments.summarize(id, this.begin(user));
  }

  @Post('kudos/draft')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async draftKudos(@Body() dto: DraftKudosDto, @CurrentUser() user: Partial<User>) {
    return this.kudos.draft(dto, user, this.begin(user));
  }

  /** Semantic search over an initiative's Knowledge Hub (same audience as the hub itself). */
  @Post('knowledge/search')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  async searchKnowledge(@Body() dto: AskKnowledgeDto, @CurrentUser() user: Partial<User>) {
    return { results: await this.knowledge.search(dto.initiativeId, this.begin(user), dto.question) };
  }

  @Post('knowledge/ask')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  async askKnowledge(@Body() dto: AskKnowledgeDto, @CurrentUser() user: Partial<User>) {
    return this.knowledge.ask(dto.initiativeId, this.begin(user), dto.question);
  }
}
