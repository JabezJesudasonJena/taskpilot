# Tenancy & Architecture Conventions

This document records the foundational multi-tenancy and authorization conventions for the project. Every feature module (spaces, folders, lists, tasks, comments, etc.) must follow these rules.

## 1. URL Structure
Every tenant-owned route in the system is explicitly nested under:
```
/api/v1/workspaces/:workspaceId/...
```
The workspace context is always explicit in the URL path. Non-tenant routes (e.g. `/auth/*`, `/users/me`, `/invites/accept`, `/health`) are not scoped to a workspace.

## 2. Secure by Default: WorkspaceAccessGuard
- A global `WorkspaceAccessGuard` is registered in `AppModule` immediately after `JwtAuthGuard`.
- For any incoming request containing a `:workspaceId` route param, the guard intercepts the request and verifies that the authenticated user is an active member of that workspace.
- **Information Leak Prevention**: If the workspace does not exist, or the user is not a member, or `workspaceId` is not a valid UUID, the guard returns an identical 404 response:
  ```json
  {
    "statusCode": 404,
    "error": "Not Found",
    "message": "Workspace not found"
  }
  ```
  Existence is never leaked to non-members or unauthenticated callers.

## 3. Request Context: `@CurrentMember()`
- The guard attaches the validated membership to the request object:
  ```ts
  req.workspaceMember = {
    workspaceId: string,
    userId: string,
    role: WorkspaceRole
  };
  ```
- Controllers access this context via the `@CurrentMember()` parameter decorator.

## 4. Role Hierarchy & Permissions: `@WorkspaceRoles(...)`
- Role hierarchy: `OWNER > ADMIN > MEMBER > GUEST`.
- Route handlers declare their minimum required role using `@WorkspaceRoles(WorkspaceRole.<ROLE>)`.
- The default minimum if no role decorator is present on a workspace route is `WorkspaceRole.GUEST` (any active member can read).
- **Enforcement Rule**: Every non-`GET` route that is workspace-scoped MUST declare `@WorkspaceRoles(...)` explicitly. The only non-GET route permitted to use `GUEST` explicitly is self-leaving (`DELETE /members/:userId` on self).
- If a user is a member of the workspace but lacks the required role threshold (checked via `hasAtLeast(member.role, minRole)`), the guard returns 403 Forbidden:
  ```json
  {
    "statusCode": 403,
    "error": "Forbidden",
    "message": "Insufficient workspace permissions"
  }
  ```

## 5. Repository Isolation Rule
- In every repository method touching tenant data, the Prisma `where` clause **MUST** include `workspaceId` sourced from the route param / `@CurrentMember()` context.
- **NEVER** trust or accept a `workspaceId` from the request body.
- Keyset pagination must always order by `createdAt DESC, id DESC` and scope queries to the target workspace.

## 6. Fractional Indexing & Collation "C"
- Positions for spaces, folders, lists, and tasks use fractional indexing keys (via the `fractional-indexing` library).
- Fractional keys mix upper and lower case letters (e.g. `'a0'`, `'a1'`, `'Zz'`, `'a0V'`). To ensure database ordering matches JavaScript's byte-wise code-unit ordering, PostgreSQL columns for `position` are typed `text COLLATE "C"`.
- Sibling items must always be ordered by `[{ position: 'asc' }, { id: 'asc' }]` where `id` breaks ties from concurrent insertions.

## 7. Hierarchy & Archive Semantics
- Spaces and Statuses require `ADMIN` or above to mutate. Folders and Lists require `MEMBER` or above to mutate. All GET endpoints require `GUEST` (any member).
- **Archive Cascade**: Archiving a space cascades `archivedAt` (with a single shared timestamp) to all currently unarchived folders and lists in that space. Archiving a folder cascades `archivedAt` to all currently unarchived lists in that folder.
- **Selective Unarchive**: Unarchiving a node only unarchives descendants whose `archivedAt` matches that node's timestamp (preserving children that were archived earlier independently). A node cannot be unarchived while its parent is archived (returns 409 Conflict).
- **Archived Immutability**: Archived nodes cannot be modified, moved, reordered, or have children added to them (returns 409 Conflict).
- **Permanent Deletion**: Permanent `DELETE` requires `ADMIN` role and requires the target node to already be archived (returns 409 Conflict if not archived). Deletion cascades down through database foreign keys.

