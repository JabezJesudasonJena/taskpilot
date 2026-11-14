import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { SIBLING_ORDER_BY } from '../../../common/index.js';
import { DEFAULT_STATUSES } from '../constants/default-statuses.constant.js';
import type { List, Status } from '@prisma/client';

export interface ListWithStatuses extends List {
  statuses: Status[];
}

@Injectable()
export class ListsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWithDefaultStatuses(data: {
    workspaceId: string;
    spaceId: string;
    folderId?: string | null;
    name: string;
    description?: string;
    color?: string;
    position: string;
  }): Promise<ListWithStatuses> {
    return this.prisma.$transaction(async (tx) => {
      const list = await tx.list.create({
        data: {
          workspaceId: data.workspaceId,
          spaceId: data.spaceId,
          folderId: data.folderId ?? null,
          name: data.name,
          description: data.description,
          color: data.color,
          position: data.position,
        },
      });

      const statuses: Status[] = [];
      for (const def of DEFAULT_STATUSES) {
        const s = await tx.status.create({
          data: {
            workspaceId: data.workspaceId,
            listId: list.id,
            name: def.name,
            type: def.type,
            position: def.position,
            color: def.color,
          },
        });
        statuses.push(s);
      }

      return {
        ...list,
        statuses,
      };
    });
  }

  async findById(
    workspaceId: string,
    listId: string,
  ): Promise<List | null> {
    return this.prisma.list.findFirst({
      where: {
        id: listId,
        workspaceId,
      },
    });
  }

  async findBySpace(
    workspaceId: string,
    spaceId: string,
    options?: { folderId?: string; includeArchived?: boolean },
  ): Promise<List[]> {
    return this.prisma.list.findMany({
      where: {
        workspaceId,
        spaceId,
        ...(options?.folderId !== undefined
          ? { folderId: options.folderId }
          : {}),
        ...(options?.includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: SIBLING_ORDER_BY,
    });
  }

  async findByFolder(
    workspaceId: string,
    folderId: string,
    includeArchived = false,
  ): Promise<List[]> {
    return this.prisma.list.findMany({
      where: {
        workspaceId,
        folderId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: SIBLING_ORDER_BY,
    });
  }

  async findAllInWorkspace(
    workspaceId: string,
    includeArchived = false,
  ): Promise<List[]> {
    return this.prisma.list.findMany({
      where: {
        workspaceId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: SIBLING_ORDER_BY,
    });
  }

  async findLastSibling(
    workspaceId: string,
    spaceId: string,
    folderId: string | null,
  ): Promise<List | null> {
    return this.prisma.list.findFirst({
      where: {
        workspaceId,
        spaceId,
        folderId,
      },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
    });
  }

  async findSiblingBefore(
    workspaceId: string,
    spaceId: string,
    folderId: string | null,
    position: string,
  ): Promise<List | null> {
    return this.prisma.list.findFirst({
      where: {
        workspaceId,
        spaceId,
        folderId,
        position: { lt: position },
      },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
    });
  }

  async findSiblingAfter(
    workspaceId: string,
    spaceId: string,
    folderId: string | null,
    position: string,
  ): Promise<List | null> {
    return this.prisma.list.findFirst({
      where: {
        workspaceId,
        spaceId,
        folderId,
        position: { gt: position },
      },
      orderBy: SIBLING_ORDER_BY,
    });
  }

  async countBetween(
    workspaceId: string,
    spaceId: string,
    folderId: string | null,
    prevPosition: string,
    nextPosition: string,
    excludeId?: string,
  ): Promise<number> {
    return this.prisma.list.count({
      where: {
        workspaceId,
        spaceId,
        folderId,
        position: { gt: prevPosition, lt: nextPosition },
        archivedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async update(
    workspaceId: string,
    listId: string,
    data: {
      name?: string;
      description?: string | null;
      color?: string | null;
      spaceId?: string;
      folderId?: string | null;
      position?: string;
    },
  ): Promise<List> {
    return this.prisma.list.update({
      where: {
        id: listId,
        workspaceId,
      },
      data,
    });
  }

  async archive(
    workspaceId: string,
    listId: string,
    archivedAt: Date,
  ): Promise<List> {
    return this.prisma.list.update({
      where: {
        id: listId,
        workspaceId,
      },
      data: { archivedAt },
    });
  }

  async unarchive(workspaceId: string, listId: string): Promise<List> {
    return this.prisma.list.update({
      where: {
        id: listId,
        workspaceId,
      },
      data: { archivedAt: null },
    });
  }

  async delete(workspaceId: string, listId: string): Promise<void> {
    await this.prisma.list.delete({
      where: {
        id: listId,
        workspaceId,
      },
    });
  }
}
