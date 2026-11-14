import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkspaceRole, type TaskPriority } from '@prisma/client';
import { TasksRepository } from '../repositories/tasks.repository.js';
import { TagsRepository } from '../repositories/tags.repository.js';
import { HierarchyService } from '../../hierarchy/index.js';
import {
  WorkspacesService,
  type RequestWorkspaceMember,
} from '../../workspaces/index.js';
import { positionBetween } from '../../../common/position/position.util.js';
import { hasAtLeast } from '../../../common/roles/role.util.js';
import {
  encodeGenericCursor,
  decodeGenericCursor,
} from '../../../common/pagination/cursor.util.js';
import type { CreateTaskDto } from '../dto/tasks/create-task.dto.js';
import type { UpdateTaskDto } from '../dto/tasks/update-task.dto.js';
import type { MoveTaskDto } from '../dto/tasks/move-task.dto.js';
import type { TaskQueryDto } from '../dto/tasks/task-query.dto.js';
import type { TaskResponseDto } from '../dto/tasks/task-response.dto.js';
import type { PaginatedTasksResponseDto } from '../dto/tasks/paginated-tasks-response.dto.js';
import {
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskMovedEvent,
  TaskDeletedEvent,
  TaskRestoredEvent,
  TaskAssigneesChangedEvent,
  TaskTagsChangedEvent,
  type FieldChange,
} from '../events/tasks.events.js';

export interface TaskTenantPublicInfo {
  id: string;
  workspaceId: string;
  listId: string;
  parentId: string | null;
  deletedAt: Date | null;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly tasksRepo: TasksRepository,
    private readonly tagsRepo: TagsRepository,
    private readonly hierarchyService: HierarchyService,
    private readonly workspacesService: WorkspacesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Public API for M5 (activity / comments)
   */
  async getTaskForTenant(
    workspaceId: string,
    taskId: string,
  ): Promise<TaskTenantPublicInfo | null> {
    const task = await this.tasksRepo.findRawById(workspaceId, taskId);
    if (!task) {
      return null;
    }
    return {
      id: task.id,
      workspaceId: task.workspaceId,
      listId: task.listId,
      parentId: task.parentId,
      deletedAt: task.deletedAt,
    };
  }

