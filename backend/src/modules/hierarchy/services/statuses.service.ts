import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StatusType } from '@prisma/client';
import { StatusesRepository } from '../repositories/statuses.repository.js';
import { ListsRepository } from '../repositories/lists.repository.js';
import type { CreateStatusDto } from '../dto/statuses/create-status.dto.js';
import type { UpdateStatusDto } from '../dto/statuses/update-status.dto.js';
import type { ReorderStatusDto } from '../dto/statuses/reorder-status.dto.js';
import type { StatusResponseDto } from '../dto/statuses/status-response.dto.js';
import {
  HierarchyStatusCreatedEvent,
  HierarchyStatusUpdatedEvent,
  HierarchyStatusDeletedEvent,
} from '../events/hierarchy.events.js';

@Injectable()
export class StatusesService {
  constructor(
    private readonly statusesRepo: StatusesRepository,
    private readonly listsRepo: ListsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async getActiveList(workspaceId: string, listId: string) {
    const list = await this.listsRepo.findById(workspaceId, listId);
    if (!list) {
      throw new NotFoundException('List not found');
    }
    if (list.archivedAt !== null) {
      throw new ConflictException(
        'Cannot modify statuses of an archived list',
      );
    }
    return list;
  }

  async findByList(
    workspaceId: string,
    listId: string,
  ): Promise<StatusResponseDto[]> {
    const list = await this.listsRepo.findById(workspaceId, listId);
    if (!list) {
      throw new NotFoundException('List not found');
    }
    return this.statusesRepo.findByList(workspaceId, listId);
  }

  async create(
    workspaceId: string,
    listId: string,
    dto: CreateStatusDto,
  ): Promise<StatusResponseDto> {
    await this.getActiveList(workspaceId, listId);

    const existing = await this.statusesRepo.findByList(workspaceId, listId);

    if (existing.length >= 20) {
      throw new ConflictException(
        'Maximum limit of 20 statuses per list reached',
      );
    }

    const trimmedName = dto.name.trim();
    const isDuplicate = existing.some(
      (s) => s.name.toLowerCase() === trimmedName.toLowerCase(),
    );
    if (isDuplicate) {
      throw new ConflictException(
        `Status with name "${trimmedName}" already exists in this list`,
      );
    }

    const status = await this.statusesRepo.create({
      workspaceId,
      listId,
      name: trimmedName,
      type: dto.type,
      position: existing.length,
      color: dto.color,
    });

    this.eventEmitter.emit(
      'hierarchy.status.created',
      new HierarchyStatusCreatedEvent({
        workspaceId,
        listId,
        statusId: status.id,
      }),
    );

    return status;
  }

  async update(
    workspaceId: string,
    listId: string,
    statusId: string,
    dto: UpdateStatusDto,
  ): Promise<StatusResponseDto> {
    await this.getActiveList(workspaceId, listId);

    const existing = await this.statusesRepo.findByList(workspaceId, listId);
    const current = existing.find((s) => s.id === statusId);
    if (!current) {
      throw new NotFoundException('Status not found');
    }

    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      const isDuplicate = existing.some(
        (s) =>
          s.id !== statusId &&
          s.name.toLowerCase() === trimmedName.toLowerCase(),
      );
      if (isDuplicate) {
        throw new ConflictException(
          `Status with name "${trimmedName}" already exists in this list`,
        );
      }
    }

    if (dto.type !== undefined && dto.type !== current.type) {
      if (current.type === StatusType.OPEN) {
        const openCount = existing.filter(
          (s) => s.type === StatusType.OPEN,
        ).length;
        if (openCount <= 1) {
          throw new ConflictException(
            'Cannot retype the only OPEN status; a list must keep at least one OPEN status',
          );
        }
      }

      if (current.type === StatusType.DONE) {
        const doneCount = existing.filter(
          (s) => s.type === StatusType.DONE,
        ).length;
        if (doneCount <= 1) {
          throw new ConflictException(
            'Cannot retype the only DONE status; a list must keep at least one DONE status',
          );
        }
      }
    }

    const updated = await this.statusesRepo.update(
      workspaceId,
      listId,
      statusId,
      {
        name: dto.name?.trim(),
        color: dto.color,
        type: dto.type,
      },
    );

    this.eventEmitter.emit(
      'hierarchy.status.updated',
      new HierarchyStatusUpdatedEvent({ workspaceId, listId, statusId }),
    );

    return updated;
  }

  async reorder(
    workspaceId: string,
    listId: string,
    statusId: string,
    dto: ReorderStatusDto,
  ): Promise<StatusResponseDto[]> {
    await this.getActiveList(workspaceId, listId);

    const existing = await this.statusesRepo.findByList(workspaceId, listId);
    const currentIndex = existing.findIndex((s) => s.id === statusId);
    if (currentIndex === -1) {
      throw new NotFoundException('Status not found');
    }

    if (dto.toIndex < 0 || dto.toIndex >= existing.length) {
      throw new BadRequestException('Target index out of bounds');
    }

    const ids = existing.map((s) => s.id);
    const [movedId] = ids.splice(currentIndex, 1);
    ids.splice(dto.toIndex, 0, movedId);

    const results = await this.statusesRepo.reorderContiguously(
      workspaceId,
      listId,
      ids,
    );

    this.eventEmitter.emit(
      'hierarchy.status.updated',
      new HierarchyStatusUpdatedEvent({ workspaceId, listId, statusId }),
    );

    return results;
  }

  async delete(
    workspaceId: string,
    listId: string,
    statusId: string,
  ): Promise<void> {
    await this.getActiveList(workspaceId, listId);

    const existing = await this.statusesRepo.findByList(workspaceId, listId);
    const current = existing.find((s) => s.id === statusId);
    if (!current) {
      throw new NotFoundException('Status not found');
    }

    if (current.type === StatusType.OPEN) {
      const openCount = existing.filter(
        (s) => s.type === StatusType.OPEN,
      ).length;
      if (openCount <= 1) {
        throw new ConflictException(
          'Cannot delete the only OPEN status in the list',
        );
      }
    }

    if (current.type === StatusType.DONE) {
      const doneCount = existing.filter(
        (s) => s.type === StatusType.DONE,
      ).length;
      if (doneCount <= 1) {
        throw new ConflictException(
          'Cannot delete the only DONE status in the list',
        );
      }
    }

    await this.statusesRepo.deleteAndRenumber(
      workspaceId,
      listId,
      statusId,
    );

    this.eventEmitter.emit(
      'hierarchy.status.deleted',
      new HierarchyStatusDeletedEvent({ workspaceId, listId, statusId }),
    );
  }
}
