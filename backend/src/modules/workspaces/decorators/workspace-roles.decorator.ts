import { SetMetadata } from '@nestjs/common';
import type { WorkspaceRole } from '@prisma/client';

export const WORKSPACE_ROLES_KEY = 'workspaceRoles';
export const WorkspaceRoles = (minRole: WorkspaceRole) =>
  SetMetadata(WORKSPACE_ROLES_KEY, minRole);
