import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FoldersRepository } from '../repositories/folders.repository.js';
import { SpacesRepository } from '../repositories/spaces.repository.js';
import { positionBetween } from '../../../common/index.js';
import type { CreateFolderDto } from '../dto/folders/create-folder.dto.js';
import type { UpdateFolderDto } from '../dto/folders/update-folder.dto.js';
import type { ReorderDto } from '../dto/common/reorder.dto.js';
import type { FolderResponseDto } from '../dto/folders/folder-response.dto.js';
import {
  HierarchyFolderCreatedEvent,
  HierarchyFolderUpdatedEvent,
  HierarchyFolderArchivedEvent,
  HierarchyFolderUnarchivedEvent,
  HierarchyFolderDeletedEvent,
} from '../events/hierarchy.events.js';

@Injectable()
export class FoldersService {
  constructor(
    private readonly foldersRepo: FoldersRepository,
    private readonly spacesRepo: SpacesRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    workspaceId: string,
    spaceId: string,
    dto: CreateFolderDto,
  ): Promise<FolderResponseDto> {
    const space = await this.spacesRepo.findById(workspaceId, spaceId);
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    if (space.archivedAt !== null) {
      throw new ConflictException(
        'Cannot create a folder in an archived space',
      );
    }

    const lastSibling = await this.foldersRepo.findLastSibling(
      workspaceId,
      spaceId,
    );
    const position = positionBetween(lastSibling?.position ?? null, null);

    const folder = await this.foldersRepo.create({
      workspaceId,
      spaceId,
      name: dto.name.trim(),
      color: dto.color,
      position,
    });

    this.eventEmitter.emit(
      'hierarchy.folder.created',
      new HierarchyFolderCreatedEvent({ workspaceId, id: folder.id }),
    );

    return folder;
  }

  async findOne(
    workspaceId: string,
    folderId: string,
  ): Promise<FolderResponseDto> {
    const folder = await this.foldersRepo.findById(workspaceId, folderId);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    return folder;
  }

  async findBySpace(
    workspaceId: string,
    spaceId: string,
    includeArchived = false,
  ): Promise<FolderResponseDto[]> {
    const space = await this.spacesRepo.findById(workspaceId, spaceId);
    if (!space) {
      throw new NotFoundException('Space not found');
    }
    return this.foldersRepo.findBySpace(workspaceId, spaceId, includeArchived);
  }

  async update(
    workspaceId: string,
    folderId: string,
    dto: UpdateFolderDto,
  ): Promise<FolderResponseDto> {
    const folder = await this.foldersRepo.findById(workspaceId, folderId);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    if (folder.archivedAt !== null) {
      throw new ConflictException('Cannot modify an archived folder');
    }

    const updated = await this.foldersRepo.update(workspaceId, folderId, {
      name: dto.name?.trim(),
      color: dto.color,
    });

    this.eventEmitter.emit(
      'hierarchy.folder.updated',
      new HierarchyFolderUpdatedEvent({ workspaceId, id: folderId }),
    );

    return updated;
  }

