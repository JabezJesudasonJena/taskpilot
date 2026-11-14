import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkspacesRepository } from './workspaces.repository.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { WorkspaceRole } from '@prisma/client';

describe('WorkspacesRepository - Tenant Isolation Assertions', () => {
  let repository: WorkspacesRepository;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      workspace: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      workspaceMember: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      workspaceInvite: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
        delete: vi.fn(),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(prisma)),
    };

    repository = new WorkspacesRepository(prisma as PrismaService);
  });

  it('findMemberById strictly scopes query by workspaceId', async () => {
    await repository.findMemberById('ws-uuid-1', 'member-uuid-1');
    expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'member-uuid-1',
          workspaceId: 'ws-uuid-1',
        }),
      }),
    );
  });

  it('findMemberByUserId strictly scopes query by workspaceId and userId', async () => {
    await repository.findMemberByUserId('ws-uuid-1', 'user-uuid-1');
    expect(prisma.workspaceMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId_userId: {
            workspaceId: 'ws-uuid-1',
            userId: 'user-uuid-1',
          },
        }),
      }),
    );
  });

  it('updateMemberRoleByUserId strictly scopes update by workspaceId and userId', async () => {
    await repository.updateMemberRoleByUserId(
      'ws-uuid-1',
      'user-uuid-1',
      WorkspaceRole.ADMIN,
    );
    expect(prisma.workspaceMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId_userId: {
            workspaceId: 'ws-uuid-1',
            userId: 'user-uuid-1',
          },
        }),
      }),
    );
  });

  it('deleteMemberByUserId strictly scopes delete by workspaceId and userId', async () => {
    await repository.deleteMemberByUserId('ws-uuid-1', 'user-uuid-1');
    expect(prisma.workspaceMember.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId_userId: {
            workspaceId: 'ws-uuid-1',
            userId: 'user-uuid-1',
          },
        }),
      }),
    );
  });

  it('listMembers strictly scopes query by workspaceId', async () => {
    await repository.listMembers('ws-uuid-1', 20);
    expect(prisma.workspaceMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws-uuid-1',
        }),
      }),
    );
  });

  it('updateMemberRole strictly scopes update by workspaceId', async () => {
    await repository.updateMemberRole('ws-uuid-1', 'member-uuid-1', WorkspaceRole.ADMIN);
    expect(prisma.workspaceMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'member-uuid-1',
          workspaceId: 'ws-uuid-1',
        }),
      }),
    );
  });

  it('deleteMember strictly scopes delete by workspaceId', async () => {
    await repository.deleteMember('ws-uuid-1', 'member-uuid-1');
    expect(prisma.workspaceMember.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'member-uuid-1',
          workspaceId: 'ws-uuid-1',
        }),
      }),
    );
  });

  it('listActiveInvites strictly scopes query by workspaceId', async () => {
    await repository.listActiveInvites('ws-uuid-1', 20);
    expect(prisma.workspaceInvite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws-uuid-1',
        }),
      }),
    );
  });

  it('deleteInvite strictly scopes delete by workspaceId', async () => {
    await repository.deleteInvite('ws-uuid-1', 'inv-uuid-1');
    expect(prisma.workspaceInvite.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'inv-uuid-1',
          workspaceId: 'ws-uuid-1',
        }),
      }),
    );
  });
});