  async create(
    workspaceId: string,
    currentMember: RequestWorkspaceMember,
    listId: string,
    dto: CreateTaskDto,
    parentId?: string | null,
  ): Promise<TaskResponseDto> {
    // 1. Verify list exists and belongs to tenant
    const list = await this.hierarchyService.getListForTenant(
      workspaceId,
      listId,
    );
    if (!list) {
      throw new NotFoundException('List not found');
    }
    if (list.archivedAt !== null) {
      throw new ConflictException('Cannot create tasks in an archived list');
    }

    // 2. Parent validation if parentId is provided
    let resolvedParentId: string | null = null;
    if (parentId) {
      const parent = await this.tasksRepo.findRawById(workspaceId, parentId);
      if (!parent || parent.deletedAt !== null) {
        throw new NotFoundException('Parent task not found');
      }
      if (parent.parentId !== null) {
        throw new BadRequestException(
          'Subtasks cannot have nested subtasks (depth cap is 1)',
        );
      }
      if (parent.listId !== listId) {
        throw new BadRequestException('Subtask must have the same list as its parent');
      }
      resolvedParentId = parent.id;
    }

    // 3. Status resolution
    let statusId = dto.statusId;
    let statusType = 'OPEN';
    if (statusId) {
      const status = await this.hierarchyService.getStatusForList(
        workspaceId,
        listId,
        statusId,
      );
      if (!status) {
        throw new BadRequestException('Status does not belong to the list');
      }
      statusType = status.type;
    } else {
      const defaultStatus = await this.hierarchyService.getDefaultOpenStatus(
        workspaceId,
        listId,
      );
      if (!defaultStatus) {
        throw new BadRequestException(
          'List does not have a default OPEN status',
        );
      }
      statusId = defaultStatus.id;
      statusType = defaultStatus.type;
    }

    // 4. Validate dates
    const startDate = dto.startDate ? new Date(dto.startDate) : null;
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (startDate && dueDate && startDate > dueDate) {
      throw new BadRequestException('startDate must be before or equal to dueDate');
    }

    // 5. Validate assignees
    let assigneeIds: string[] | undefined;
    if (dto.assigneeIds && dto.assigneeIds.length > 0) {
      const uniqueAssigneeIds = Array.from(new Set(dto.assigneeIds));
      if (uniqueAssigneeIds.length > 20) {
        throw new BadRequestException('At most 20 assignees allowed');
      }
      const memberships = await this.workspacesService.getMembershipsByUserIds(
        workspaceId,
        uniqueAssigneeIds,
      );
      if (memberships.length !== uniqueAssigneeIds.length) {
        throw new BadRequestException(
          'All assignees must be members of the workspace',
        );
      }
      for (const m of memberships) {
        if (m.role === WorkspaceRole.GUEST) {
          throw new BadRequestException('Guests cannot be assigned to tasks');
        }
      }
      assigneeIds = uniqueAssigneeIds;
    }

    // 6. Validate tags
    let tagIds: string[] | undefined;
    if (dto.tagIds && dto.tagIds.length > 0) {
      const uniqueTagIds = Array.from(new Set(dto.tagIds));
      if (uniqueTagIds.length > 20) {
        throw new BadRequestException('At most 20 tags allowed');
      }
      const foundTags = await this.tagsRepo.findByIds(
        workspaceId,
        uniqueTagIds,
      );
      if (foundTags.length !== uniqueTagIds.length) {
        throw new BadRequestException('All tags must belong to the workspace');
      }
      tagIds = uniqueTagIds;
    }

    // 7. Determine completedAt
    const completedAt = statusType === 'DONE' ? new Date() : null;

    // 8. Sibling group & fractional positioning at the end
    const lastSibling = await this.tasksRepo.findSiblingGroupLast(
      workspaceId,
      listId,
      statusId,
      resolvedParentId,
    );
    const position = positionBetween(lastSibling?.position, null);

    // 9. Create task with relations
    const task = await this.tasksRepo.createTaskWithRelations({
      workspaceId,
      listId,
      statusId,
      parentId: resolvedParentId,
      creatorId: currentMember.userId,
      title: dto.title.trim(),
      description: dto.description?.trim() ?? null,
      priority: (dto.priority as TaskPriority) ?? 'NONE',
      startDate,
      dueDate,
      completedAt,
      position,
      assigneeIds,
      tagIds,
    });

    // 10. Emit event
    this.eventEmitter.emit(
      'task.created',
      new TaskCreatedEvent({
        workspaceId,
        taskId: task.id,
        actorId: currentMember.userId,
        listId,
        statusId,
        parentId: resolvedParentId,
      }),
    );

    // 11. Return hydrated task with description
    const hydrated = await this.tasksRepo.findById(workspaceId, task.id, false);
    if (!hydrated) {
      throw new NotFoundException('Task not found after creation');
    }
    return hydrated;
  }

  async createSubtask(
    workspaceId: string,
    currentMember: RequestWorkspaceMember,
    parentTaskId: string,
    dto: CreateTaskDto,
  ): Promise<TaskResponseDto> {
    const parent = await this.tasksRepo.findRawById(workspaceId, parentTaskId);
    if (!parent || parent.deletedAt !== null) {
      throw new NotFoundException('Parent task not found');
    }
    if (parent.parentId !== null) {
      throw new BadRequestException(
        'Subtasks cannot have nested subtasks (depth cap is 1)',
      );
    }

    return this.create(
      workspaceId,
      currentMember,
      parent.listId,
      dto,
      parent.id,
    );
  }

