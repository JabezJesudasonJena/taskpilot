import { Injectable } from '@nestjs/common';
import { type Tag } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class TagsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    workspaceId: string,
    data: { name: string; color?: string | null },
  ): Promise<Tag> {
    return this.prisma.tag.create({
      data: {
        workspaceId,
        name: data.name,
        color: data.color ?? null,
      },
    });
  }

  async findById(workspaceId: string, tagId: string): Promise<Tag | null> {
    return this.prisma.tag.findFirst({
      where: {
        id: tagId,
        workspaceId,
      },
    });
  }

  async findByName(workspaceId: string, name: string): Promise<Tag | null> {
    return this.prisma.tag.findFirst({
      where: {
        workspaceId,
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
    });
  }

  async findByIds(workspaceId: string, tagIds: string[]): Promise<Tag[]> {
    if (tagIds.length === 0) {
      return [];
    }
    return this.prisma.tag.findMany({
      where: {
        workspaceId,
        id: { in: tagIds },
      },
    });
  }

  async findAll(workspaceId: string, limit = 500): Promise<Tag[]> {
    return this.prisma.tag.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' },
      take: limit,
    });
  }

  async count(workspaceId: string): Promise<number> {
    return this.prisma.tag.count({
      where: { workspaceId },
    });
  }

  async update(
    workspaceId: string,
    tagId: string,
    data: { name?: string; color?: string | null },
  ): Promise<Tag> {
    return this.prisma.tag.update({
      where: {
        id: tagId,
        workspaceId,
      },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
      },
    });
  }

  async delete(workspaceId: string, tagId: string): Promise<void> {
    await this.prisma.tag.delete({
      where: {
        id: tagId,
        workspaceId,
      },
    });
  }
}
