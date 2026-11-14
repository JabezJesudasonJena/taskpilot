export interface HierarchyNodeEventPayload {
  workspaceId: string;
  id: string;
}

export interface HierarchyListMovedEventPayload {
  workspaceId: string;
  listId: string;
  sourceSpaceId: string;
  sourceFolderId: string | null;
  destinationSpaceId: string;
  destinationFolderId: string | null;
}

export interface HierarchyStatusEventPayload {
  workspaceId: string;
  listId: string;
  statusId: string;
}

export class HierarchySpaceCreatedEvent {
  constructor(public readonly payload: HierarchyNodeEventPayload) {}
}

export class HierarchySpaceUpdatedEvent {
  constructor(public readonly payload: HierarchyNodeEventPayload) {}
}

export class HierarchySpaceArchivedEvent {
  constructor(public readonly payload: HierarchyNodeEventPayload) {}
}

export class HierarchySpaceUnarchivedEvent {
  constructor(public readonly payload: HierarchyNodeEventPayload) {}
}

export class HierarchySpaceDeletedEvent {
  constructor(public readonly payload: HierarchyNodeEventPayload) {}
}

export class HierarchyFolderCreatedEvent {
  constructor(public readonly payload: HierarchyNodeEventPayload) {}
}

export class HierarchyFolderUpdatedEvent {
  constructor(public readonly payload: HierarchyNodeEventPayload) {}
}

export class HierarchyFolderArchivedEvent {
  constructor(public readonly payload: HierarchyNodeEventPayload) {}
}

export class HierarchyFolderUnarchivedEvent {
  constructor(public readonly payload: HierarchyNodeEventPayload) {}
}

export class HierarchyFolderDeletedEvent {
  constructor(public readonly payload: HierarchyNodeEventPayload) {}
}

export class HierarchyListCreatedEvent {
  constructor(public readonly payload: HierarchyNodeEventPayload) {}
}

export class HierarchyListUpdatedEvent {
  constructor(public readonly payload: HierarchyNodeEventPayload) {}
}

export class HierarchyListArchivedEvent {
  constructor(public readonly payload: HierarchyNodeEventPayload) {}
}

export class HierarchyListUnarchivedEvent {
  constructor(public readonly payload: HierarchyNodeEventPayload) {}
}

export class HierarchyListDeletedEvent {
  constructor(public readonly payload: HierarchyNodeEventPayload) {}
}

export class HierarchyListMovedEvent {
  constructor(public readonly payload: HierarchyListMovedEventPayload) {}
}

export class HierarchyStatusCreatedEvent {
  constructor(public readonly payload: HierarchyStatusEventPayload) {}
}

export class HierarchyStatusUpdatedEvent {
  constructor(public readonly payload: HierarchyStatusEventPayload) {}
}

export class HierarchyStatusDeletedEvent {
  constructor(public readonly payload: HierarchyStatusEventPayload) {}
}
