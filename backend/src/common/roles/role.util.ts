import { WorkspaceRole } from '@prisma/client';

export const ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
  [WorkspaceRole.OWNER]: 4,
  [WorkspaceRole.ADMIN]: 3,
  [WorkspaceRole.MEMBER]: 2,
  [WorkspaceRole.GUEST]: 1,
};

export function hasAtLeast(
  role: WorkspaceRole,
  minRole: WorkspaceRole,
): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minRole];
}

export function canChangeRole(
  actorRole: WorkspaceRole,
  currentRole: WorkspaceRole,
  newRole: WorkspaceRole,
): boolean {
  // Nobody can promote to OWNER via role change (must use /transfer-ownership)
  if (newRole === WorkspaceRole.OWNER) {
    return false;
  }

  // Nobody can change an OWNER's role via role change
  if (currentRole === WorkspaceRole.OWNER) {
    return false;
  }

  if (actorRole === WorkspaceRole.OWNER) {
    return true;
  }

  if (actorRole === WorkspaceRole.ADMIN) {
    // ADMIN cannot modify OWNER or another ADMIN
    if (currentRole === WorkspaceRole.ADMIN) {
      return false;
    }
    // ADMIN cannot promote anyone to ADMIN
    if (newRole === WorkspaceRole.ADMIN) {
      return false;
    }
    // ADMIN can change between MEMBER and GUEST
    return true;
  }

  return false;
}

export function canRemoveMember(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
  isSelf: boolean,
): boolean {
  if (isSelf) {
    // OWNER cannot leave (service handles throwing 409)
    return targetRole !== WorkspaceRole.OWNER;
  }

  if (actorRole === WorkspaceRole.OWNER) {
    return true;
  }

  if (actorRole === WorkspaceRole.ADMIN) {
    // ADMIN cannot remove OWNER or another ADMIN
    return targetRole !== WorkspaceRole.OWNER && targetRole !== WorkspaceRole.ADMIN;
  }

  return false;
}

export function canInviteRole(
  actorRole: WorkspaceRole,
  inviteRole: WorkspaceRole,
): boolean {
  // Nobody can invite an OWNER
  if (inviteRole === WorkspaceRole.OWNER) {
    return false;
  }

  if (actorRole === WorkspaceRole.OWNER) {
    return true;
  }

  if (actorRole === WorkspaceRole.ADMIN) {
    // ADMIN cannot invite another ADMIN
    return inviteRole !== WorkspaceRole.ADMIN;
  }

  return false;
}
