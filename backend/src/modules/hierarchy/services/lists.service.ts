import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ListsRepository } from '../repositories/lists.repository.js';
import { SpacesRepository } from '../repositories/spaces.repository.js';
import { FoldersRepository } from '../repositories/folders.repository.js';
import { positionBetween } from '../../../common/index.js';
import type { CreateListDto } from '../dto/lists/create-list.dto.js';
import type { UpdateListDto } from '../dto/lists/update-list.dto.js';
import type { MoveListDto } from '../dto/lists/move-list.dto.js';
import type { ReorderDto } from '../dto/common/reorder.dto.js';
import type { ListResponseDto } from '../dto/lists/list-response.dto.js';
import type { ListQueryDto } from '../dto/lists/list-query.dto.js';
import {
  HierarchyListCreatedEvent,
  HierarchyListUpdatedEvent,
  HierarchyListMovedEvent,
  HierarchyListArchivedEvent,
  HierarchyListUnarchivedEvent,
  HierarchyListDeletedEvent,
} from '../events/hierarchy.events.js';

@Injectable()
export class ListsService {
  constructor(
    private readonly listsRepo: ListsRepository,
    private readonly spacesRepo: SpacesRepository,
    private readonly foldersRepo: FoldersRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    workspaceId: string,
    spaceId: string,
    dto: CreateListDto,
  ): Promise<ListResponseDto> {
    const space = await this.spacesRepo.findById(workspaceId, spaceId);
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    if (space.archivedAt !== null) {
      throw new ConflictException('Cannot create a list in an archived space');
    }

    if (dto.folderId) {
      const folder = await this.foldersRepo.findById(
        workspaceId,
        dto.folderId,
      );
      if (!folder || folder.spaceId !== spaceId) {
        throw new BadRequestException(
          'Specified folder does not belong to this space',
        );
      }
      if (folder.archivedAt !== null) {
        throw new ConflictException(
          'Cannot create a list in an archived folder',
        );
      }
    }

    const lastSibling = await this.listsRepo.findLastSibling(
      workspaceId,
      spaceId,
      dto.folderId ?? null,
    );
    const position = positionBetween(lastSibling?.position ?? null, null);

    const list = await this.listsRepo.createWithDefaultStatuses({
      workspaceId,
      spaceId,
      folderId: dto.folderId ?? null,
      name: dto.name.trim(),
      description: dto.description?.trim(),
      color: dto.color,
      position,
    });

    this.eventEmitter.emit(
      'hierarchy.list.created',
      new HierarchyListCreatedEvent({ workspaceId, id: list.id }),
    );

    return {
      id: list.id,
      workspaceId: list.workspaceId,
      spaceId: list.spaceId,
      folderId: list.folderId,
      name: list.name,
      description: list.description,
      color: list.color,
      position: list.position,
      archivedAt: list.archivedAt,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
    };
  }

  async findOne(
    workspaceId: string,
    listId: string,
  ): Promise<ListResponseDto> {
    const list = await this.listsRepo.findById(workspaceId, listId);
    if (!list) {
      throw new NotFoundException('List not found');
    }
    return list;
  }

  async findBySpace(
    workspaceId: string,
    spaceId: string,
    query?: ListQueryDto,
  ): Promise<ListResponseDto[]> {
    const space = await this.spacesRepo.findById(workspaceId, spaceId);
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    return this.listsRepo.findBySpace(workspaceId, spaceId, query);
  }

  async findByFolder(
    workspaceId: string,
    folderId: string,
    includeArchived = false,
  ): Promise<ListResponseDto[]> {
    const folder = await this.foldersRepo.findById(workspaceId, folderId);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    return this.listsRepo.findByFolder(workspaceId, folderId, includeArchived);
  }