## 8. Exported Hierarchy API for M4 (Tasks)
Exported from `src/modules/hierarchy/index.ts`:
- `HierarchyService.getListForTenant(workspaceId: string, listId: string)`: Returns `{ id, spaceId, folderId, archivedAt }` validating tenant isolation.
- `HierarchyService.getStatusForList(workspaceId: string, listId: string, statusId: string)`: Returns `{ id, type, name, listId }` belonging to the specified list and tenant.
- `HierarchyService.getStatusesForList(workspaceId: string, listId: string)`: Returns list statuses ordered by position ascending.
- `HierarchyService.getDefaultOpenStatus(workspaceId: string, listId: string)`: Returns the default status of type `OPEN` for task creation.

## 9. Task Module Architecture & Repository Isolation
- **Owned Tables**: The `tasks` module owns `tasks`, `task_assignees`, `tags`, and `task_tags`.
- **Allowed Relation-Filter Exception**: To efficiently exclude tasks residing in archived lists during queries without a `listId` filter, `TasksRepository` is permitted to use a Prisma relation filter on `list.archivedAt` (e.g., `where: { list: { archivedAt: null } }`). No direct writes or calls on the `list` delegate are permitted.
- **Roles**:
  - GET tasks/tags: `GUEST` (any active member). `GET /tasks?deleted=true`: `ADMIN` or above only (403 otherwise).
  - Create, edit, move, assign, tag: `MEMBER` or above.
  - Delete and restore tasks: Allowed for the task's creator or `ADMIN` or above (creatorId null means `ADMIN` or above only).
  - Delete tags: `ADMIN` or above only.
- **Archived Lists**: All tasks in an archived list are read-only. Create, update, move into or out of, delete, restore, assign, or tag returns 409 Conflict.

## 10. Task Sibling Groups & Fractional Indexing
- Fractional indexing via `src/common/position` (`positionBetween`).
- **Sibling Groups**:
  - Top-level tasks: `(workspaceId, listId, statusId, parentId: null)`.
  - Subtasks: `(workspaceId, parentId)` regardless of status.
- New tasks are positioned at the END of their sibling group.
- Ordered by `[{ position: 'asc' }, { id: 'asc' }]` where `id` breaks ties.
- Queries filtering live rows include `deletedAt: null` so partial index `tasks_live_list_idx` is used.
- **Subtask 1-Level Depth Cap**: Subtasks cannot have nested subtasks (`parentId` must be null on the parent, otherwise 400). A subtask inherits its parent's `listId` and cannot move cross-list independently (400).

## 11. Soft Delete & Restore Semantics
- Soft delete (`DELETE /tasks/:taskId`) captures a single `Date` timestamp and sets `deletedAt` on the task and all its active subtasks.
- Restore (`POST /tasks/:taskId/restore`) clears `deletedAt` on the task and only on subtasks whose `deletedAt` equals the task's `deletedAt` (preserving subtasks soft-deleted earlier independently).
- Restoring a subtask whose parent is soft-deleted returns 409 Conflict.
- Restoring into an archived list returns 409 Conflict.

## 12. Full-Text Search Architecture & 2000-Match Cap
- `q` is a filter, not a ranking.
- Uses PostgreSQL full-text search with the exact expression matching the GIN index `tasks_search_idx`:
  ```sql
  to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'')) @@ websearch_to_tsquery('english', $q)
  ```
- Scoped by `workspace_id` and `deleted_at IS NULL`, returning at most **2000 matching IDs**.
- All subsequent filters, sorting, and keyset pagination are applied in the typed Prisma query using `id: { in: matchedIds }`.
- Relevance ranking is intentionally deferred to Phase 2.

## 13. Exported Tasks Public API for M5 (Activity & Comments)
Exported from `src/modules/tasks/index.ts`:
- `TasksService.getTaskForTenant(workspaceId: string, taskId: string)`: Returns `{ id, workspaceId, listId, parentId, deletedAt }` (does not throw 404 for soft-deleted tasks; the caller decides).
- Domain events emitted after successful transactions:
  - `task.created` (`TaskCreatedEvent`)
  - `task.updated` (`TaskUpdatedEvent`)
  - `task.moved` (`TaskMovedEvent`)
  - `task.deleted` (`TaskDeletedEvent`)
  - `task.restored` (`TaskRestoredEvent`)
  - `task.assignees.changed` (`TaskAssigneesChangedEvent`)
  - `task.tags.changed` (`TaskTagsChangedEvent`)
  - `tag.created` (`TagCreatedEvent`)
  - `tag.updated` (`TagUpdatedEvent`)
  - `tag.deleted` (`TagDeletedEvent`)
