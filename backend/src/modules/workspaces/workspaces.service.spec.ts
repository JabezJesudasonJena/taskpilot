import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { WorkspacesService } from './workspaces.service.js';
import type { WorkspacesRepository } from './workspaces.repository.js';
import type { MailService } from '../mail/index.js';
import type { UsersService } from '../users/index.js';
import type { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import {
  generateSlug,
  appendRandomSuffix,
  validateSlug,
} from './utils/slug.util.js';

describe('WorkspacesService (Unit)', () => {
  let service: WorkspacesService;
  let repository: Partial<Record<keyof WorkspacesRepository, any>>;
  let mailService: Partial<Record<keyof MailService, any>>;
  let usersService: Partial<Record<keyof UsersService, any>>;
  let configService: Partial<Record<keyof ConfigService, any>>;
  let eventEmitter: Partial<Record<keyof EventEmitter2, any>>;

  beforeEach(() => {
    repository = {
      findWorkspaceBySlug: vi.fn(),
      createWorkspaceWithMember: vi.fn(),
      findWorkspaceById: vi.fn(),
      updateWorkspace: vi.fn(),
      findMembership: vi.fn(),
      findMemberById: vi.fn(),
      findMemberByUserId: vi.fn(),
      findMemberByUserEmail: vi.fn(),
      listWorkspacesForUser: vi.fn(),
      listMembers: vi.fn(),
      updateMemberRole: vi.fn(),
      updateMemberRoleByUserId: vi.fn(),
      deleteMember: vi.fn(),
      deleteMemberByUserId: vi.fn(),
      transferOwnership: vi.fn(),
      createOrReplaceInvite: vi.fn(),
      listActiveInvites: vi.fn(),
      findInviteById: vi.fn(),
      deleteInvite: vi.fn(),
      findInviteByTokenHash: vi.fn(),
      acceptInvite: vi.fn(),
    };

    mailService = {
      sendWorkspaceInvite: vi.fn().mockResolvedValue(undefined),
    };

    usersService = {
      findById: vi.fn().mockResolvedValue({
        id: 'user-1',
        name: 'User 1',
        email: 'user@example.com',
        emailVerifiedAt: new Date(),
      }),
    };

    configService = {
      get: vi.fn().mockReturnValue('http://localhost:3001'),
    };

    eventEmitter = {
      emit: vi.fn(),
    };

    service = new WorkspacesService(
      repository as WorkspacesRepository,
      mailService as MailService,
      usersService as UsersService,
      configService as ConfigService,
      eventEmitter as EventEmitter2,
    );
  });

  describe('Slug utilities', () => {
    it('generates a valid hyphenated slug from workspace name', () => {
      const slug = generateSlug('My Test Workspace 2026!');
      expect(slug).toBe('my-test-workspace-2026');
      expect(() => validateSlug(slug)).not.toThrow();
    });

    it('rejects reserved slugs', () => {
      expect(() => validateSlug('api')).toThrow(BadRequestException);
      expect(() => validateSlug('admin')).toThrow(BadRequestException);
      expect(() => validateSlug('workspaces')).toThrow(BadRequestException);
    });

    it('appends a random hex suffix preserving slug format and max length', () => {
      const original = 'my-workspace';
      const withSuffix = appendRandomSuffix(original);
      expect(withSuffix.startsWith('my-workspace-')).toBe(true);
      expect(withSuffix.length).toBeLessThanOrEqual(48);
      expect(() => validateSlug(withSuffix)).not.toThrow();
    });
  });

  describe('createWorkspace', () => {
    it('retries with suffix on slug collision up to 3 times', async () => {
      repository.findWorkspaceBySlug
        ?.mockResolvedValueOnce({ id: 'existing-1', slug: 'acme' })
        ?.mockResolvedValueOnce({ id: 'existing-2', slug: 'acme-a1b2' })
        ?.mockResolvedValueOnce(null); // 3rd attempt succeeds

      repository.createWorkspaceWithMember?.mockResolvedValue({
        id: 'ws-1',
        name: 'Acme',
        slug: 'acme-c3d4',
        role: WorkspaceRole.OWNER,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createWorkspace('user-1', { name: 'Acme' });
      expect(result.id).toBe('ws-1');
      expect(repository.findWorkspaceBySlug).toHaveBeenCalledTimes(3);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'workspace.created',
        expect.anything(),
      );
    });

    it('throws ConflictException if collision persists after 3 retries', async () => {
      repository.findWorkspaceBySlug?.mockResolvedValue({
        id: 'existing',
        slug: 'colliding',
      });

      await expect(
        service.createWorkspace('user-1', { name: 'Acme' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('transferOwnership', () => {
    it('throws BadRequestException if transferring ownership to self', async () => {
      await expect(
        service.transferOwnership('ws-1', 'user-1', {
          workspaceId: 'ws-1',
          userId: 'user-1',
          role: WorkspaceRole.OWNER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if target user is not a member', async () => {
      repository.findMembership
        ?.mockResolvedValueOnce({ id: 'mem-1', role: WorkspaceRole.OWNER })
        ?.mockResolvedValueOnce(null); // target not found

      await expect(
        service.transferOwnership('ws-1', 'user-2', {
          workspaceId: 'ws-1',
          userId: 'user-1',
          role: WorkspaceRole.OWNER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully transfers ownership and emits event', async () => {
      repository.findMembership
        ?.mockResolvedValueOnce({ id: 'mem-owner', role: WorkspaceRole.OWNER })
        ?.mockResolvedValueOnce({ id: 'mem-target', role: WorkspaceRole.ADMIN });

      repository.transferOwnership?.mockResolvedValue(undefined);

      const result = await service.transferOwnership('ws-1', 'user-2', {
        workspaceId: 'ws-1',
        userId: 'user-1',
        role: WorkspaceRole.OWNER,
      });

      expect(result.message).toBe('Ownership transferred successfully');
      expect(repository.transferOwnership).toHaveBeenCalledWith(
        'ws-1',
        'mem-owner',
        'mem-target',
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'workspace.ownership.transferred',
        expect.anything(),
      );
    });
  });

  describe('acceptInvite branches', () => {
    it('throws ForbiddenException if user email is not verified', async () => {
      repository.findInviteByTokenHash?.mockResolvedValue({
        id: 'inv-1',
        email: 'user@example.com',
        acceptedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      usersService.findById?.mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        emailVerifiedAt: null,
      });

      await expect(
        service.acceptInvite('some-raw-token', {
          id: 'user-1',
          email: 'user@example.com',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException if invite is expired or missing', async () => {
      repository.findInviteByTokenHash?.mockResolvedValue(null);

      await expect(
        service.acceptInvite('some-raw-token', {
          id: 'user-1',
          email: 'test@example.com',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException if user email does not match invite email', async () => {
      repository.findInviteByTokenHash?.mockResolvedValue({
        id: 'inv-1',
        email: 'other@example.com',
        acceptedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(
        service.acceptInvite('some-raw-token', {
          id: 'user-1',
          email: 'mismatch@example.com',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException if user is already a member', async () => {
      repository.findInviteByTokenHash?.mockResolvedValue({
        id: 'inv-1',
        workspaceId: 'ws-1',
        email: 'user@example.com',
        acceptedAt: null,
        expiresAt: new Date(Date.now() + 100000),
        role: WorkspaceRole.MEMBER,
      });

      repository.findMembership?.mockResolvedValue({
        id: 'mem-existing',
        role: WorkspaceRole.MEMBER,
      });

      await expect(
        service.acceptInvite('some-raw-token', {
          id: 'user-1',
          email: 'user@example.com',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('successfully accepts invite atomically and emits events', async () => {
      repository.findInviteByTokenHash?.mockResolvedValue({
        id: 'inv-1',
        workspaceId: 'ws-1',
        email: 'user@example.com',
        acceptedAt: null,
        expiresAt: new Date(Date.now() + 100000),
        role: WorkspaceRole.MEMBER,
      });

      repository.findMembership?.mockResolvedValue(null);
      repository.acceptInvite?.mockResolvedValue({
        id: 'mem-new',
        workspaceId: 'ws-1',
        userId: 'user-1',
        role: WorkspaceRole.MEMBER,
      });

      const result = await service.acceptInvite('some-raw-token', {
        id: 'user-1',
        email: 'user@example.com',
      });

      expect(result).toEqual({
        workspaceId: 'ws-1',
        role: WorkspaceRole.MEMBER,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'workspace.invite.accepted',
        expect.anything(),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'workspace.member.added',
        expect.anything(),
      );
    });
  });

  describe('changeMemberRole', () => {
    it('throws BadRequestException when user attempts to change their own role', async () => {
      repository.findMemberByUserId?.mockResolvedValue({
        id: 'mem-1',
        userId: 'user-1',
        role: WorkspaceRole.ADMIN,
      });

      await expect(
        service.changeMemberRole('ws-1', 'user-1', WorkspaceRole.MEMBER, {
          workspaceId: 'ws-1',
          userId: 'user-1',
          role: WorkspaceRole.ADMIN,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when attempting to promote to OWNER', async () => {
      repository.findMemberByUserId?.mockResolvedValue({
        id: 'mem-2',
        userId: 'user-2',
        role: WorkspaceRole.ADMIN,
      });

      await expect(
        service.changeMemberRole('ws-1', 'user-2', WorkspaceRole.OWNER, {
          workspaceId: 'ws-1',
          userId: 'user-1',
          role: WorkspaceRole.OWNER,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeMember', () => {
    it('throws ConflictException when owner attempts to leave workspace', async () => {
      repository.findMemberByUserId?.mockResolvedValue({
        id: 'mem-owner',
        userId: 'user-owner',
        role: WorkspaceRole.OWNER,
      });

      await expect(
        service.removeMember('ws-1', 'user-owner', {
          workspaceId: 'ws-1',
          userId: 'user-owner',
          role: WorkspaceRole.OWNER,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
