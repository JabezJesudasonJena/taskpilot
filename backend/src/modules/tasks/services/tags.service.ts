import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TagsRepository } from '../repositories/tags.repository.js';
import type { CreateTagDto } from '../dto/tags/create-tag.dto.js';
import type { UpdateTagDto } from '../dto/tags/update-tag.dto.js';
import type { TagResponseDto } from '../dto/tags/tag-response.dto.js';
import {
  TagCreatedEvent,
  TagUpdatedEvent,
  TagDeletedEvent,
} from '../events/tasks.events.js';

@Injectable()
export class TagsService {
  constructor(
    private readonly tagsRepo: TagsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    workspaceId: string,
    actorId: string,
    dto: CreateTagDto,
  ): Promise<TagResponseDto> {
    const trimmedName = dto.name.trim();

    const existingCount = await this.tagsRepo.count(workspaceId);
    if (existingCount >= 500) {
      throw new ConflictException(
        'Workspace tag limit reached (maximum 500 tags)',
      );
    }

    const duplicate = await this.tagsRepo.findByName(workspaceId, trimmedName);
    if (duplicate) {
      throw new ConflictException(
        `Tag with name "${trimmedName}" already exists in this workspace`,
      );
    }

    const tag = await this.tagsRepo.create(workspaceId, {
      name: trimmedName,
      color: dto.color,
    });

    this.eventEmitter.emit(
      'tag.created',
      new TagCreatedEvent({
        workspaceId,
        tagId: tag.id,
        actorId,
        name: tag.name,
      }),
    );

    return tag;
  }

  async findAll(workspaceId: string): Promise<TagResponseDto[]> {
    return this.tagsRepo.findAll(workspaceId, 500);
  }

  async findById(workspaceId: string, tagId: string): Promise<TagResponseDto> {
    const tag = await this.tagsRepo.findById(workspaceId, tagId);
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }
    return tag;
  }

  async update(
    workspaceId: string,
    tagId: string,
    actorId: string,
    dto: UpdateTagDto,
  ): Promise<TagResponseDto> {
    const tag = await this.tagsRepo.findById(workspaceId, tagId);
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    let trimmedName: string | undefined;
    if (dto.name !== undefined) {
      trimmedName = dto.name.trim();
      const duplicate = await this.tagsRepo.findByName(
        workspaceId,
        trimmedName,
      );
      if (duplicate && duplicate.id !== tagId) {
        throw new ConflictException(
          `Tag with name "${trimmedName}" already exists in this workspace`,
        );
      }
    }

    const updated = await this.tagsRepo.update(workspaceId, tagId, {
      name: trimmedName,
      color: dto.color,
    });

    this.eventEmitter.emit(
      'tag.updated',
      new TagUpdatedEvent({
        workspaceId,
        tagId,
        actorId,
        name: updated.name,
        color: updated.color,
      }),
    );

    return updated;
  }

  async delete(
    workspaceId: string,
    tagId: string,
    actorId: string,
  ): Promise<void> {
    const tag = await this.tagsRepo.findById(workspaceId, tagId);
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    await this.tagsRepo.delete(workspaceId, tagId);

    this.eventEmitter.emit(
      'tag.deleted',
      new TagDeletedEvent({
        workspaceId,
        tagId,
        actorId,
      }),
    );
  }
}
