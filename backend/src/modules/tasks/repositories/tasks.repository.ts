import { Injectable } from '@nestjs/common';
import {
  type Task,
  type TaskPriority,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { TaskResponseDto, TaskTagItemDto } from '../dto/tasks/task-response.dto.js';

export interface HydratedTaskData extends Task {
  assigneeIds: string[];
  tags: TaskTagItemDto[];
  subtaskCount: number;
  completedSubtaskCount: number;
}

const SIBLING_ORDER_BY = [{ position: 'asc' as const }, { id: 'asc' as const }];

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createTaskWithRelations(data: {
    workspaceId: string;
    listId: string;
    statusId: string;
    parentId?: string | null;
    creatorId?: string | null;
    title: string;
    description?: string | null;
    priority: TaskPriority;
    startDate?: Date | null;
    dueDate?: Date | null;
    completedAt?: Date | null;
    position: string;
    assigneeIds?: string[];
    tagIds?: string[];
  }): Promise<Task> {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          workspaceId: data.workspaceId,
          listId: data.listId,
          statusId: data.statusId,
          parentId: data.parentId ?? null,
          creatorId: data.creatorId ?? null,
          title: data.title,
          description: data.description ?? null,
          priority: data.priority,
          startDate: data.startDate ?? null,
          dueDate: data.dueDate ?? null,
          completedAt: data.completedAt ?? null,
          position: data.position,
        },
      });

      if (data.assigneeIds && data.assigneeIds.length > 0) {
        await tx.taskAssignee.createMany({
          data: data.assigneeIds.map((userId) => ({
            taskId: task.id,
            userId,
          })),
        });
      }

      if (data.tagIds && data.tagIds.length > 0) {
        await tx.taskTag.createMany({
          data: data.tagIds.map((tagId) => ({
            taskId: task.id,
            tagId,
          })),
        });
      }

      return task;
    });
  }

  async findRawById(
    workspaceId: string,
    taskId: string,
  ): Promise<Task | null> {
    return this.prisma.task.findFirst({
      where: {
        id: taskId,
        workspaceId,
      },
    });
  }

  async findById(
    workspaceId: string,
    taskId: string,
    includeDeleted = false,
  ): Promise<TaskResponseDto | null> {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        workspaceId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
    });

    if (!task) {
      return null;
    }

    const hydrated = await this.hydrateTasks([task], true);
    return hydrated[0] ?? null;
  }

  async findSiblingGroupLast(
    workspaceId: string,
    listId: string,
    statusId: string,
    parentId: string | null,
  ): Promise<Task | null> {
    if (parentId) {
      return this.prisma.task.findFirst({
        where: {
          workspaceId,
          parentId,
          deletedAt: null,
        },
        orderBy: [{ position: 'desc' }, { id: 'desc' }],
      });
    }

    return this.prisma.task.findFirst({
      where: {
        workspaceId,
        listId,
        statusId,
        parentId: null,
        deletedAt: null,
      },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
    });
  }

  async findSiblingBefore(
    workspaceId: string,
    listId: string,
    statusId: string,
    parentId: string | null,
    position: string,
  ): Promise<Task | null> {
    if (parentId) {
      return this.prisma.task.findFirst({
        where: {
          workspaceId,
          parentId,
          position: { lt: position },
          deletedAt: null,
        },
        orderBy: [{ position: 'desc' }, { id: 'desc' }],
      });
    }

    return this.prisma.task.findFirst({
      where: {
        workspaceId,
        listId,
        statusId,
        parentId: null,
        position: { lt: position },
        deletedAt: null,
      },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
    });
  }

  async findSiblingAfter(
    workspaceId: string,
    listId: string,
    statusId: string,
    parentId: string | null,
    position: string,
  ): Promise<Task | null> {
    if (parentId) {
      return this.prisma.task.findFirst({
        where: {
          workspaceId,
          parentId,
          position: { gt: position },
          deletedAt: null,
        },
        orderBy: SIBLING_ORDER_BY,
      });
    }

    return this.prisma.task.findFirst({
      where: {
        workspaceId,
        listId,
        statusId,
        parentId: null,
        position: { gt: position },
        deletedAt: null,
      },
      orderBy: SIBLING_ORDER_BY,
    });
  }

  async countBetween(
    workspaceId: string,
    listId: string,
    statusId: string,
    parentId: string | null,
    prevPosition: string,
    nextPosition: string,
    excludeId?: string,
  ): Promise<number> {
    if (parentId) {
      return this.prisma.task.count({
        where: {
          workspaceId,
          parentId,
          position: { gt: prevPosition, lt: nextPosition },
          deletedAt: null,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      });
    }

    return this.prisma.task.count({
      where: {
        workspaceId,
        listId,
        statusId,
        parentId: null,
        position: { gt: prevPosition, lt: nextPosition },
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async update(
    workspaceId: string,
    taskId: string,
    data: {
      title?: string;
      description?: string | null;
      priority?: TaskPriority;
      startDate?: Date | null;
      dueDate?: Date | null;
      completedAt?: Date | null;
      statusId?: string;
      listId?: string;
      position?: string;
      parentId?: string | null;
    },
  ): Promise<Task> {
    return this.prisma.task.update({
      where: {
        id: taskId,
        workspaceId,
      },
      data,
    });
  }

  async softDelete(
    workspaceId: string,
    taskId: string,
    deletedAt: Date,
  ): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      // Find active subtasks to soft-delete together
      const subtasks = await tx.task.findMany({
        where: {
          workspaceId,
          parentId: taskId,
          deletedAt: null,
        },
        select: { id: true },
      });
      const subtaskIds = subtasks.map((s) => s.id);

      await tx.task.update({
        where: {
          id: taskId,
          workspaceId,
        },
        data: { deletedAt },
      });

      if (subtaskIds.length > 0) {
        await tx.task.updateMany({
          where: {
            workspaceId,
            id: { in: subtaskIds },
          },
          data: { deletedAt },
        });
      }

      return subtaskIds;
    });
  }

  async restore(
    workspaceId: string,
    taskId: string,
    targetDeletedAt: Date,
  ): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      const subtasks = await tx.task.findMany({
        where: {
          workspaceId,
          parentId: taskId,
          deletedAt: targetDeletedAt,
        },
        select: { id: true },
      });
      const subtaskIds = subtasks.map((s) => s.id);

      await tx.task.update({
        where: {
          id: taskId,
          workspaceId,
        },
        data: { deletedAt: null },
      });

      if (subtaskIds.length > 0) {
        await tx.task.updateMany({
          where: {
            workspaceId,
            id: { in: subtaskIds },
          },
          data: { deletedAt: null },
        });
      }

      return subtaskIds;
    });
  }

  async replaceAssignees(
    workspaceId: string,
    taskId: string,
    userIds: string[],
  ): Promise<{ added: string[]; removed: string[]; current: string[] }> {
    return this.prisma.$transaction(async (tx) => {
      const currentRows = await tx.taskAssignee.findMany({
        where: { taskId },
        select: { userId: true },
      });
      const current = currentRows.map((r) => r.userId);

      const toAdd = userIds.filter((u) => !current.includes(u));
      const toRemove = current.filter((u) => !userIds.includes(u));

      if (toRemove.length > 0) {
        await tx.taskAssignee.deleteMany({
          where: {
            taskId,
            userId: { in: toRemove },
          },
        });
      }

      if (toAdd.length > 0) {
        await tx.taskAssignee.createMany({
          data: toAdd.map((userId) => ({
            taskId,
            userId,
          })),
        });
      }

      return { added: toAdd, removed: toRemove, current: userIds };
    });
  }

  async replaceTags(
    workspaceId: string,
    taskId: string,
    tagIds: string[],
  ): Promise<{ added: string[]; removed: string[]; current: string[] }> {
    return this.prisma.$transaction(async (tx) => {
      const currentRows = await tx.taskTag.findMany({
        where: { taskId },
        select: { tagId: true },
      });
      const current = currentRows.map((r) => r.tagId);

      const toAdd = tagIds.filter((t) => !current.includes(t));
      const toRemove = current.filter((t) => !tagIds.includes(t));

      if (toRemove.length > 0) {
        await tx.taskTag.deleteMany({
          where: {
            taskId,
            tagId: { in: toRemove },
          },
        });
      }

      if (toAdd.length > 0) {
        await tx.taskTag.createMany({
          data: toAdd.map((tagId) => ({
            taskId,
            tagId,
          })),
        });
      }

      return { added: toAdd, removed: toRemove, current: tagIds };
    });
  }

  async getSubtasksOfTask(
    workspaceId: string,
    parentId: string,
  ): Promise<Task[]> {
    return this.prisma.task.findMany({
      where: {
        workspaceId,
        parentId,
        deletedAt: null,
      },
      orderBy: SIBLING_ORDER_BY,
    });
  }

  async hydrateTasks(
    tasks: Task[],
    includeDescription = false,
  ): Promise<TaskResponseDto[]> {
    if (tasks.length === 0) {
      return [];
    }

    const taskIds = tasks.map((t) => t.id);

    // Constant 4 batch queries regardless of tasks.length (zero N+1)
    const [assigneeRows, tagRows, subtaskCounts, completedSubtaskCounts] =
      await Promise.all([
        this.prisma.taskAssignee.findMany({
          where: { taskId: { in: taskIds } },
          select: { taskId: true, userId: true },
        }),
        this.prisma.taskTag.findMany({
          where: { taskId: { in: taskIds } },
          select: {
            taskId: true,
            tag: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        }),
        this.prisma.task.groupBy({
          by: ['parentId'],
          where: {
            parentId: { in: taskIds },
            deletedAt: null,
          },
          _count: { id: true },
        }),
        this.prisma.task.groupBy({
          by: ['parentId'],
          where: {
            parentId: { in: taskIds },
            deletedAt: null,
            completedAt: { not: null },
          },
          _count: { id: true },
        }),
      ]);

    // Build maps
    const assigneesByTaskId = new Map<string, string[]>();
    for (const row of assigneeRows) {
      const list = assigneesByTaskId.get(row.taskId) ?? [];
      list.push(row.userId);
      assigneesByTaskId.set(row.taskId, list);
    }

    const tagsByTaskId = new Map<string, TaskTagItemDto[]>();
    for (const row of tagRows) {
      const list = tagsByTaskId.get(row.taskId) ?? [];
      list.push({
        id: row.tag.id,
        name: row.tag.name,
        color: row.tag.color,
      });
      tagsByTaskId.set(row.taskId, list);
    }

    const subtaskCountByParentId = new Map<string, number>();
    for (const row of subtaskCounts) {
      if (row.parentId) {
        subtaskCountByParentId.set(row.parentId, row._count.id);
      }
    }

    const completedSubtaskCountByParentId = new Map<string, number>();
    for (const row of completedSubtaskCounts) {
      if (row.parentId) {
        completedSubtaskCountByParentId.set(row.parentId, row._count.id);
      }
    }

    return tasks.map((t) => ({
      id: t.id,
      workspaceId: t.workspaceId,
      listId: t.listId,
      statusId: t.statusId,
      parentId: t.parentId,
      creatorId: t.creatorId,
      title: t.title,
      ...(includeDescription ? { description: t.description } : {}),
      priority: t.priority,
      startDate: t.startDate,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
      position: t.position,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      deletedAt: t.deletedAt,
      assigneeIds: assigneesByTaskId.get(t.id) ?? [],
      tags: tagsByTaskId.get(t.id) ?? [],
      subtaskCount: t.parentId ? 0 : subtaskCountByParentId.get(t.id) ?? 0,
      completedSubtaskCount: t.parentId
        ? 0
        : completedSubtaskCountByParentId.get(t.id) ?? 0,
    }));
  }
}

