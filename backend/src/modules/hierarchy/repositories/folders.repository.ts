import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { SIBLING_ORDER_BY } from '../../../common/index.js';
import type { Folder } from '@prisma/client';

@Injectable()
export class FoldersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    workspaceId: string;
    spaceId: string;
    name: string;
    color?: string;
    position: string;
  }): Promise<Folder> {
    return this.prisma.folder.create({
      data: {
        workspaceId: data.workspaceId,
        spaceId: data.spaceId,
        name: data.name,
        color: data.color,
        position: data.position,
      },
    });
  }

  async findById(
    workspaceId: string,
    folderId: string,
  ): Promise<Folder | null> {
    return this.prisma.folder.findFirst({
      where: {
        id: folderId,
        workspaceId,
      },
    });
  }

  async findBySpace(
    workspaceId: string,
    spaceId: string,
    includeArchived = false,
  ): Promise<Folder[]> {
    return this.prisma.folder.findMany({
      where: {
        workspaceId,
        spaceId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: SIBLING_ORDER_BY,
    });
  }

  async findAllInWorkspace(
    workspaceId: string,
    includeArchived = false,
  ): Promise<Folder[]> {
    return this.prisma.folder.findMany({
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
  ): Promise<Folder | null> {
    return this.prisma.folder.findFirst({
      where: { workspaceId, spaceId },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
    });
  }

  async findSiblingBefore(
    workspaceId: string,
    spaceId: string,
    position: string,
  ): Promise<Folder | null> {
    return this.prisma.folder.findFirst({
      where: {
        workspaceId,
        spaceId,
        position: { lt: position },
      },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
    });
  }

  async findSiblingAfter(
    workspaceId: string,
    spaceId: string,
    position: string,
  ): Promise<Folder | null> {
    return this.prisma.folder.findFirst({
      where: {
        workspaceId,
        spaceId,
        position: { gt: position },
      },
      orderBy: SIBLING_ORDER_BY,
    });
  }

  async countBetween(
    workspaceId: string,
    spaceId: string,
    prevPosition: string,
    nextPosition: string,
    excludeId?: string,
  ): Promise<number> {
    return this.prisma.folder.count({
      where: {
        workspaceId,
        spaceId,
        position: { gt: prevPosition, lt: nextPosition },
        archivedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async update(
    workspaceId: string,
    folderId: string,
    data: {
      name?: string;
      color?: string | null;
      position?: string;
    },
  ): Promise<Folder> {
    return this.prisma.folder.update({
      where: {
        id: folderId,
        workspaceId,
      },
      data,
    });
  }

  async archiveCascade(
    workspaceId: string,
    folderId: string,
    archivedAt: Date,
  ): Promise<Folder> {
    return this.prisma.$transaction(async (tx) => {
      const folder = await tx.folder.update({
        where: { id: folderId, workspaceId },
        data: { archivedAt },
      });

      // Archive unarchived lists in this folder
      await tx.list.updateMany({
        where: { folderId, workspaceId, archivedAt: null },
        data: { archivedAt },
      });

      return folder;
    });
  }

  async unarchiveCascade(
    workspaceId: string,
    folderId: string,
    targetArchivedAt: Date,
  ): Promise<Folder> {
    return this.prisma.$transaction(async (tx) => {
      const folder = await tx.folder.update({
        where: { id: folderId, workspaceId },
        data: { archivedAt: null },
      });

      // Unarchive lists that were archived with the folder at the same timestamp
      await tx.list.updateMany({
        where: { folderId, workspaceId, archivedAt: targetArchivedAt },
        data: { archivedAt: null },
      });

      return folder;
    });
  }

  async delete(workspaceId: string, folderId: string): Promise<void> {
    await this.prisma.folder.delete({
      where: {
        id: folderId,
        workspaceId,
      },
    });
  }
}