  async update(
    workspaceId: string,
    listId: string,
    dto: UpdateListDto,
  ): Promise<ListResponseDto> {
    const list = await this.listsRepo.findById(workspaceId, listId);
    if (!list) {
      throw new NotFoundException('List not found');
    }

    if (list.archivedAt !== null) {
      throw new ConflictException('Cannot modify an archived list');
    }

    const hasMove = dto.spaceId !== undefined || dto.folderId !== undefined;
    let destSpaceId = list.spaceId;
    let destFolderId = list.folderId;
    let newPosition = list.position;

    if (hasMove) {
      destSpaceId = dto.spaceId ?? list.spaceId;
      if (dto.spaceId && dto.spaceId !== list.spaceId) {
        destFolderId = dto.folderId !== undefined ? dto.folderId : null;
      } else {
        destFolderId =
          dto.folderId !== undefined ? dto.folderId : list.folderId;
      }

      const destSpace = await this.spacesRepo.findById(
        workspaceId,
        destSpaceId,
      );
      if (!destSpace) {
        throw new NotFoundException('Destination space not found');
      }

      if (destSpace.archivedAt !== null) {
        throw new ConflictException('Cannot move a list into an archived space');
      }

      if (destFolderId !== null) {
        const folder = await this.foldersRepo.findById(
          workspaceId,
          destFolderId,
        );
        if (!folder || folder.spaceId !== destSpaceId) {
          throw new BadRequestException(
            'Destination folder does not belong to destination space',
          );
        }
        if (folder.archivedAt !== null) {
          throw new ConflictException(
            'Cannot move a list into an archived folder',
          );
        }
      }

      const lastSibling = await this.listsRepo.findLastSibling(
        workspaceId,
        destSpaceId,
        destFolderId,
      );

      newPosition = positionBetween(
        lastSibling?.position ?? null,
        null,
      );
    }

    const updated = await this.listsRepo.update(workspaceId, listId, {
      name: dto.name?.trim(),
      description: dto.description?.trim(),
      color: dto.color,
      ...(hasMove
        ? {
            spaceId: destSpaceId,
            folderId: destFolderId,
            position: newPosition,
          }
        : {}),
    });

    if (hasMove) {
      this.eventEmitter.emit(
        'hierarchy.list.moved',
        new HierarchyListMovedEvent({
          workspaceId,
          listId,
          sourceSpaceId: list.spaceId,
          sourceFolderId: list.folderId,
          destinationSpaceId: destSpaceId,
          destinationFolderId: destFolderId,
        }),
      );
    }

    this.eventEmitter.emit(
      'hierarchy.list.updated',
      new HierarchyListUpdatedEvent({ workspaceId, id: listId }),
    );

    return updated;
  }

  async move(
    workspaceId: string,
    listId: string,
    dto: MoveListDto,
  ): Promise<ListResponseDto> {
    const list = await this.listsRepo.findById(workspaceId, listId);
    if (!list) {
      throw new NotFoundException('List not found');
    }

    if (list.archivedAt !== null) {
      throw new ConflictException('Cannot move an archived list');
    }

    const sourceSpaceId = list.spaceId;
    const sourceFolderId = list.folderId;

    const destSpaceId = dto.spaceId ?? list.spaceId;
    let destFolderId: string | null;

    if (dto.spaceId && dto.spaceId !== list.spaceId) {
      // If space changes, folderId must be null or explicitly a folder of destination space
      destFolderId = dto.folderId !== undefined ? dto.folderId : null;
    } else {
      destFolderId =
        dto.folderId !== undefined ? dto.folderId : list.folderId;
    }

    const destSpace = await this.spacesRepo.findById(workspaceId, destSpaceId);
    if (!destSpace) {
      throw new NotFoundException('Destination space not found');
    }

    if (destSpace.archivedAt !== null) {
      throw new ConflictException('Cannot move a list into an archived space');
    }

    if (destFolderId !== null) {
      const folder = await this.foldersRepo.findById(
        workspaceId,
        destFolderId,
      );
      if (!folder || folder.spaceId !== destSpaceId) {
        throw new BadRequestException(
          'Destination folder does not belong to destination space',
        );
      }
      if (folder.archivedAt !== null) {
        throw new ConflictException(
          'Cannot move a list into an archived folder',
        );
      }
    }

    const lastSibling = await this.listsRepo.findLastSibling(
      workspaceId,
      destSpaceId,
      destFolderId,
    );

    const newPosition = positionBetween(
      lastSibling?.position ?? null,
      null,
    );

    const updated = await this.listsRepo.update(workspaceId, listId, {
      spaceId: destSpaceId,
      folderId: destFolderId,
      position: newPosition,
    });

    this.eventEmitter.emit(
      'hierarchy.list.moved',
      new HierarchyListMovedEvent({
        workspaceId,
        listId,
        sourceSpaceId,
        sourceFolderId,
        destinationSpaceId: destSpaceId,
        destinationFolderId: destFolderId,
      }),
    );

    return updated;
  }

