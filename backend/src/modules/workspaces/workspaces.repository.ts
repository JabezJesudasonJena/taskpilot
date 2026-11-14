import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  Workspace,
  WorkspaceMember,
  WorkspaceInvite,
  WorkspaceRole,
  User,
} from '@prisma/client';

export interface WorkspaceWithRole extends Workspace {
  role: WorkspaceRole;
}

export interface WorkspaceMemberWithUser extends WorkspaceMember {
  user: Pick<User, 'id' | 'name' | 'avatarUrl' | 'email'>;
}

@Injectable()
export class WorkspacesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWorkspaceWithMember(data: {
    name: string;
    slug: string;
    userId: string;
  }): Promise<WorkspaceWithRole> {
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: data.name,
          slug: data.slug,
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: data.userId,
          role: 'OWNER',
        },
      });

      return {
        ...workspace,
        role: 'OWNER' as WorkspaceRole,
      };
    });
  }

  async findWorkspaceById(id: string): Promise<Workspace | null> {
    return this.prisma.workspace.findUnique({
      where: { id },
    });
  }

  async findWorkspaceBySlug(slug: string): Promise<Workspace | null> {
    return this.prisma.workspace.findUnique({
      where: { slug },
    });
  }

  async updateWorkspace(
    id: string,
    data: { name?: string; slug?: string },
  ): Promise<Workspace> {
    return this.prisma.workspace.update({
      where: { id },
      data,
    });
  }

  async findMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMember | null> {
    return this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });
  }

  async findMemberByUserEmail(
    workspaceId: string,
    email: string,
  ): Promise<WorkspaceMember | null> {
    return this.prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        user: {
          email: email.toLowerCase(),
        },
      },
    });
  }

  async findMemberById(
    workspaceId: string,
    memberId: string,
  ): Promise<WorkspaceMemberWithUser | null> {
    return this.prisma.workspaceMember.findFirst({
      where: {
        id: memberId,
        workspaceId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            email: true,
          },
        },
      },
    });
  }

  async findMemberByUserId(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMemberWithUser | null> {
    return this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            email: true,
          },
        },
      },
    });
  }

  async findMembersByUserIds(
    workspaceId: string,
    userIds: string[],
  ): Promise<Pick<WorkspaceMember, 'userId' | 'role'>[]> {
    if (userIds.length === 0) {
      return [];
    }
    return this.prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        userId: { in: userIds },
      },
      select: {
        userId: true,
        role: true,
      },
    });
  }

  async listWorkspacesForUser(
    userId: string,
    limit: number,
    cursor?: { createdAt: Date; id: string },
  ): Promise<WorkspaceWithRole[]> {
    const records = await this.prisma.workspace.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                {
                  createdAt: cursor.createdAt,
                  id: { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      include: {
        members: {
          where: { userId },
          select: { role: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    return records.map((w) => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      role: w.members[0]?.role ?? ('MEMBER' as WorkspaceRole),
    }));
  }

  async listMembers(
    workspaceId: string,
    limit: number,
    cursor?: { createdAt: Date; id: string },
  ): Promise<WorkspaceMemberWithUser[]> {
    return this.prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                {
                  createdAt: cursor.createdAt,
                  id: { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            email: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
  }

  async updateMemberRole(
    workspaceId: string,
    memberId: string,
    role: WorkspaceRole,
  ): Promise<WorkspaceMemberWithUser> {
    return this.prisma.workspaceMember.update({
      where: {
        id: memberId,
        workspaceId,
      },
      data: { role },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            email: true,
          },
        },
      },
    });
  }

  async deleteMember(workspaceId: string, memberId: string): Promise<void> {
    await this.prisma.workspaceMember.delete({
      where: {
        id: memberId,
        workspaceId,
      },
    });
  }

  async updateMemberRoleByUserId(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
  ): Promise<WorkspaceMemberWithUser> {
    return this.prisma.workspaceMember.update({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      data: { role },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            email: true,
          },
        },
      },
    });
  }

  async deleteMemberByUserId(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    await this.prisma.workspaceMember.delete({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });
  }

  async transferOwnership(
    workspaceId: string,
    currentOwnerMemberId: string,
    newOwnerMemberId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. Demote current owner to ADMIN first (to satisfy workspace_one_owner_idx partial unique index)
      await tx.workspaceMember.update({
        where: {
          id: currentOwnerMemberId,
          workspaceId,
        },
        data: {
          role: 'ADMIN',
        },
      });

      // 2. Promote target member to OWNER
      await tx.workspaceMember.update({
        where: {
          id: newOwnerMemberId,
          workspaceId,
        },
        data: {
          role: 'OWNER',
        },
      });
    });
  }

  async createOrReplaceInvite(data: {
    workspaceId: string;
    email: string;
    role: WorkspaceRole;
    tokenHash: string;
    expiresAt: Date;
    invitedById: string;
  }): Promise<WorkspaceInvite> {
    return this.prisma.$transaction(async (tx) => {
      await tx.workspaceInvite.deleteMany({
        where: {
          workspaceId: data.workspaceId,
          email: data.email,
        },
      });

      return tx.workspaceInvite.create({
        data: {
          workspaceId: data.workspaceId,
          email: data.email,
          role: data.role,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          invitedById: data.invitedById,
        },
      });
    });
  }

  async listActiveInvites(
    workspaceId: string,
    limit: number,
    cursor?: { createdAt: Date; id: string },
  ): Promise<WorkspaceInvite[]> {
    return this.prisma.workspaceInvite.findMany({
      where: {
        workspaceId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                {
                  createdAt: cursor.createdAt,
                  id: { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
  }

  async findInviteById(
    workspaceId: string,
    inviteId: string,
  ): Promise<WorkspaceInvite | null> {
    return this.prisma.workspaceInvite.findFirst({
      where: {
        id: inviteId,
        workspaceId,
      },
    });
  }

  async deleteInvite(workspaceId: string, inviteId: string): Promise<void> {
    await this.prisma.workspaceInvite.delete({
      where: {
        id: inviteId,
        workspaceId,
      },
    });
  }

  async findInviteByTokenHash(
    tokenHash: string,
  ): Promise<(WorkspaceInvite & { workspace: Workspace }) | null> {
    return this.prisma.workspaceInvite.findUnique({
      where: { tokenHash },
      include: { workspace: true },
    });
  }

  async acceptInvite(
    inviteId: string,
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
  ): Promise<WorkspaceMember> {
    return this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.workspaceInvite.updateMany({
        where: {
          id: inviteId,
          acceptedAt: null,
        },
        data: {
          acceptedAt: new Date(),
        },
      });

      if (updateResult.count === 0) {
        throw new Error('Invite already accepted');
      }

      return tx.workspaceMember.create({
        data: {
          workspaceId,
          userId,
          role,
        },
      });
    });
  }
}
