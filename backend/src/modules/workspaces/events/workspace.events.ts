import type { WorkspaceRole } from '@prisma/client';

export class WorkspaceCreatedEvent {
  constructor(
    public readonly workspaceId: string,
    public readonly userId: string,
    public readonly name: string,
    public readonly slug: string,
  ) {}
}

export class WorkspaceMemberAddedEvent {
  constructor(
    public readonly workspaceId: string,
    public readonly userId: string,
    public readonly role: WorkspaceRole,
  ) {}
}

export class WorkspaceMemberRemovedEvent {
  constructor(
    public readonly workspaceId: string,
    public readonly userId: string,
    public readonly memberId: string,
  ) {}
}

export class WorkspaceMemberRoleChangedEvent {
  constructor(
    public readonly workspaceId: string,
    public readonly userId: string,
    public readonly memberId: string,
    public readonly oldRole: WorkspaceRole,
    public readonly newRole: WorkspaceRole,
  ) {}
}

export class WorkspaceOwnershipTransferredEvent {
  constructor(
    public readonly workspaceId: string,
    public readonly previousOwnerId: string,
    public readonly newOwnerId: string,
  ) {}
}

export class WorkspaceInviteCreatedEvent {
  constructor(
    public readonly workspaceId: string,
    public readonly inviteId: string,
    public readonly email: string,
    public readonly role: WorkspaceRole,
    public readonly invitedById: string | null,
  ) {}
}

export class WorkspaceInviteAcceptedEvent {
  constructor(
    public readonly workspaceId: string,
    public readonly inviteId: string,
    public readonly userId: string,
    public readonly role: WorkspaceRole,
  ) {}
}