  async findOne(
    workspaceId: string,
    taskId: string,
  ): Promise<TaskResponseDto> {
    const task = await this.tasksRepo.findById(workspaceId, taskId, false);
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  async update(
    workspaceId: string,
    currentMember: RequestWorkspaceMember,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<TaskResponseDto> {
    const task = await this.tasksRepo.findRawById(workspaceId, taskId);
    if (!task || task.deletedAt !== null) {
      throw new NotFoundException('Task not found');
    }

    const list = await this.hierarchyService.getListForTenant(
      workspaceId,
      task.listId,
    );
    if (!list) {
      throw new NotFoundException('List not found');
    }
    if (list.archivedAt !== null) {
      throw new ConflictException('Cannot modify tasks in an archived list');
    }

    const effectiveStartDate =
      dto.startDate !== undefined
        ? dto.startDate ? new Date(dto.startDate) : null
        : task.startDate;
    const effectiveDueDate =
      dto.dueDate !== undefined
        ? dto.dueDate ? new Date(dto.dueDate) : null
        : task.dueDate;

    if (effectiveStartDate && effectiveDueDate && effectiveStartDate > effectiveDueDate) {
      throw new BadRequestException('startDate must be before or equal to dueDate');
    }

    const changes: FieldChange[] = [];
    const updateData: {
      title?: string;
      description?: string | null;
      priority?: TaskPriority;
      startDate?: Date | null;
      dueDate?: Date | null;
    } = {};

    if (dto.title !== undefined) {
      const trimmed = dto.title.trim();
      if (trimmed !== task.title) {
        changes.push({ field: 'title', from: task.title, to: trimmed });
        updateData.title = trimmed;
      }
    }

    if (dto.description !== undefined) {
      const trimmed = dto.description ? dto.description.trim() : null;
      if (trimmed !== task.description) {
        changes.push({ field: 'description' });
        updateData.description = trimmed;
      }
    }

    if (dto.priority !== undefined && dto.priority !== task.priority) {
      changes.push({ field: 'priority', from: task.priority, to: dto.priority });
      updateData.priority = dto.priority;
    }

    if (dto.startDate !== undefined) {
      const newDate = dto.startDate ? new Date(dto.startDate) : null;
      if (
        (newDate === null && task.startDate !== null) ||
        (newDate !== null && task.startDate === null) ||
        (newDate && task.startDate && newDate.getTime() !== task.startDate.getTime())
      ) {
        changes.push({
          field: 'startDate',
          from: task.startDate?.toISOString() ?? null,
          to: newDate?.toISOString() ?? null,
        });
        updateData.startDate = newDate;
      }
    }

    if (dto.dueDate !== undefined) {
      const newDate = dto.dueDate ? new Date(dto.dueDate) : null;
      if (
        (newDate === null && task.dueDate !== null) ||
        (newDate !== null && task.dueDate === null) ||
        (newDate && task.dueDate && newDate.getTime() !== task.dueDate.getTime())
      ) {
        changes.push({
          field: 'dueDate',
          from: task.dueDate?.toISOString() ?? null,
          to: newDate?.toISOString() ?? null,
        });
        updateData.dueDate = newDate;
      }
    }

    if (Object.keys(updateData).length > 0) {
      await this.tasksRepo.update(workspaceId, taskId, updateData);
      this.eventEmitter.emit(
        'task.updated',
        new TaskUpdatedEvent({
          workspaceId,
          taskId,
          actorId: currentMember.userId,
          changes,
        }),
      );
    }

    const hydrated = await this.tasksRepo.findById(workspaceId, taskId, false);
    if (!hydrated) {
      throw new NotFoundException('Task not found');
    }
    return hydrated;
  }

  async softDelete(
    workspaceId: string,
    currentMember: RequestWorkspaceMember,
    taskId: string,
  ): Promise<void> {
    const task = await this.tasksRepo.findRawById(workspaceId, taskId);
    if (!task || task.deletedAt !== null) {
      throw new NotFoundException('Task not found');
    }

    const list = await this.hierarchyService.getListForTenant(
      workspaceId,
      task.listId,
    );
    if (!list) {
      throw new NotFoundException('List not found');
    }
    if (list.archivedAt !== null) {
      throw new ConflictException('Cannot delete tasks in an archived list');
    }

    // Permission: creator or ADMIN or above
    const isCreator = task.creatorId !== null && task.creatorId === currentMember.userId;
    const isAdmin = hasAtLeast(currentMember.role, WorkspaceRole.ADMIN);
    if (!isCreator && !isAdmin) {
      throw new ForbiddenException(
        'Only the task creator or an administrator can delete this task',
      );
    }

    const now = new Date();
    const subtaskIds = await this.tasksRepo.softDelete(
      workspaceId,
      taskId,
      now,
    );

    this.eventEmitter.emit(
      'task.deleted',
      new TaskDeletedEvent({
        workspaceId,
        taskId,
        actorId: currentMember.userId,
        deletedAt: now,
        subtaskIds,
      }),
    );
  }

  async restore(
    workspaceId: string,
    currentMember: RequestWorkspaceMember,
    taskId: string,
  ): Promise<TaskResponseDto> {
    const task = await this.tasksRepo.findRawById(workspaceId, taskId);
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    if (task.deletedAt === null) {
      const active = await this.tasksRepo.findById(workspaceId, taskId, false);
      if (!active) throw new NotFoundException('Task not found');
      return active;
    }

    const list = await this.hierarchyService.getListForTenant(
      workspaceId,
      task.listId,
    );
    if (!list) {
      throw new NotFoundException('List not found');
    }
    if (list.archivedAt !== null) {
      throw new ConflictException('Cannot restore tasks into an archived list');
    }

    // If subtask, verify parent is not deleted
    if (task.parentId) {
      const parent = await this.tasksRepo.findRawById(workspaceId, task.parentId);
      if (!parent || parent.deletedAt !== null) {
        throw new ConflictException(
          'Cannot restore a subtask whose parent is deleted',
        );
      }
    }

    // Permission: creator or ADMIN or above
    const isCreator = task.creatorId !== null && task.creatorId === currentMember.userId;
    const isAdmin = hasAtLeast(currentMember.role, WorkspaceRole.ADMIN);
    if (!isCreator && !isAdmin) {
      throw new ForbiddenException(
        'Only the task creator or an administrator can restore this task',
      );
    }

    const subtaskIds = await this.tasksRepo.restore(
      workspaceId,
      taskId,
      task.deletedAt,
    );

    this.eventEmitter.emit(
      'task.restored',
      new TaskRestoredEvent({
        workspaceId,
        taskId,
        actorId: currentMember.userId,
        subtaskIds,
      }),
    );

    const hydrated = await this.tasksRepo.findById(workspaceId, taskId, false);
    if (!hydrated) {
      throw new NotFoundException('Task not found after restore');
    }
    return hydrated;
  }

  async replaceAssignees(
    workspaceId: string,
    currentMember: RequestWorkspaceMember,
    taskId: string,
    userIds: string[],
  ): Promise<TaskResponseDto> {
    const task = await this.tasksRepo.findRawById(workspaceId, taskId);
    if (!task || task.deletedAt !== null) {
      throw new NotFoundException('Task not found');
    }

    const list = await this.hierarchyService.getListForTenant(
      workspaceId,
      task.listId,
    );
    if (!list) {
      throw new NotFoundException('List not found');
    }
    if (list.archivedAt !== null) {
      throw new ConflictException('Cannot modify tasks in an archived list');
    }

    const uniqueUserIds = Array.from(new Set(userIds));
    if (uniqueUserIds.length > 20) {
      throw new BadRequestException('At most 20 assignees allowed');
    }

    if (uniqueUserIds.length > 0) {
      const memberships = await this.workspacesService.getMembershipsByUserIds(
        workspaceId,
        uniqueUserIds,
      );
      if (memberships.length !== uniqueUserIds.length) {
        throw new BadRequestException(
          'All assignees must be members of the workspace',
        );
      }
      for (const m of memberships) {
        if (m.role === WorkspaceRole.GUEST) {
          throw new BadRequestException('Guests cannot be assigned to tasks');
        }
      }
    }

    const diff = await this.tasksRepo.replaceAssignees(
      workspaceId,
      taskId,
      uniqueUserIds,
    );

    this.eventEmitter.emit(
      'task.assignees.changed',
      new TaskAssigneesChangedEvent({
        workspaceId,
        taskId,
        actorId: currentMember.userId,
        added: diff.added,
        removed: diff.removed,
        current: diff.current,
      }),
    );

    const hydrated = await this.tasksRepo.findById(workspaceId, taskId, false);
    if (!hydrated) {
      throw new NotFoundException('Task not found');
    }
    return hydrated;
  }

  async replaceTags(
    workspaceId: string,
    currentMember: RequestWorkspaceMember,
    taskId: string,
    tagIds: string[],
  ): Promise<TaskResponseDto> {
    const task = await this.tasksRepo.findRawById(workspaceId, taskId);
    if (!task || task.deletedAt !== null) {
      throw new NotFoundException('Task not found');
    }

    const list = await this.hierarchyService.getListForTenant(
      workspaceId,
      task.listId,
    );
    if (!list) {
      throw new NotFoundException('List not found');
    }
    if (list.archivedAt !== null) {
      throw new ConflictException('Cannot modify tasks in an archived list');
    }

    const uniqueTagIds = Array.from(new Set(tagIds));
    if (uniqueTagIds.length > 20) {
      throw new BadRequestException('At most 20 tags allowed');
    }

    if (uniqueTagIds.length > 0) {
      const foundTags = await this.tagsRepo.findByIds(
        workspaceId,
        uniqueTagIds,
      );
      if (foundTags.length !== uniqueTagIds.length) {
        throw new BadRequestException('All tags must belong to the workspace');
      }
    }

    const diff = await this.tasksRepo.replaceTags(
      workspaceId,
      taskId,
      uniqueTagIds,
    );

    this.eventEmitter.emit(
      'task.tags.changed',
      new TaskTagsChangedEvent({
        workspaceId,
        taskId,
        actorId: currentMember.userId,
        added: diff.added,
        removed: diff.removed,
        current: diff.current,
      }),
    );

    const hydrated = await this.tasksRepo.findById(workspaceId, taskId, false);
    if (!hydrated) {
      throw new NotFoundException('Task not found');
    }
    return hydrated;
  }

  async move(
    workspaceId: string,
    currentMember: RequestWorkspaceMember,
    taskId: string,
    dto: MoveTaskDto,
  ): Promise<TaskResponseDto> {
    const task = await this.tasksRepo.findRawById(workspaceId, taskId);
    if (!task || task.deletedAt !== null) {
      throw new NotFoundException('Task not found');
    }

    const sourceList = await this.hierarchyService.getListForTenant(
      workspaceId,
      task.listId,
    );
    if (!sourceList) {
      throw new NotFoundException('List not found');
    }
    if (sourceList.archivedAt !== null) {
      throw new ConflictException('Cannot move tasks from an archived list');
    }

    const targetListId = dto.listId ?? task.listId;
    const isCrossList = targetListId !== task.listId;

    if (isCrossList && task.parentId !== null) {
      throw new BadRequestException('Subtasks cannot change list on their own');
    }

    if (isCrossList) {
      const dest = await this.hierarchyService.getListForTenant(
        workspaceId,
        targetListId,
      );
      if (!dest) {
        throw new NotFoundException('Destination list not found');
      }
      if (dest.archivedAt !== null) {
        throw new ConflictException('Cannot move task into an archived list');
      }
    }

    // Status resolution
    let targetStatus: { id: string; type: string; name: string };
    if (isCrossList) {
      if (dto.statusId) {
        const s = await this.hierarchyService.getStatusForList(
          workspaceId,
          targetListId,
          dto.statusId,
        );
        if (!s) {
          throw new BadRequestException('Status does not belong to destination list');
        }
        targetStatus = s;
      } else {
        const destStatuses = await this.hierarchyService.getStatusesForList(
          workspaceId,
          targetListId,
        );
        const currentStatus = await this.hierarchyService.getStatusForList(
          workspaceId,
          task.listId,
          task.statusId,
        );
        let matched = destStatuses.find(
          (s) => s.name.toLowerCase() === currentStatus?.name.toLowerCase(),
        );
        if (!matched) {
          matched = destStatuses.find((s) => s.type === currentStatus?.type);
        }
        if (!matched) {
          const defaultOpen = await this.hierarchyService.getDefaultOpenStatus(
            workspaceId,
            targetListId,
          );
          if (defaultOpen) {
            matched = defaultOpen;
          }
        }
        if (!matched) {
          throw new BadRequestException('Could not resolve destination status');
        }
        targetStatus = matched;
      }
    } else {
      if (dto.statusId) {
        const s = await this.hierarchyService.getStatusForList(
          workspaceId,
          task.listId,
          dto.statusId,
        );
        if (!s) {
          throw new BadRequestException('Status does not belong to list');
        }
        targetStatus = s;
      } else {
        const s = await this.hierarchyService.getStatusForList(
          workspaceId,
          task.listId,
          task.statusId,
        );
        if (!s) {
          throw new BadRequestException('Current status not found');
        }
        targetStatus = s;
      }
    }

    // Sibling positioning
    let position: string;
    if (dto.prevId || dto.nextId) {
      if (
        dto.prevId === dto.nextId ||
        dto.prevId === taskId ||
        dto.nextId === taskId
      ) {
        throw new BadRequestException('Invalid sibling bounds');
      }

      let prevTask: any = null;
      if (dto.prevId) {
        prevTask = await this.tasksRepo.findRawById(workspaceId, dto.prevId);
        if (!prevTask || prevTask.deletedAt !== null) {
          throw new BadRequestException('prevId task not found');
        }
        if (task.parentId) {
          if (prevTask.parentId !== task.parentId) {
            throw new BadRequestException('prevId does not share the same parent');
          }
        } else {
          if (
            prevTask.parentId !== null ||
            prevTask.listId !== targetListId ||
            prevTask.statusId !== targetStatus.id
          ) {
            throw new BadRequestException(
              'prevId is not in destination sibling group',
            );
          }
        }
      }

      let nextTask: any = null;
      if (dto.nextId) {
        nextTask = await this.tasksRepo.findRawById(workspaceId, dto.nextId);
        if (!nextTask || nextTask.deletedAt !== null) {
          throw new BadRequestException('nextId task not found');
        }
        if (task.parentId) {
          if (nextTask.parentId !== task.parentId) {
            throw new BadRequestException('nextId does not share the same parent');
          }
        } else {
          if (
            nextTask.parentId !== null ||
            nextTask.listId !== targetListId ||
            nextTask.statusId !== targetStatus.id
          ) {
            throw new BadRequestException(
              'nextId is not in destination sibling group',
            );
          }
        }
      }

      if (prevTask && nextTask && prevTask.position >= nextTask.position) {
        throw new BadRequestException(
          'prevId must have smaller position than nextId',
        );
      }

      position = positionBetween(prevTask?.position, nextTask?.position);
    } else {
      const last = await this.tasksRepo.findSiblingGroupLast(
        workspaceId,
        targetListId,
        targetStatus.id,
        task.parentId,
      );
      position = positionBetween(last?.position, null);
    }

    // Recompute completedAt
    let completedAt: Date | null = null;
    if (targetStatus.type === 'DONE') {
      completedAt = task.completedAt ?? new Date();
    }

    // Subtasks follow parent if cross-list
    const subtaskUpdates: Array<{
      id: string;
      listId: string;
      statusId: string;
      completedAt: Date | null;
    }> = [];

    let subtaskIds: string[] = [];
    if (isCrossList) {
      const subtasks = await this.tasksRepo.getSubtasksOfTask(
        workspaceId,
        task.id,
      );
      subtaskIds = subtasks.map((s) => s.id);
      if (subtasks.length > 0) {
        const destStatuses = await this.hierarchyService.getStatusesForList(
          workspaceId,
          targetListId,
        );
        const defaultOpen = await this.hierarchyService.getDefaultOpenStatus(
          workspaceId,
          targetListId,
        );

        for (const sub of subtasks) {
          const subCurrentStatus = await this.hierarchyService.getStatusForList(
            workspaceId,
            task.listId,
            sub.statusId,
          );

          let mapped = destStatuses.find(
            (s) =>
              s.name.toLowerCase() === subCurrentStatus?.name.toLowerCase(),
          );
          if (!mapped) {
            mapped = destStatuses.find((s) => s.type === subCurrentStatus?.type);
          }
          if (!mapped && defaultOpen) {
            mapped = defaultOpen;
          }

          const finalSubStatus = mapped ?? targetStatus;
          const subCompletedAt =
            finalSubStatus.type === 'DONE'
              ? sub.completedAt ?? new Date()
              : null;

          subtaskUpdates.push({
            id: sub.id,
            listId: targetListId,
            statusId: finalSubStatus.id,
            completedAt: subCompletedAt,
          });
        }
      }
    }

    await this.tasksRepo.moveTaskWithSubtasks(
      workspaceId,
      taskId,
      {
        listId: targetListId,
        statusId: targetStatus.id,
        position,
        completedAt,
      },
      subtaskUpdates,
    );

    this.eventEmitter.emit(
      'task.moved',
      new TaskMovedEvent({
        workspaceId,
        taskId,
        actorId: currentMember.userId,
        sourceListId: task.listId,
        targetListId,
        sourceStatusId: task.statusId,
        targetStatusId: targetStatus.id,
        subtaskIds,
      }),
    );

    const hydrated = await this.tasksRepo.findById(workspaceId, taskId, false);
    if (!hydrated) {
      throw new NotFoundException('Task not found');
    }
    return hydrated;
  }

  async findAll(
    workspaceId: string,
    currentMember: RequestWorkspaceMember,
    query: TaskQueryDto,
  ): Promise<PaginatedTasksResponseDto> {
    const sort = query.sort ?? 'createdAt';
    const order = query.order ?? 'desc';
    const limit = query.limit ?? 20;

    if (sort === 'position') {
      if (!query.listId || query.listId.length !== 1) {
        throw new BadRequestException(
          'sort=position is only valid when exactly one listId is provided',
        );
      }
    }

    if (query.deleted && !hasAtLeast(currentMember.role, WorkspaceRole.ADMIN)) {
      throw new ForbiddenException(
        'Only administrators can view soft-deleted tasks',
      );
    }

    const where: any = {};

    // Deleted filter
    if (query.deleted) {
      where.deletedAt = { not: null };
    } else {
      where.deletedAt = null;
    }

    // List filter: without listId filter, exclude tasks in archived lists
    if (query.listId && query.listId.length > 0) {
      where.listId = { in: query.listId };
    } else {
      // Relation filter exception permitted by docs/conventions
      where.list = { archivedAt: null };
    }

    // Status filter
    if (query.statusId && query.statusId.length > 0) {
      where.statusId = { in: query.statusId };
    }

    // Priority filter
    if (query.priority && query.priority.length > 0) {
      where.priority = { in: query.priority };
    }

    // Completed filter
    if (query.completed !== undefined) {
      where.completedAt = query.completed ? { not: null } : null;
    }

    // Overdue filter
    if (query.overdue) {
      where.dueDate = { lt: new Date() };
      where.completedAt = null;
    }

    // Date range filters
    if (query.dueBefore) {
      where.dueDate = {
        ...where.dueDate,
        lte: new Date(query.dueBefore),
      };
    }
    if (query.dueAfter) {
      where.dueDate = {
        ...where.dueDate,
        gte: new Date(query.dueAfter),
      };
    }

    // Parent & subtasks filter
    if (query.parentId) {
      where.parentId = query.parentId;
    } else if (!query.includeSubtasks) {
      where.parentId = null;
    }

    // Assignees & unassigned filter
    if (query.unassigned) {
      where.assignees = { none: {} };
    } else if (query.assigneeId && query.assigneeId.length > 0) {
      const resolvedAssignees = query.assigneeId.map((id: string) =>
        id === 'me' ? currentMember.userId : id,
      );
      where.assignees = { some: { userId: { in: resolvedAssignees } } };
    }

    // CreatedBy filter
    if (query.createdBy) {
      const creatorId =
        query.createdBy === 'me' ? currentMember.userId : query.createdBy;
      where.creatorId = creatorId;
    }

    // Tag filter
    if (query.tagId && query.tagId.length > 0) {
      if (query.tagMode === 'all') {
        where.AND = [
          ...(where.AND ?? []),
          ...query.tagId.map((tid: string) => ({
            tags: { some: { tagId: tid } },
          })),
        ];
      } else {
        where.tags = { some: { tagId: { in: query.tagId } } };
      }
    }

    // Full-text search
    if (query.q && query.q.trim()) {
      const matchedIds = await this.tasksRepo.searchTaskIds(
        workspaceId,
        query.q,
      );
      if (matchedIds.length === 0) {
        return { items: [], nextCursor: null };
      }
      where.id = { in: matchedIds };
    }

    // Keyset cursor signature
    const signatureParts = [
      workspaceId,
      sort,
      order,
      JSON.stringify(query.listId ?? []),
      JSON.stringify(query.statusId ?? []),
      JSON.stringify(query.priority ?? []),
      JSON.stringify(query.assigneeId ?? []),
      JSON.stringify(query.tagId ?? []),
      query.tagMode ?? 'any',
      query.unassigned ? '1' : '0',
      query.createdBy ?? '',
      query.completed !== undefined ? String(query.completed) : '',
      query.overdue ? '1' : '0',
      query.dueBefore ?? '',
      query.dueAfter ?? '',
      query.parentId ?? '',
      query.includeSubtasks ? '1' : '0',
      query.deleted ? '1' : '0',
      query.q?.trim() ?? '',
    ];
    const signature = Buffer.from(signatureParts.join('|')).toString('base64');

    if (query.cursor) {
      const decoded = decodeGenericCursor(query.cursor, signature);
      const cursorKey = decoded.key;
      const cursorId = decoded.id;

      if (sort === 'priority') {
        const PRIORITY_ORDER = [
          'NONE',
          'LOW',
          'NORMAL',
          'HIGH',
          'URGENT',
        ] as const;
        const curIdx = PRIORITY_ORDER.indexOf(cursorKey as any);
        if (curIdx === -1) {
          throw new BadRequestException('Invalid priority cursor key');
        }

        if (order === 'asc') {
          const higher = PRIORITY_ORDER.slice(curIdx + 1);
          where.AND = [
            ...(where.AND ?? []),
            {
              OR: [
                ...(higher.length > 0 ? [{ priority: { in: higher } }] : []),
                { priority: cursorKey, id: { gt: cursorId } },
              ],
            },
          ];
        } else {
          const lower = PRIORITY_ORDER.slice(0, curIdx);
          where.AND = [
            ...(where.AND ?? []),
            {
              OR: [
                ...(lower.length > 0 ? [{ priority: { in: lower } }] : []),
                { priority: cursorKey, id: { lt: cursorId } },
              ],
            },
          ];
        }
      } else if (sort === 'dueDate') {
        if (cursorKey !== null) {
          const d = new Date(cursorKey);
          if (order === 'asc') {
            where.AND = [
              ...(where.AND ?? []),
              {
                OR: [
                  { dueDate: { gt: d } },
                  { dueDate: d, id: { gt: cursorId } },
                  { dueDate: null },
                ],
              },
            ];
          } else {
            where.AND = [
              ...(where.AND ?? []),
              {
                OR: [
                  { dueDate: { lt: d, not: null } },
                  { dueDate: d, id: { lt: cursorId } },
                  { dueDate: null },
                ],
              },
            ];
          }
        } else {
          if (order === 'asc') {
            where.AND = [
              ...(where.AND ?? []),
              { dueDate: null, id: { gt: cursorId } },
            ];
          } else {
            where.AND = [
              ...(where.AND ?? []),
              { dueDate: null, id: { lt: cursorId } },
            ];
          }
        }
      } else {
        const compareVal =
          sort === 'createdAt' || sort === 'updatedAt'
            ? new Date(cursorKey as string)
            : cursorKey;

        if (order === 'asc') {
          where.AND = [
            ...(where.AND ?? []),
            {
              OR: [
                { [sort]: { gt: compareVal } },
                { [sort]: compareVal, id: { gt: cursorId } },
              ],
            },
          ];
        } else {
          where.AND = [
            ...(where.AND ?? []),
            {
              OR: [
                { [sort]: { lt: compareVal } },
                { [sort]: compareVal, id: { lt: cursorId } },
              ],
            },
          ];
        }
      }
    }

    // Order By
    const orderBy: any[] =
      sort === 'dueDate'
        ? [{ dueDate: { sort: order, nulls: 'last' } }, { id: order }]
        : [{ [sort]: order }, { id: order }];

    const rows = await this.tasksRepo.findMany(
      workspaceId,
      where,
      orderBy,
      limit + 1,
    );

    let nextCursor: string | null = null;
    let sliced = rows;
    if (rows.length > limit) {
      sliced = rows.slice(0, limit);
      const last = sliced[sliced.length - 1];
      const key =
        sort === 'dueDate'
          ? last.dueDate
          : sort === 'priority'
            ? last.priority
            : last[sort as keyof typeof last];

      nextCursor = encodeGenericCursor({
        key: key as any,
        id: last.id,
        signature,
      });
    }

    const items = await this.tasksRepo.hydrateTasks(sliced, false);
    return { items, nextCursor };
  }

  async getSubtasks(
    workspaceId: string,
    parentTaskId: string,
  ): Promise<TaskResponseDto[]> {
    const parent = await this.tasksRepo.findRawById(workspaceId, parentTaskId);
    if (!parent || parent.deletedAt !== null) {
      throw new NotFoundException('Parent task not found');
    }

    const subtasks = await this.tasksRepo.getSubtasksOfTask(
      workspaceId,
      parentTaskId,
    );
    return this.tasksRepo.hydrateTasks(subtasks, false);
  }
}