  async reorder(
    workspaceId: string,
    listId: string,
    dto: ReorderDto,
  ): Promise<ListResponseDto> {
    if (!dto.prevId && !dto.nextId) {
      throw new BadRequestException(
        'At least one of prevId or nextId is required for reordering',
      );
    }

    const list = await this.listsRepo.findById(workspaceId, listId);
    if (!list) {
      throw new NotFoundException('List not found');
    }

    if (list.archivedAt !== null) {
      throw new ConflictException('Cannot reorder an archived list');
    }

    let newPosition: string;

    if (dto.prevId && dto.nextId) {
      const prev = await this.listsRepo.findById(workspaceId, dto.prevId);
      const next = await this.listsRepo.findById(workspaceId, dto.nextId);

      if (!prev || !next) {
        throw new NotFoundException('Sibling boundaries not found');
      }

      if (
        prev.spaceId !== list.spaceId ||
        prev.folderId !== list.folderId ||
        next.spaceId !== list.spaceId ||
        next.folderId !== list.folderId
      ) {
        throw new BadRequestException(
          'Sibling boundaries not in same sibling group',
        );
      }

      if (prev.position >= next.position) {
        throw new BadRequestException(
          'prevId position must be strictly less than nextId position',
        );
      }

      const between = await this.listsRepo.countBetween(
        workspaceId,
        list.spaceId,
        list.folderId,
        prev.position,
        next.position,
        listId,
      );
      if (between > 0) {
        throw new BadRequestException(
          'prevId and nextId must be adjacent siblings',
        );
      }

      newPosition = positionBetween(prev.position, next.position);
    } else if (dto.prevId) {
      const prev = await this.listsRepo.findById(workspaceId, dto.prevId);
      if (!prev) {
        throw new NotFoundException('Preceding sibling not found');
      }
      if (
        prev.spaceId !== list.spaceId ||
        prev.folderId !== list.folderId
      ) {
        throw new BadRequestException(
          'Preceding sibling not found in sibling group',
        );
      }

      const next = await this.listsRepo.findSiblingAfter(
        workspaceId,
        list.spaceId,
        list.folderId,
        prev.position,
      );
      newPosition = positionBetween(prev.position, next?.position ?? null);
    } else {
      // nextId only
      const next = await this.listsRepo.findById(workspaceId, dto.nextId!);
      if (!next) {
        throw new NotFoundException('Succeeding sibling not found');
      }
      if (
        next.spaceId !== list.spaceId ||
        next.folderId !== list.folderId
      ) {
        throw new BadRequestException(
          'Succeeding sibling not found in sibling group',
        );
      }

      const prev = await this.listsRepo.findSiblingBefore(
        workspaceId,
        list.spaceId,
        list.folderId,
        next.position,
      );
      newPosition = positionBetween(prev?.position ?? null, next.position);
    }

    const updated = await this.listsRepo.update(workspaceId, listId, {
      position: newPosition,
    });

    this.eventEmitter.emit(
      'hierarchy.list.updated',
      new HierarchyListUpdatedEvent({ workspaceId, id: listId }),
    );

    return updated;
  }

  async archive(
    workspaceId: string,
    listId: string,
  ): Promise<ListResponseDto> {
    const list = await this.listsRepo.findById(workspaceId, listId);
    if (!list) {
      throw new NotFoundException('List not found');
    }

    if (list.archivedAt !== null) {
      return list;
    }

    const now = new Date();
    const archived = await this.listsRepo.archive(workspaceId, listId, now);

    this.eventEmitter.emit(
      'hierarchy.list.archived',
      new HierarchyListArchivedEvent({ workspaceId, id: listId }),
    );

    return archived;
  }

  async unarchive(
    workspaceId: string,
    listId: string,
  ): Promise<ListResponseDto> {
    const list = await this.listsRepo.findById(workspaceId, listId);
    if (!list) {
      throw new NotFoundException('List not found');
    }

    if (list.archivedAt === null) {
      return list;
    }

    // Check parent space
    const parentSpace = await this.spacesRepo.findById(
      workspaceId,
      list.spaceId,
    );
    if (parentSpace && parentSpace.archivedAt !== null) {
      throw new ConflictException(
        'Cannot unarchive list while its parent space is archived',
      );
    }

    // Check parent folder if present
    if (list.folderId) {
      const parentFolder = await this.foldersRepo.findById(
        workspaceId,
        list.folderId,
      );
      if (parentFolder && parentFolder.archivedAt !== null) {
        throw new ConflictException(
          'Cannot unarchive list while its parent folder is archived',
        );
      }
    }

    const unarchived = await this.listsRepo.unarchive(workspaceId, listId);

    this.eventEmitter.emit(
      'hierarchy.list.unarchived',
      new HierarchyListUnarchivedEvent({ workspaceId, id: listId }),
    );

    return unarchived;
  }

  async delete(workspaceId: string, listId: string): Promise<void> {
    const list = await this.listsRepo.findById(workspaceId, listId);
    if (!list) {
      throw new NotFoundException('List not found');
    }

    if (list.archivedAt === null) {
      throw new ConflictException(
        'Cannot permanently delete a list that is not archived',
      );
    }

    await this.listsRepo.delete(workspaceId, listId);

    this.eventEmitter.emit(
      'hierarchy.list.deleted',
      new HierarchyListDeletedEvent({ workspaceId, id: listId }),
    );
  }
}
