import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SpacesRepository } from '../repositories/spaces.repository.js';
import { positionBetween } from '../../../common/index.js';
import type { CreateSpaceDto } from '../dto/spaces/create-space.dto.js';
import type { UpdateSpaceDto } from '../dto/spaces/update-space.dto.js';
import type { ReorderDto } from '../dto/common/reorder.dto.js';
import type { SpaceResponseDto } from '../dto/spaces/space-response.dto.js';
import {
  HierarchySpaceCreatedEvent,
  HierarchySpaceUpdatedEvent,
  HierarchySpaceArchivedEvent,
  HierarchySpaceUnarchivedEvent,
  HierarchySpaceDeletedEvent,
} from '../events/hierarchy.events.js';

@Injectable()
export class SpacesService {
  constructor(
    private readonly spacesRepo: SpacesRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    workspaceId: string,
    dto: CreateSpaceDto,
  ): Promise<SpaceResponseDto> {
    const lastSibling = await this.spacesRepo.findLastSibling(workspaceId);
    const position = positionBetween(lastSibling?.position ?? null, null);

    const space = await this.spacesRepo.create({
      workspaceId,
      name: dto.name.trim(),
      description: dto.description?.trim(),
      color: dto.color,
      icon: dto.icon?.trim(),
      position,
    });

    this.eventEmitter.emit(
      'hierarchy.space.created',
      new HierarchySpaceCreatedEvent({ workspaceId, id: space.id }),
    );

    return space;
  }

  async findOne(
    workspaceId: string,
    spaceId: string,
  ): Promise<SpaceResponseDto> {
    const space = await this.spacesRepo.findById(workspaceId, spaceId);
    if (!space) {
      throw new NotFoundException('Space not found');
    }
    return space;
  }

  async findAll(
    workspaceId: string,
    includeArchived = false,
  ): Promise<SpaceResponseDto[]> {
    return this.spacesRepo.findAll(workspaceId, includeArchived);
  }

  async update(
    workspaceId: string,
    spaceId: string,
    dto: UpdateSpaceDto,
  ): Promise<SpaceResponseDto> {
    const space = await this.spacesRepo.findById(workspaceId, spaceId);
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    if (space.archivedAt !== null) {
      throw new ConflictException('Cannot modify an archived space');
    }

    const updated = await this.spacesRepo.update(workspaceId, spaceId, {
      name: dto.name?.trim(),
      description: dto.description?.trim(),
      color: dto.color,
      icon: dto.icon?.trim(),
    });

    this.eventEmitter.emit(
      'hierarchy.space.updated',
      new HierarchySpaceUpdatedEvent({ workspaceId, id: spaceId }),
    );

    return updated;
  }

  async reorder(
    workspaceId: string,
    spaceId: string,
    dto: ReorderDto,
  ): Promise<SpaceResponseDto> {
    if (!dto.prevId && !dto.nextId) {
      throw new BadRequestException(
        'At least one of prevId or nextId is required for reordering',
      );
    }

    const space = await this.spacesRepo.findById(workspaceId, spaceId);
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    if (space.archivedAt !== null) {
      throw new ConflictException('Cannot reorder an archived space');
    }

    let newPosition: string;

    if (dto.prevId && dto.nextId) {
      const prev = await this.spacesRepo.findById(workspaceId, dto.prevId);
      const next = await this.spacesRepo.findById(workspaceId, dto.nextId);

      if (!prev || !next) {
        throw new NotFoundException('Sibling boundaries not found');
      }

      if (prev.position >= next.position) {
        throw new BadRequestException(
          'prevId position must be strictly less than nextId position',
        );
      }

      const between = await this.spacesRepo.countBetween(
        workspaceId,
        prev.position,
        next.position,
        spaceId,
      );
      if (between > 0) {
        throw new BadRequestException(
          'prevId and nextId must be adjacent siblings',
        );
      }

      newPosition = positionBetween(prev.position, next.position);
    } else if (dto.prevId) {
      const prev = await this.spacesRepo.findById(workspaceId, dto.prevId);
      if (!prev) {
        throw new NotFoundException('Preceding sibling not found');
      }

      const next = await this.spacesRepo.findSiblingAfter(
        workspaceId,
        prev.position,
      );
      newPosition = positionBetween(prev.position, next?.position ?? null);
    } else {
      // nextId only
      const next = await this.spacesRepo.findById(workspaceId, dto.nextId!);
      if (!next) {
        throw new NotFoundException('Succeeding sibling not found');
      }

      const prev = await this.spacesRepo.findSiblingBefore(
        workspaceId,
        next.position,
      );
      newPosition = positionBetween(prev?.position ?? null, next.position);
    }

    const updated = await this.spacesRepo.update(workspaceId, spaceId, {
      position: newPosition,
    });

    this.eventEmitter.emit(
      'hierarchy.space.updated',
      new HierarchySpaceUpdatedEvent({ workspaceId, id: spaceId }),
    );

    return updated;
  }

  async archive(
    workspaceId: string,
    spaceId: string,
  ): Promise<SpaceResponseDto> {
    const space = await this.spacesRepo.findById(workspaceId, spaceId);
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    if (space.archivedAt !== null) {
      return space;
    }

    const now = new Date();
    const archived = await this.spacesRepo.archiveCascade(
      workspaceId,
      spaceId,
      now,
    );

    this.eventEmitter.emit(
      'hierarchy.space.archived',
      new HierarchySpaceArchivedEvent({ workspaceId, id: spaceId }),
    );

    return archived;
  }

  async unarchive(
    workspaceId: string,
    spaceId: string,
  ): Promise<SpaceResponseDto> {
    const space = await this.spacesRepo.findById(workspaceId, spaceId);
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    if (space.archivedAt === null) {
      return space;
    }

    const unarchived = await this.spacesRepo.unarchiveCascade(
      workspaceId,
      spaceId,
      space.archivedAt,
    );

    this.eventEmitter.emit(
      'hierarchy.space.unarchived',
      new HierarchySpaceUnarchivedEvent({ workspaceId, id: spaceId }),
    );

    return unarchived;
  }

  async delete(workspaceId: string, spaceId: string): Promise<void> {
    const space = await this.spacesRepo.findById(workspaceId, spaceId);
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    if (space.archivedAt === null) {
      throw new ConflictException(
        'Cannot permanently delete a space that is not archived',
      );
    }

    await this.spacesRepo.delete(workspaceId, spaceId);

    this.eventEmitter.emit(
      'hierarchy.space.deleted',
      new HierarchySpaceDeletedEvent({ workspaceId, id: spaceId }),
    );
  }
}