  async reorder(
    workspaceId: string,
    folderId: string,
    dto: ReorderDto,
  ): Promise<FolderResponseDto> {
    if (!dto.prevId && !dto.nextId) {
      throw new BadRequestException(
        'At least one of prevId or nextId is required for reordering',
      );
    }

    const folder = await this.foldersRepo.findById(workspaceId, folderId);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    if (folder.archivedAt !== null) {
      throw new ConflictException('Cannot reorder an archived folder');
    }

    let newPosition: string;

    if (dto.prevId && dto.nextId) {
      const prev = await this.foldersRepo.findById(workspaceId, dto.prevId);
      const next = await this.foldersRepo.findById(workspaceId, dto.nextId);

      if (!prev || !next) {
        throw new NotFoundException('Sibling boundaries not found');
      }

      if (
        prev.spaceId !== folder.spaceId ||
        next.spaceId !== folder.spaceId
      ) {
        throw new BadRequestException('Sibling boundaries not in same space');
      }

      if (prev.position >= next.position) {
        throw new BadRequestException(
          'prevId position must be strictly less than nextId position',
        );
      }

      const between = await this.foldersRepo.countBetween(
        workspaceId,
        folder.spaceId,
        prev.position,
        next.position,
        folderId,
      );
      if (between > 0) {
        throw new BadRequestException(
          'prevId and nextId must be adjacent siblings',
        );
      }

      newPosition = positionBetween(prev.position, next.position);
    } else if (dto.prevId) {
      const prev = await this.foldersRepo.findById(workspaceId, dto.prevId);
      if (!prev) {
        throw new NotFoundException('Preceding sibling not found');
      }
      if (prev.spaceId !== folder.spaceId) {
        throw new BadRequestException('Preceding sibling not found in space');
      }

      const next = await this.foldersRepo.findSiblingAfter(
        workspaceId,
        folder.spaceId,
        prev.position,
      );
      newPosition = positionBetween(prev.position, next?.position ?? null);
    } else {
      // nextId only
      const next = await this.foldersRepo.findById(workspaceId, dto.nextId!);
      if (!next) {
        throw new NotFoundException('Succeeding sibling not found');
      }
      if (next.spaceId !== folder.spaceId) {
        throw new BadRequestException('Succeeding sibling not found in space');
      }

      const prev = await this.foldersRepo.findSiblingBefore(
        workspaceId,
        folder.spaceId,
        next.position,
      );
      newPosition = positionBetween(prev?.position ?? null, next.position);
    }

    const updated = await this.foldersRepo.update(workspaceId, folderId, {
      position: newPosition,
    });

    this.eventEmitter.emit(
      'hierarchy.folder.updated',
      new HierarchyFolderUpdatedEvent({ workspaceId, id: folderId }),
    );

    return updated;
  }

  async archive(
    workspaceId: string,
    folderId: string,
  ): Promise<FolderResponseDto> {
    const folder = await this.foldersRepo.findById(workspaceId, folderId);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    if (folder.archivedAt !== null) {
      return folder;
    }

    const now = new Date();
    const archived = await this.foldersRepo.archiveCascade(
      workspaceId,
      folderId,
      now,
    );

    this.eventEmitter.emit(
      'hierarchy.folder.archived',
      new HierarchyFolderArchivedEvent({ workspaceId, id: folderId }),
    );

    return archived;
  }

  async unarchive(
    workspaceId: string,
    folderId: string,
  ): Promise<FolderResponseDto> {
    const folder = await this.foldersRepo.findById(workspaceId, folderId);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    if (folder.archivedAt === null) {
      return folder;
    }

    // Check parent space
    const parentSpace = await this.spacesRepo.findById(
      workspaceId,
      folder.spaceId,
    );
    if (parentSpace && parentSpace.archivedAt !== null) {
      throw new ConflictException(
        'Cannot unarchive folder while its parent space is archived',
      );
    }

    const unarchived = await this.foldersRepo.unarchiveCascade(
      workspaceId,
      folderId,
      folder.archivedAt,
    );

    this.eventEmitter.emit(
      'hierarchy.folder.unarchived',
      new HierarchyFolderUnarchivedEvent({ workspaceId, id: folderId }),
    );

    return unarchived;
  }

  async delete(workspaceId: string, folderId: string): Promise<void> {
    const folder = await this.foldersRepo.findById(workspaceId, folderId);
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    if (folder.archivedAt === null) {
      throw new ConflictException(
        'Cannot permanently delete a folder that is not archived',
      );
    }

    await this.foldersRepo.delete(workspaceId, folderId);

    this.eventEmitter.emit(
      'hierarchy.folder.deleted',
      new HierarchyFolderDeletedEvent({ workspaceId, id: folderId }),
    );
  }
}
