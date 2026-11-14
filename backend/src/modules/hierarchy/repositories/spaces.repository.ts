import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { SIBLING_ORDER_BY } from '../../../common/index.js';
import type { Space } from '@prisma/client';

@Injectable()
export class SpacesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    workspaceId: string;
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    position: string;
  }): Promise<Space> {
    return this.prisma.space.create({
      data: {
        workspaceId: data.workspaceId,
        name: data.name,
        description: data.description,
        color: data.color,
        icon: data.icon,
        position: data.position,
      },
    });
  }

  async findById(
    workspaceId: string,
    spaceId: string,
  ): Promise<Space | null> {
    return this.prisma.space.findFirst({
      where: {
        id: spaceId,
        workspaceId,
      },
    });
  }

  async findAll(
    workspaceId: string,
    includeArchived = false,
  ): Promise<Space[]> {
    return this.prisma.space.findMany({
      where: {
        workspaceId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: SIBLING_ORDER_BY,
    });
  }

  async findLastSibling(workspaceId: string): Promise<Space | null> {
    return this.prisma.space.findFirst({
      where: { workspaceId },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
    });
  }

  async findSiblingBefore(
    workspaceId: string,
    position: string,
  ): Promise<Space | null> {
    return this.prisma.space.findFirst({
      where: {
        workspaceId,
        position: { lt: position },
      },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
    });
  }

  async findSiblingAfter(
    workspaceId: string,
    position: string,
  ): Promise<Space | null> {
    return this.prisma.space.findFirst({
      where: {
        workspaceId,
        position: { gt: position },
      },
      orderBy: SIBLING_ORDER_BY,
    });
  }

  async countBetween(
    workspaceId: string,
    prevPosition: string,
    nextPosition: string,
    excludeId?: string,
  ): Promise<number> {
    return this.prisma.space.count({
      where: {
        workspaceId,
        position: { gt: prevPosition, lt: nextPosition },
        archivedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async update(
    workspaceId: string,
    spaceId: string,
    data: {
      name?: string;
      description?: string | null;
      color?: string | null;
      icon?: string | null;
      position?: string;
    },
  ): Promise<Space> {
    return this.prisma.space.update({
      where: {
        id: spaceId,
        workspaceId,
      },
      data,
    });
  }

  async archiveCascade(
    workspaceId: string,
    spaceId: string,
    archivedAt: Date,
  ): Promise<Space> {
    return this.prisma.$transaction(async (tx) => {
      const space = await tx.space.update({
        where: { id: spaceId, workspaceId },
        data: { archivedAt },
      });

      // Archive unarchived folders
      await tx.folder.updateMany({
        where: { spaceId, workspaceId, archivedAt: null },
        data: { archivedAt },
      });

      // Archive unarchived lists
      await tx.list.updateMany({
        where: { spaceId, workspaceId, archivedAt: null },
        data: { archivedAt },
      });

      return space;
    });
  }

  async unarchiveCascade(
    workspaceId: string,
    spaceId: string,
    targetArchivedAt: Date,
  ): Promise<Space> {
    return this.prisma.$transaction(async (tx) => {
      const space = await tx.space.update({
        where: { id: spaceId, workspaceId },
        data: { archivedAt: null },
      });

      // Unarchive folders that were archived at the exact same timestamp
      await tx.folder.updateMany({
        where: { spaceId, workspaceId, archivedAt: targetArchivedAt },
        data: { archivedAt: null },
      });

      // Unarchive lists that were archived at the exact same timestamp
      await tx.list.updateMany({
        where: { spaceId, workspaceId, archivedAt: targetArchivedAt },
        data: { archivedAt: null },
      });

      return space;
    });
  }

  async delete(workspaceId: string, spaceId: string): Promise<void> {
    await this.prisma.space.delete({
      where: {
        id: spaceId,
        workspaceId,
      },
    });
  }
}
