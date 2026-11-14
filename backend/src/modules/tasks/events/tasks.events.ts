export interface FieldChange {
  field: string;
  from?: any;
  to?: any;
}

export class TaskCreatedEvent {
  constructor(
    public readonly payload: {
      workspaceId: string;
      taskId: string;
      actorId: string;
      listId: string;
      statusId: string;
      parentId?: string | null;
    },
  ) {}
}

export class TaskUpdatedEvent {
  constructor(
    public readonly payload: {
      workspaceId: string;
      taskId: string;
      actorId: string;
      changes: FieldChange[];
    },
  ) {}
}

export class TaskMovedEvent {
  constructor(
    public readonly payload: {
      workspaceId: string;
      taskId: string;
      actorId: string;
      sourceListId: string;
      targetListId: string;
      sourceStatusId: string;
      targetStatusId: string;
      subtaskIds?: string[];
    },
  ) {}
}

export class TaskDeletedEvent {
  constructor(
    public readonly payload: {
      workspaceId: string;
      taskId: string;
      actorId: string;
      deletedAt: Date;
      subtaskIds: string[];
    },
  ) {}
}

export class TaskRestoredEvent {
  constructor(
    public readonly payload: {
      workspaceId: string;
      taskId: string;
      actorId: string;
      subtaskIds: string[];
    },
  ) {}
}

export class TaskAssigneesChangedEvent {
  constructor(
    public readonly payload: {
      workspaceId: string;
      taskId: string;
      actorId: string;
      added: string[];
      removed: string[];
      current: string[];
    },
  ) {}
}

export class TaskTagsChangedEvent {
  constructor(
    public readonly payload: {
      workspaceId: string;
      taskId: string;
      actorId: string;
      added: string[];
      removed: string[];
      current: string[];
    },
  ) {}
}

export class TagCreatedEvent {
  constructor(
    public readonly payload: {
      workspaceId: string;
      tagId: string;
      actorId: string;
      name: string;
    },
  ) {}
}

export class TagUpdatedEvent {
  constructor(
    public readonly payload: {
      workspaceId: string;
      tagId: string;
      actorId: string;
      name?: string;
      color?: string | null;
    },
  ) {}
}

export class TagDeletedEvent {
  constructor(
    public readonly payload: {
      workspaceId: string;
      tagId: string;
      actorId: string;
    },
  ) {}
}
