import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TagsService } from './services/tags.service.js';

describe('TagsService Unit Tests', () => {
  let service: TagsService;
  let tagsRepo: any;
  let eventEmitter: any;

  beforeEach(() => {
    tagsRepo = {
      count: vi.fn(),
      findByName: vi.fn(),
      findById: vi.fn(),
      findByIds: vi.fn(),
      findAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    eventEmitter = {
      emit: vi.fn(),
    };
    service = new TagsService(tagsRepo, eventEmitter);
  });

  describe('create', () => {
    it('throws ConflictException when 500 tag limit is reached', async () => {
      tagsRepo.count.mockResolvedValue(500);

      await expect(
        service.create('ws-1', 'user-1', { name: 'overflow' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when tag with same name already exists', async () => {
      tagsRepo.count.mockResolvedValue(10);
      tagsRepo.findByName.mockResolvedValue({ id: 'tag-1', name: 'bug' });

      await expect(
        service.create('ws-1', 'user-1', { name: 'BUG' }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates tag, trims name, and emits tag.created', async () => {
      tagsRepo.count.mockResolvedValue(1);
      tagsRepo.findByName.mockResolvedValue(null);
      tagsRepo.create.mockResolvedValue({
        id: 'tag-1',
        workspaceId: 'ws-1',
        name: 'frontend',
        color: '#3B82F6',
      });

      const res = await service.create('ws-1', 'user-1', {
        name: '  frontend  ',
        color: '#3B82F6',
      });

      expect(tagsRepo.create).toHaveBeenCalledWith('ws-1', {
        name: 'frontend',
        color: '#3B82F6',
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'tag.created',
        expect.anything(),
      );
      expect(res.name).toBe('frontend');
    });
  });

  describe('update', () => {
    it('throws NotFoundException when tag does not exist', async () => {
      tagsRepo.findById.mockResolvedValue(null);

      await expect(
        service.update('ws-1', 'missing', 'user-1', { name: 'renamed' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if renamed tag collides with another tag', async () => {
      tagsRepo.findById.mockResolvedValue({ id: 't-1', name: 'old' });
      tagsRepo.findByName.mockResolvedValue({ id: 't-2', name: 'existing' });

      await expect(
        service.update('ws-1', 't-1', 'user-1', { name: 'EXISTING' }),
      ).rejects.toThrow(ConflictException);
    });

    it('updates tag and emits tag.updated', async () => {
      tagsRepo.findById.mockResolvedValue({ id: 't-1', name: 'old' });
      tagsRepo.findByName.mockResolvedValue(null);
      tagsRepo.update.mockResolvedValue({
        id: 't-1',
        name: 'new-name',
        color: '#10B981',
      });

      const res = await service.update('ws-1', 't-1', 'user-1', {
        name: 'new-name',
        color: '#10B981',
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'tag.updated',
        expect.anything(),
      );
      expect(res.name).toBe('new-name');
    });
  });

  describe('delete', () => {
    it('throws NotFoundException when tag does not exist', async () => {
      tagsRepo.findById.mockResolvedValue(null);

      await expect(
        service.delete('ws-1', 'missing', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deletes tag and emits tag.deleted', async () => {
      tagsRepo.findById.mockResolvedValue({ id: 't-1', name: 'target' });

      await service.delete('ws-1', 't-1', 'user-1');

      expect(tagsRepo.delete).toHaveBeenCalledWith('ws-1', 't-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'tag.deleted',
        expect.anything(),
      );
    });
  });
});
