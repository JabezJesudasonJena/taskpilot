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
- `HierarchyService.getListForTenant(workspaceId: string, listId: string)`: Returns the target list and its archived status, validating tenant isolation.
- `HierarchyService.getStatusForList(workspaceId: string, listId: string, statusId: string)`: Returns the status belonging to the specified list and tenant.
- `HierarchyService.getDefaultOpenStatus(workspaceId: string, listId: string)`: Returns the default status of type `OPEN` for task creation.
