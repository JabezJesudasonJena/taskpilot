import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { TasksService } from './services/tasks.service.js';

describe('TasksService Unit Tests', () => {
  let service: TasksService;
  let tasksRepo: any;
  let tagsRepo: any;
  let hierarchyService: any;
  let workspacesService: any;
  let eventEmitter: any;

  const mockMember = {
    workspaceId: 'ws-1',
    userId: 'user-1',
    role: WorkspaceRole.MEMBER,
  };

  beforeEach(() => {
    tasksRepo = {
      findRawById: vi.fn(),
      findById: vi.fn(),
      findSiblingGroupLast: vi.fn(),
      createTaskWithRelations: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      restore: vi.fn(),
      replaceAssignees: vi.fn(),
      replaceTags: vi.fn(),
      getSubtasksOfTask: vi.fn(),
      hydrateTasks: vi.fn(),
    };
    tagsRepo = {
      findByIds: vi.fn(),
    };
    hierarchyService = {
      getListForTenant: vi.fn(),
      getStatusForList: vi.fn(),
      getStatusesForList: vi.fn(),
      getDefaultOpenStatus: vi.fn(),
    };
    workspacesService = {
      getMembershipsByUserIds: vi.fn(),
    };
    eventEmitter = {
      emit: vi.fn(),
    };

    service = new TasksService(
      tasksRepo,
      tagsRepo,
      hierarchyService,
      workspacesService,
      eventEmitter,
    );
  });

  describe('create', () => {
    it('throws NotFoundException when list does not exist in tenant', async () => {
      hierarchyService.getListForTenant.mockResolvedValue(null);

      await expect(
        service.create('ws-1', mockMember, 'list-1', { title: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when list is archived', async () => {
      hierarchyService.getListForTenant.mockResolvedValue({
        id: 'list-1',
        archivedAt: new Date(),
      });

      await expect(
        service.create('ws-1', mockMember, 'list-1', { title: 'Test' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when startDate > dueDate', async () => {
      hierarchyService.getListForTenant.mockResolvedValue({
        id: 'list-1',
        archivedAt: null,
      });

      await expect(
        service.create('ws-1', mockMember, 'list-1', {
          title: 'Test',
          startDate: '2026-11-20T00:00:00.000Z',
          dueDate: '2026-11-10T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when subtask nesting exceeds depth cap 1', async () => {
      hierarchyService.getListForTenant.mockResolvedValue({
        id: 'list-1',
        archivedAt: null,
      });
      tasksRepo.findRawById.mockResolvedValue({
        id: 'subtask-1',
        parentId: 'parent-1', // already a subtask!
        listId: 'list-1',
        deletedAt: null,
      });

      await expect(
        service.create(
          'ws-1',
          mockMember,
          'list-1',
          { title: 'Nested' },
          'subtask-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects assignees who are GUEST or not workspace members', async () => {
      hierarchyService.getListForTenant.mockResolvedValue({
        id: 'list-1',
        archivedAt: null,
      });
      hierarchyService.getDefaultOpenStatus.mockResolvedValue({
        id: 'st-1',
        type: 'OPEN',
      });
      workspacesService.getMembershipsByUserIds.mockResolvedValue([
        { userId: 'u-guest', role: WorkspaceRole.GUEST },
      ]);

      await expect(
        service.create('ws-1', mockMember, 'list-1', {
          title: 'Test',
          assigneeIds: ['u-guest'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('resolves default OPEN status and generates fractional position', async () => {
      hierarchyService.getListForTenant.mockResolvedValue({
        id: 'list-1',
        archivedAt: null,
      });
      hierarchyService.getDefaultOpenStatus.mockResolvedValue({
        id: 'status-open-id',
        type: 'OPEN',
      });
      tasksRepo.findSiblingGroupLast.mockResolvedValue({
        id: 'task-last',
        position: 'a0',
      });
      tasksRepo.createTaskWithRelations.mockResolvedValue({
        id: 'task-new',
        workspaceId: 'ws-1',
        listId: 'list-1',
        statusId: 'status-open-id',
      });
      tasksRepo.findById.mockResolvedValue({
        id: 'task-new',
        title: 'New task',
      });

      const result = await service.create('ws-1', mockMember, 'list-1', {
        title: 'New task',
      });

      expect(tasksRepo.createTaskWithRelations).toHaveBeenCalledWith(
        expect.objectContaining({
          statusId: 'status-open-id',
          position: expect.any(String),
          completedAt: null,
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.created',
        expect.anything(),
      );
      expect(result.id).toBe('task-new');
    });

    it('sets completedAt when status type is DONE', async () => {
      hierarchyService.getListForTenant.mockResolvedValue({
        id: 'list-1',
        archivedAt: null,
      });
      hierarchyService.getStatusForList.mockResolvedValue({
        id: 'status-done-id',
        type: 'DONE',
      });
      tasksRepo.findSiblingGroupLast.mockResolvedValue(null);
      tasksRepo.createTaskWithRelations.mockResolvedValue({
        id: 'task-done',
      });
      tasksRepo.findById.mockResolvedValue({
        id: 'task-done',
        completedAt: new Date(),
      });

      await service.create('ws-1', mockMember, 'list-1', {
        title: 'Done task',
        statusId: 'status-done-id',
      });

      expect(tasksRepo.createTaskWithRelations).toHaveBeenCalledWith(
        expect.objectContaining({
          statusId: 'status-done-id',
          completedAt: expect.any(Date),
        }),
      );
    });
  });

  describe('softDelete and restore', () => {
    it('creator can delete own task', async () => {
      hierarchyService.getListForTenant.mockResolvedValue({
        id: 'list-1',
        archivedAt: null,
      });
      tasksRepo.findRawById.mockResolvedValue({
        id: 'task-1',
        creatorId: 'user-1',
        listId: 'list-1',
        deletedAt: null,
      });
      tasksRepo.softDelete.mockResolvedValue(['sub-1']);

      await service.softDelete('ws-1', mockMember, 'task-1');

      expect(tasksRepo.softDelete).toHaveBeenCalledWith(
        'ws-1',
        'task-1',
        expect.any(Date),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.deleted',
        expect.anything(),
      );
    });

    it('other MEMBER cannot delete task created by someone else', async () => {
      hierarchyService.getListForTenant.mockResolvedValue({
        id: 'list-1',
        archivedAt: null,
      });
      tasksRepo.findRawById.mockResolvedValue({
        id: 'task-1',
        creatorId: 'other-user',
        listId: 'list-1',
        deletedAt: null,
      });

      await expect(
        service.softDelete('ws-1', mockMember, 'task-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADMIN can delete any task', async () => {
      const adminMember = {
        workspaceId: 'ws-1',
        userId: 'admin-user',
        role: WorkspaceRole.ADMIN,
      };
      hierarchyService.getListForTenant.mockResolvedValue({
        id: 'list-1',
        archivedAt: null,
      });
      tasksRepo.findRawById.mockResolvedValue({
        id: 'task-1',
        creatorId: 'other-user',
        listId: 'list-1',
        deletedAt: null,
      });
      tasksRepo.softDelete.mockResolvedValue([]);

      await expect(
        service.softDelete('ws-1', adminMember, 'task-1'),
      ).resolves.not.toThrow();
    });

    it('cannot restore a subtask whose parent is soft-deleted', async () => {
      const deletedAt = new Date();
      hierarchyService.getListForTenant.mockResolvedValue({
        id: 'list-1',
        archivedAt: null,
      });
      tasksRepo.findRawById
        .mockResolvedValueOnce({
          id: 'subtask-1',
          creatorId: 'user-1',
          listId: 'list-1',
          parentId: 'parent-1',
          deletedAt,
        })
        .mockResolvedValueOnce({
          id: 'parent-1',
          deletedAt: new Date(), // parent is deleted!
        });

      await expect(
        service.restore('ws-1', mockMember, 'subtask-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('public API: getTaskForTenant', () => {
    it('returns task info including deletedAt without 404', async () => {
      const deletedAt = new Date();
      tasksRepo.findRawById.mockResolvedValue({
        id: 't-1',
        workspaceId: 'ws-1',
        listId: 'l-1',
        parentId: null,
        deletedAt,
      });

      const res = await service.getTaskForTenant('ws-1', 't-1');
      expect(res).toEqual({
        id: 't-1',
        workspaceId: 'ws-1',
        listId: 'l-1',
        parentId: null,
        deletedAt,
      });
    });

    it('returns null if task does not exist', async () => {
      tasksRepo.findRawById.mockResolvedValue(null);
      const res = await service.getTaskForTenant('ws-1', 'missing');
      expect(res).toBeNull();
    });
  });
});
