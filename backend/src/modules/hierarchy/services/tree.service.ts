import { Injectable } from '@nestjs/common';
import { SpacesRepository } from '../repositories/spaces.repository.js';
import { FoldersRepository } from '../repositories/folders.repository.js';
import { ListsRepository } from '../repositories/lists.repository.js';
import type {
  HierarchyTreeResponseDto,
  TreeSpaceDto,
  TreeFolderDto,
  TreeListDto,
} from '../dto/tree/tree-response.dto.js';

@Injectable()
export class TreeService {
  constructor(
    private readonly spacesRepo: SpacesRepository,
    private readonly foldersRepo: FoldersRepository,
    private readonly listsRepo: ListsRepository,
  ) {}

  async getTree(
    workspaceId: string,
    includeArchived = false,
  ): Promise<HierarchyTreeResponseDto> {
    // Exactly 3 queries to avoid N+1 problem
    const [spaces, folders, lists] = await Promise.all([
      this.spacesRepo.findAll(workspaceId, includeArchived),
      this.foldersRepo.findAllInWorkspace(workspaceId, includeArchived),
      this.listsRepo.findAllInWorkspace(workspaceId, includeArchived),
    ]);

    // Map lists to DTO
    const listDtos: TreeListDto[] = lists.map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
      position: l.position,
      folderId: l.folderId,
      archivedAt: l.archivedAt,
    }));

    // Group lists by folder and space root
    const listsByFolder = new Map<string, TreeListDto[]>();
    const rootListsBySpace = new Map<string, TreeListDto[]>();

    for (const l of listDtos) {
      if (l.folderId) {
        if (!listsByFolder.has(l.folderId)) {
          listsByFolder.set(l.folderId, []);
        }
        listsByFolder.get(l.folderId)!.push(l);
      }
    }

    // Map original lists to space root
    for (let i = 0; i < lists.length; i++) {
      const original = lists[i];
      if (!original.folderId) {
        if (!rootListsBySpace.has(original.spaceId)) {
          rootListsBySpace.set(original.spaceId, []);
        }
        rootListsBySpace.get(original.spaceId)!.push(listDtos[i]);
      }
    }

    // Map folders to DTO and attach nested lists
    const folderDtos: TreeFolderDto[] = folders.map((f) => ({
      id: f.id,
      spaceId: f.spaceId,
      name: f.name,
      color: f.color,
      position: f.position,
      archivedAt: f.archivedAt,
      lists: listsByFolder.get(f.id) || [],
    }));

    const foldersBySpace = new Map<string, TreeFolderDto[]>();
    for (const f of folderDtos) {
      if (!foldersBySpace.has(f.spaceId)) {
        foldersBySpace.set(f.spaceId, []);
      }
      foldersBySpace.get(f.spaceId)!.push(f);
    }

    // Map spaces to DTO and attach root lists & folders
    const spaceDtos: TreeSpaceDto[] = spaces.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      color: s.color,
      icon: s.icon,
      position: s.position,
      archivedAt: s.archivedAt,
      lists: rootListsBySpace.get(s.id) || [],
      folders: foldersBySpace.get(s.id) || [],
    }));

    return { spaces: spaceDtos };
  }
}
