import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { StatusType } from '@prisma/client';
import { SpacesService } from './spaces.service.js';
import { FoldersService } from './folders.service.js';
import { ListsService } from './lists.service.js';
import { StatusesService } from './statuses.service.js';
import { TreeService } from './tree.service.js';
import { HierarchyService } from '../hierarchy.service.js';
import { DEFAULT_STATUSES } from '../constants/default-statuses.constant.js';

describe('Hierarchy Services (Unit)', () => {
  let spacesRepo: any;
  let foldersRepo: any;
  let listsRepo: any;
  let statusesRepo: any;
  let eventEmitter: any;

  let spacesService: SpacesService;
  let foldersService: FoldersService;
  let listsService: ListsService;
  let statusesService: StatusesService;
  let treeService: TreeService;
  let hierarchyService: HierarchyService;

  beforeEach(() => {
    spacesRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findAll: vi.fn(),
      findLastSibling: vi.fn(),
      findSiblingBefore: vi.fn(),
      findSiblingAfter: vi.fn(),
      update: vi.fn(),
      archiveCascade: vi.fn(),
      unarchiveCascade: vi.fn(),
      delete: vi.fn(),
    };

    foldersRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findBySpace: vi.fn(),
      findAllInWorkspace: vi.fn(),
      findLastSibling: vi.fn(),
      findSiblingBefore: vi.fn(),
      findSiblingAfter: vi.fn(),
      update: vi.fn(),
      archiveCascade: vi.fn(),
      unarchiveCascade: vi.fn(),
      delete: vi.fn(),
    };

    listsRepo = {
      createWithDefaultStatuses: vi.fn(),
      findById: vi.fn(),
      findBySpace: vi.fn(),
      findAllInWorkspace: vi.fn(),
      findLastSibling: vi.fn(),
      findSiblingBefore: vi.fn(),
      findSiblingAfter: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
      delete: vi.fn(),
    };

    statusesRepo = {
      findById: vi.fn(),
      findByList: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      reorderContiguously: vi.fn(),
      deleteAndRenumber: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
    };

    spacesService = new SpacesService(spacesRepo, eventEmitter);
    foldersService = new FoldersService(foldersRepo, spacesRepo, eventEmitter);
    listsService = new ListsService(listsRepo, spacesRepo, foldersRepo, eventEmitter);
    statusesService = new StatusesService(statusesRepo, listsRepo, eventEmitter);
    treeService = new TreeService(spacesRepo, foldersRepo, listsRepo);
    hierarchyService = new HierarchyService(listsRepo, statusesRepo);
  });

  describe('Default Statuses Constant', () => {
    it('defines exactly To Do (OPEN), In Progress (ACTIVE), and Done (DONE) at positions 0, 1, 2', () => {
      expect(DEFAULT_STATUSES).toHaveLength(3);
      expect(DEFAULT_STATUSES[0]).toEqual(
        expect.objectContaining({ name: 'To Do', type: StatusType.OPEN, position: 0 }),
      );
      expect(DEFAULT_STATUSES[1]).toEqual(
        expect.objectContaining({ name: 'In Progress', type: StatusType.ACTIVE, position: 1 }),
      );
      expect(DEFAULT_STATUSES[2]).toEqual(
        expect.objectContaining({ name: 'Done', type: StatusType.DONE, position: 2 }),
      );
    });
  });

  describe('Statuses Invariants', () => {
    const listId = 'list-1';
    const workspaceId = 'ws-1';

    beforeEach(() => {
      listsRepo.findById.mockResolvedValue({
        id: listId,
        workspaceId,
        archivedAt: null,
      });
    });

    it('rejects status creation if list already has 20 statuses', async () => {
      const mockStatuses = Array.from({ length: 20 }, (_, i) => ({
        id: `s-${i}`,
        name: `Status ${i}`,
        type: StatusType.ACTIVE,
        position: i,
      }));
      statusesRepo.findByList.mockResolvedValue(mockStatuses);

      await expect(
        statusesService.create(workspaceId, listId, {
          name: 'Status 21',
          type: StatusType.ACTIVE,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects status creation with duplicate name compared case-insensitively', async () => {
      statusesRepo.findByList.mockResolvedValue([
        { id: 's-1', name: 'In Progress', type: StatusType.ACTIVE, position: 0 },
      ]);

      await expect(
        statusesService.create(workspaceId, listId, {
          name: 'in progress',
          type: StatusType.ACTIVE,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects retyping the only OPEN status in the list', async () => {
      statusesRepo.findByList.mockResolvedValue([
        { id: 's-open', name: 'To Do', type: StatusType.OPEN, position: 0 },
        { id: 's-done', name: 'Done', type: StatusType.DONE, position: 1 },
      ]);

      await expect(
        statusesService.update(workspaceId, listId, 's-open', {
          type: StatusType.ACTIVE,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects retyping the only DONE status in the list', async () => {
      statusesRepo.findByList.mockResolvedValue([
        { id: 's-open', name: 'To Do', type: StatusType.OPEN, position: 0 },
        { id: 's-done', name: 'Done', type: StatusType.DONE, position: 1 },
      ]);

      await expect(
        statusesService.update(workspaceId, listId, 's-done', {
          type: StatusType.ACTIVE,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects deleting the only OPEN status in the list', async () => {
      statusesRepo.findByList.mockResolvedValue([
        { id: 's-open', name: 'To Do', type: StatusType.OPEN, position: 0 },
        { id: 's-done', name: 'Done', type: StatusType.DONE, position: 1 },
      ]);

      await expect(
        statusesService.delete(workspaceId, listId, 's-open'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects deleting the only DONE status in the list', async () => {
      statusesRepo.findByList.mockResolvedValue([
        { id: 's-open', name: 'To Do', type: StatusType.OPEN, position: 0 },
        { id: 's-done', name: 'Done', type: StatusType.DONE, position: 1 },
      ]);

      await expect(
        statusesService.delete(workspaceId, listId, 's-done'),
      ).rejects.toThrow(ConflictException);
    });

    it('reorders statuses contiguously and rejects out-of-bounds toIndex', async () => {
      statusesRepo.findByList.mockResolvedValue([
        { id: 's-0', position: 0 },
        { id: 's-1', position: 1 },
        { id: 's-2', position: 2 },
      ]);

      await expect(
        statusesService.reorder(workspaceId, listId, 's-0', { toIndex: 5 }),
      ).rejects.toThrow(BadRequestException);

      statusesRepo.reorderContiguously.mockResolvedValue([
        { id: 's-1', position: 0 },
        { id: 's-0', position: 1 },
        { id: 's-2', position: 2 },
      ]);

      const result = await statusesService.reorder(workspaceId, listId, 's-0', {
        toIndex: 1,
      });

      expect(statusesRepo.reorderContiguously).toHaveBeenCalledWith(
        workspaceId,
        listId,
        ['s-1', 's-0', 's-2'],
      );
      expect(result).toHaveLength(3);
    });
  });

  describe('Archive & Unarchive Cascade Logic', () => {
    it('captures a single Date timestamp when archiving a space and cascades down', async () => {
      spacesRepo.findById.mockResolvedValue({
        id: 'space-1',
        workspaceId: 'ws-1',
        archivedAt: null,
      });

      spacesRepo.archiveCascade.mockImplementation(
        async (_ws: string, id: string, timestamp: Date) => ({
          id,
          archivedAt: timestamp,
        }),
      );

      const archived = await spacesService.archive('ws-1', 'space-1');
      expect(archived.archivedAt).toBeInstanceOf(Date);
      expect(spacesRepo.archiveCascade).toHaveBeenCalledWith(
        'ws-1',
        'space-1',
        expect.any(Date),
      );
    });

    it('rejects unarchiving a folder whose parent space is archived', async () => {
      foldersRepo.findById.mockResolvedValue({
        id: 'folder-1',
        spaceId: 'space-1',
        workspaceId: 'ws-1',
        archivedAt: new Date(),
      });

      spacesRepo.findById.mockResolvedValue({
        id: 'space-1',
        workspaceId: 'ws-1',
        archivedAt: new Date(),
      });

      await expect(
        foldersService.unarchive('ws-1', 'folder-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects unarchiving a list whose parent folder is archived', async () => {
      listsRepo.findById.mockResolvedValue({
        id: 'list-1',
        spaceId: 'space-1',
        folderId: 'folder-1',
        workspaceId: 'ws-1',
        archivedAt: new Date(),
      });

      spacesRepo.findById.mockResolvedValue({
        id: 'space-1',
        workspaceId: 'ws-1',
        archivedAt: null,
      });

      foldersRepo.findById.mockResolvedValue({
        id: 'folder-1',
        workspaceId: 'ws-1',
        archivedAt: new Date(),
      });

      await expect(
        listsService.unarchive('ws-1', 'list-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects permanent deletion if node is not archived', async () => {
      spacesRepo.findById.mockResolvedValue({
        id: 'space-1',
        workspaceId: 'ws-1',
        archivedAt: null,
      });

      await expect(spacesService.delete('ws-1', 'space-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('Tree Service (N+1 Prevention)', () => {
    it('builds full hierarchy tree using exactly 3 queries', async () => {
      spacesRepo.findAll.mockResolvedValue([
        { id: 's-1', name: 'Space 1', position: 'a0', archivedAt: null },
      ]);
      foldersRepo.findAllInWorkspace.mockResolvedValue([
        { id: 'f-1', spaceId: 's-1', name: 'Folder 1', position: 'a0', archivedAt: null },
      ]);
      listsRepo.findAllInWorkspace.mockResolvedValue([
        { id: 'l-root', spaceId: 's-1', folderId: null, name: 'Root List', position: 'a0', archivedAt: null },
        { id: 'l-nested', spaceId: 's-1', folderId: 'f-1', name: 'Nested List', position: 'a0', archivedAt: null },
      ]);

      const tree = await treeService.getTree('ws-1');

      expect(spacesRepo.findAll).toHaveBeenCalledTimes(1);
      expect(foldersRepo.findAllInWorkspace).toHaveBeenCalledTimes(1);
      expect(listsRepo.findAllInWorkspace).toHaveBeenCalledTimes(1);

      expect(tree.spaces).toHaveLength(1);
      expect(tree.spaces[0].lists).toHaveLength(1);
      expect(tree.spaces[0].lists[0].id).toBe('l-root');
      expect(tree.spaces[0].folders).toHaveLength(1);
      expect(tree.spaces[0].folders[0].lists).toHaveLength(1);
      expect(tree.spaces[0].folders[0].lists[0].id).toBe('l-nested');
    });
  });

  describe('HierarchyService (M4 Public API)', () => {
    it('returns list for tenant or throws 404', async () => {
      listsRepo.findById.mockResolvedValue({ id: 'l-1', workspaceId: 'ws-1' });

      const list = await hierarchyService.getListForTenant('ws-1', 'l-1');
      expect(list.id).toBe('l-1');

      listsRepo.findById.mockResolvedValueOnce(null);
      await expect(
        hierarchyService.getListForTenant('ws-1', 'l-unknown'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns default OPEN status for list', async () => {
      statusesRepo.findByList.mockResolvedValue([
        { id: 's-done', type: StatusType.DONE },
        { id: 's-open', type: StatusType.OPEN },
      ]);

      const openStatus = await hierarchyService.getDefaultOpenStatus('ws-1', 'l-1');
      expect(openStatus.id).toBe('s-open');
    });
  });
});
