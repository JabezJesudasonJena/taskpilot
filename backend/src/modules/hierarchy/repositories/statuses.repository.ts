import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { Status, StatusType } from '@prisma/client';

@Injectable()
export class StatusesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(
    workspaceId: string,
    listId: string,
    statusId: string,
  ): Promise<Status | null> {
    return this.prisma.status.findFirst({
      where: {
        id: statusId,
        listId,
        workspaceId,
      },
    });
  }

  async findByList(
    workspaceId: string,
    listId: string,
  ): Promise<Status[]> {
    return this.prisma.status.findMany({
      where: {
        workspaceId,
        listId,
      },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  async create(data: {
    workspaceId: string;
    listId: string;
    name: string;
    type: StatusType;
    position: number;
    color?: string;
  }): Promise<Status> {
    return this.prisma.status.create({
      data: {
        workspaceId: data.workspaceId,
        listId: data.listId,
        name: data.name,
        type: data.type,
        position: data.position,
        color: data.color,
      },
    });
  }

  async update(
    workspaceId: string,
    listId: string,
    statusId: string,
    data: {
      name?: string;
      color?: string | null;
      type?: StatusType;
    },
  ): Promise<Status> {
    return this.prisma.status.update({
      where: {
        id: statusId,
        listId,
        workspaceId,
      },
      data,
    });
  }

  async reorderContiguously(
    workspaceId: string,
    listId: string,
    orderedStatusIds: string[],
  ): Promise<Status[]> {
    return this.prisma.$transaction(async (tx) => {
      // Step 1: Temporarily shift positions to negative to avoid unique/conflict issues if any
      for (let i = 0; i < orderedStatusIds.length; i++) {
        await tx.status.update({
          where: {
            id: orderedStatusIds[i],
            listId,
            workspaceId,
          },
          data: {
            position: -(i + 1),
          },
        });
      }

      // Step 2: Assign contiguous positive 0-based positions
      const results: Status[] = [];
      for (let i = 0; i < orderedStatusIds.length; i++) {
        const updated = await tx.status.update({
          where: {
            id: orderedStatusIds[i],
            listId,
            workspaceId,
          },
          data: {
            position: i,
          },
        });
        results.push(updated);
      }

      return results;
    });
  }

  async deleteAndRenumber(
    workspaceId: string,
    listId: string,
    statusId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.status.delete({
        where: {
          id: statusId,
          listId,
          workspaceId,
        },
      });

      const remaining = await tx.status.findMany({
        where: {
          workspaceId,
          listId,
        },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      });

      for (let i = 0; i < remaining.length; i++) {
        await tx.status.update({
          where: {
            id: remaining[i].id,
            listId,
            workspaceId,
          },
          data: {
            position: i,
          },
        });
      }
    });
  }
}
