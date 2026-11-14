import { Injectable, NotFoundException } from '@nestjs/common';
import { StatusType, type List, type Status } from '@prisma/client';
import { ListsRepository } from './repositories/lists.repository.js';
import { StatusesRepository } from './repositories/statuses.repository.js';

export interface TenantListInfo {
  id: string;
  spaceId: string;
  folderId: string | null;
  archivedAt: Date | null;
}

export interface ListStatusInfo {
  id: string;
  type: StatusType;
  name: string;
  listId: string;
}

@Injectable()
export class HierarchyService {
  constructor(
    private readonly listsRepo: ListsRepository,
    private readonly statusesRepo: StatusesRepository,
  ) {}

  async getListForTenant(
    workspaceId: string,
    listId: string,
  ): Promise<List> {
    const list = await this.listsRepo.findById(workspaceId, listId);
    if (!list) {
      throw new NotFoundException('List not found');
    }
    return list;
  }

  async getStatusForList(
    workspaceId: string,
    listId: string,
    statusId: string,
  ): Promise<Status> {
    const status = await this.statusesRepo.findById(
      workspaceId,
      listId,
      statusId,
    );
    if (!status) {
      throw new NotFoundException('Status not found');
    }
    return status;
  }

  async getStatusesForList(
    workspaceId: string,
    listId: string,
  ): Promise<Status[]> {
    const list = await this.listsRepo.findById(workspaceId, listId);
    if (!list) {
      throw new NotFoundException('List not found');
    }
    return this.statusesRepo.findByList(workspaceId, listId);
  }

  async getDefaultOpenStatus(
    workspaceId: string,
    listId: string,
  ): Promise<Status> {
    const statuses = await this.statusesRepo.findByList(workspaceId, listId);
    const openStatus = statuses.find((s) => s.type === StatusType.OPEN);
    if (!openStatus) {
      throw new NotFoundException('Default OPEN status not found for list');
    }
    return openStatus;
  }
}
