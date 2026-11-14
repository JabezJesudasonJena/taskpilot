import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'node:crypto';
import { WorkspaceRole } from '@prisma/client';
import { WorkspacesRepository } from './workspaces.repository.js';
import { MailService } from '../mail/index.js';
import { UsersService } from '../users/index.js';
import {
  validateSlug,
  generateSlug,
  appendRandomSuffix,
} from './utils/slug.util.js';
import {
  canChangeRole,
  canRemoveMember,
  canInviteRole,
  encodeCursor,
  decodeCursor,
  type CursorPaginationDto,
  type PaginatedResponseDto,
} from '../../common/index.js';
import type { RequestWorkspaceMember } from './decorators/current-member.decorator.js';
import type { CreateWorkspaceDto } from './dto/create-workspace.dto.js';
import type { UpdateWorkspaceDto } from './dto/update-workspace.dto.js';
import type { WorkspaceResponseDto } from './dto/workspace-response.dto.js';
import type { WorkspaceMemberResponseDto } from './dto/workspace-member-response.dto.js';
import type { CreateInviteDto } from './dto/create-invite.dto.js';
import type { WorkspaceInviteResponseDto } from './dto/workspace-invite-response.dto.js';
import {
  WorkspaceCreatedEvent,
  WorkspaceMemberRemovedEvent,
  WorkspaceMemberRoleChangedEvent,
  WorkspaceOwnershipTransferredEvent,
  WorkspaceInviteCreatedEvent,
  WorkspaceInviteAcceptedEvent,
  WorkspaceMemberAddedEvent,
} from './events/workspace.events.js';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly mailService: MailService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createWorkspace(
    userId: string,
    dto: CreateWorkspaceDto,
  ): Promise<WorkspaceResponseDto> {
    let slug: string;

    if (dto.slug) {
      validateSlug(dto.slug);
      const existing = await this.workspacesRepository.findWorkspaceBySlug(
        dto.slug,
      );
      if (existing) {
        throw new ConflictException('Slug is already in use');
      }
      slug = dto.slug;
    } else {
      let candidateSlug = generateSlug(dto.name);
      let collision =
        await this.workspacesRepository.findWorkspaceBySlug(candidateSlug);
      let attempts = 0;

      while (collision && attempts < 3) {
        attempts++;
        candidateSlug = appendRandomSuffix(candidateSlug);
        collision =
          await this.workspacesRepository.findWorkspaceBySlug(candidateSlug);
      }

      if (collision) {
        throw new ConflictException(
          'Failed to generate unique slug, please specify one',
        );
      }

      slug = candidateSlug;
    }

    const workspace = await this.workspacesRepository.createWorkspaceWithMember({
      name: dto.name.trim(),
      slug,
      userId,
    });

    this.eventEmitter.emit(
      'workspace.created',
      new WorkspaceCreatedEvent(
        workspace.id,
        userId,
        workspace.name,
        workspace.slug,
      ),
    );

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role: workspace.role,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  }

  async getWorkspace(
    workspaceId: string,
    memberRole: WorkspaceRole,
  ): Promise<WorkspaceResponseDto> {
    const workspace =
      await this.workspacesRepository.findWorkspaceById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role: memberRole,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  }

  async listUserWorkspaces(
    userId: string,
    pagination: CursorPaginationDto,
  ): Promise<PaginatedResponseDto<WorkspaceResponseDto>> {
    const limit = pagination.limit || 20;
    const cursor = pagination.cursor
      ? decodeCursor(pagination.cursor)
      : undefined;

    const records = await this.workspacesRepository.listWorkspacesForUser(
      userId,
      limit,
      cursor,
    );

    let nextCursor: string | null = null;
    let items = records;

    if (records.length > limit) {
      const nextItem = records[limit - 1];
      nextCursor = encodeCursor({
        createdAt: nextItem.createdAt,
        id: nextItem.id,
      });
      items = records.slice(0, limit);
    }

    return {
      items: items.map((w) => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        role: w.role,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
      })),
      nextCursor,
    };
  }

  async updateWorkspace(
    workspaceId: string,
    dto: UpdateWorkspaceDto,
  ): Promise<WorkspaceResponseDto> {
    const workspace =
      await this.workspacesRepository.findWorkspaceById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const dataToUpdate: { name?: string; slug?: string } = {};

    if (dto.name !== undefined) {
      dataToUpdate.name = dto.name.trim();
    }

    if (dto.slug !== undefined && dto.slug !== workspace.slug) {
      validateSlug(dto.slug);
      const existing = await this.workspacesRepository.findWorkspaceBySlug(
        dto.slug,
      );
      if (existing && existing.id !== workspaceId) {
        throw new ConflictException('Slug is already in use');
      }
      dataToUpdate.slug = dto.slug;
    }

    const updated = await this.workspacesRepository.updateWorkspace(
      workspaceId,
      dataToUpdate,
    );

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      role: WorkspaceRole.ADMIN, // caller has minRole ADMIN
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async listMembers(
    workspaceId: string,
    pagination: CursorPaginationDto,
  ): Promise<PaginatedResponseDto<WorkspaceMemberResponseDto>> {
    const limit = pagination.limit || 20;
    const cursor = pagination.cursor
      ? decodeCursor(pagination.cursor)
      : undefined;

    const members = await this.workspacesRepository.listMembers(
      workspaceId,
      limit,
      cursor,
    );

    let nextCursor: string | null = null;
    let items = members;

    if (members.length > limit) {
      const nextItem = members[limit - 1];
      nextCursor = encodeCursor({
        createdAt: nextItem.createdAt,
        id: nextItem.id,
      });
      items = members.slice(0, limit);
    }

    return {
      items: items.map((m) => ({
        id: m.id,
        userId: m.user.id,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
        email: m.user.email,
        role: m.role,
        joinedAt: m.createdAt,
      })),
      nextCursor,
    };
  }

  async changeMemberRole(
    workspaceId: string,
    targetUserId: string,
    newRole: WorkspaceRole,
    actor: RequestWorkspaceMember,
  ): Promise<WorkspaceMemberResponseDto> {
    const targetMember = await this.workspacesRepository.findMemberByUserId(
      workspaceId,
      targetUserId,
    );
    if (!targetMember) {
      throw new NotFoundException('Member not found');
    }

    if (targetUserId === actor.userId) {
      throw new BadRequestException('Cannot change your own role');
    }

    if (newRole === WorkspaceRole.OWNER) {
      throw new BadRequestException(
        'Cannot promote to OWNER via role change; use /transfer-ownership',
      );
    }

    if (!canChangeRole(actor.role, targetMember.role, newRole)) {
      throw new ForbiddenException(
        'Insufficient permissions to change member role',
      );
    }

    const updated = await this.workspacesRepository.updateMemberRoleByUserId(
      workspaceId,
      targetUserId,
      newRole,
    );

    this.eventEmitter.emit(
      'workspace.member.role_changed',
      new WorkspaceMemberRoleChangedEvent(
        workspaceId,
        actor.userId,
        targetMember.id,
        targetMember.role,
        newRole,
      ),
    );

    return {
      id: updated.id,
      userId: updated.user.id,
      name: updated.user.name,
      avatarUrl: updated.user.avatarUrl,
      email: updated.user.email,
      role: updated.role,
      joinedAt: updated.createdAt,
    };
  }

  async removeMember(
    workspaceId: string,
    targetUserId: string,
    actor: RequestWorkspaceMember,
  ): Promise<void> {
    const targetMember = await this.workspacesRepository.findMemberByUserId(
      workspaceId,
      targetUserId,
    );
    if (!targetMember) {
      throw new NotFoundException('Member not found');
    }

    const isSelf = targetUserId === actor.userId;

    if (isSelf) {
      if (actor.role === WorkspaceRole.OWNER) {
        throw new ConflictException(
          'Owner cannot leave workspace. Transfer ownership before leaving.',
        );
      }
    } else {
      if (!canRemoveMember(actor.role, targetMember.role, false)) {
        throw new ForbiddenException(
          'Insufficient permissions to remove member',
        );
      }
    }

    await this.workspacesRepository.deleteMemberByUserId(
      workspaceId,
      targetUserId,
    );

    this.eventEmitter.emit(
      'workspace.member.removed',
      new WorkspaceMemberRemovedEvent(
        workspaceId,
        actor.userId,
        targetMember.id,
      ),
    );
  }

  async transferOwnership(
    workspaceId: string,
    targetUserId: string,
    actor: RequestWorkspaceMember,
  ): Promise<{ message: string }> {
    if (targetUserId === actor.userId) {
      throw new BadRequestException(
        'Cannot transfer ownership to yourself',
      );
    }

    const currentOwnerMember =
      await this.workspacesRepository.findMembership(
        workspaceId,
        actor.userId,
      );

    if (!currentOwnerMember || currentOwnerMember.role !== WorkspaceRole.OWNER) {
      throw new ForbiddenException(
        'Only the current workspace owner can transfer ownership',
      );
    }

    const targetMember = await this.workspacesRepository.findMembership(
      workspaceId,
      targetUserId,
    );

    if (!targetMember) {
      throw new BadRequestException(
        'Target user is not a member of this workspace',
      );
    }

    await this.workspacesRepository.transferOwnership(
      workspaceId,
      currentOwnerMember.id,
      targetMember.id,
    );

    this.eventEmitter.emit(
      'workspace.ownership.transferred',
      new WorkspaceOwnershipTransferredEvent(
        workspaceId,
        actor.userId,
        targetUserId,
      ),
    );

    return { message: 'Ownership transferred successfully' };
  }

  async createInvite(
    workspaceId: string,
    dto: CreateInviteDto,
    actor: RequestWorkspaceMember,
  ): Promise<WorkspaceInviteResponseDto> {
    const email = dto.email.trim().toLowerCase();

    if (dto.role === WorkspaceRole.OWNER) {
      throw new BadRequestException('Cannot invite member with role OWNER');
    }

    if (!canInviteRole(actor.role, dto.role)) {
      throw new ForbiddenException(
        'Insufficient permissions to invite specified role',
      );
    }

    const existingMember =
      await this.workspacesRepository.findMemberByUserEmail(
        workspaceId,
        email,
      );

    if (existingMember) {
      throw new ConflictException(
        'User is already a member of this workspace',
      );
    }

    const workspace =
      await this.workspacesRepository.findWorkspaceById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const inviter = await this.usersService.findById(actor.userId);
    const inviterName = inviter ? inviter.name : 'A team member';

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days TTL

    const invite = await this.workspacesRepository.createOrReplaceInvite({
      workspaceId,
      email,
      role: dto.role,
      tokenHash,
      expiresAt,
      invitedById: actor.userId,
    });

    const appUrl =
      this.configService.get<string>('APP_URL') || 'http://localhost:3001';
    const link = `${appUrl}/invites/accept?token=${rawToken}`;

    await this.mailService.sendWorkspaceInvite({
      to: email,
      workspaceName: workspace.name,
      inviterName,
      role: dto.role,
      link,
    });

    this.eventEmitter.emit(
      'workspace.invite.created',
      new WorkspaceInviteCreatedEvent(
        workspaceId,
        invite.id,
        email,
        dto.role,
        actor.userId,
      ),
    );

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    };
  }

  async listActiveInvites(
    workspaceId: string,
    pagination: CursorPaginationDto,
  ): Promise<PaginatedResponseDto<WorkspaceInviteResponseDto>> {
    const limit = pagination.limit || 20;
    const cursor = pagination.cursor
      ? decodeCursor(pagination.cursor)
      : undefined;

    const invites = await this.workspacesRepository.listActiveInvites(
      workspaceId,
      limit,
      cursor,
    );

    let nextCursor: string | null = null;
    let items = invites;

    if (invites.length > limit) {
      const nextItem = invites[limit - 1];
      nextCursor = encodeCursor({
        createdAt: nextItem.createdAt,
        id: nextItem.id,
      });
      items = invites.slice(0, limit);
    }

    return {
      items: items.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      })),
      nextCursor,
    };
  }

  async revokeInvite(workspaceId: string, inviteId: string): Promise<void> {
    const invite = await this.workspacesRepository.findInviteById(
      workspaceId,
      inviteId,
    );
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    await this.workspacesRepository.deleteInvite(workspaceId, inviteId);
  }

  async acceptInvite(
    rawToken: string,
    user: { id: string; email: string },
  ): Promise<{ workspaceId: string; role: WorkspaceRole }> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const invite =
      await this.workspacesRepository.findInviteByTokenHash(tokenHash);

    if (
      !invite ||
      invite.acceptedAt !== null ||
      invite.expiresAt < new Date()
    ) {
      throw new BadRequestException('Invalid or expired invite');
    }

    const userRecord = await this.usersService.findById(user.id);
    if (!userRecord || !userRecord.emailVerifiedAt) {
      throw new ForbiddenException(
        'Email must be verified to accept an invite',
      );
    }

    if (userRecord.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new ForbiddenException(
        'Invite email does not match your account',
      );
    }

    const existingMember = await this.workspacesRepository.findMembership(
      invite.workspaceId,
      user.id,
    );

    if (existingMember) {
      throw new ConflictException(
        'You are already a member of this workspace',
      );
    }

    try {
      const member = await this.workspacesRepository.acceptInvite(
        invite.id,
        invite.workspaceId,
        user.id,
        invite.role,
      );

      this.eventEmitter.emit(
        'workspace.invite.accepted',
        new WorkspaceInviteAcceptedEvent(
          invite.workspaceId,
          invite.id,
          user.id,
          invite.role,
        ),
      );

      this.eventEmitter.emit(
        'workspace.member.added',
        new WorkspaceMemberAddedEvent(
          invite.workspaceId,
          user.id,
          invite.role,
        ),
      );

      return {
        workspaceId: member.workspaceId,
        role: member.role,
      };
    } catch {
      throw new BadRequestException('Invalid or expired invite');
    }
  }
}
