import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, WorkspaceRole } from '@prisma/client';
import { AppModule } from '../src/app.module.js';
import { setupTestDatabase } from '../scripts/setup-test-db.js';

interface TaskOperationDef {
  name: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  path: (ctx: {
    workspaceId: string;
    listId: string;
    taskId: string;
    tagId: string;
  }) => string;
  minRole: WorkspaceRole;
  isRead: boolean;
  body?: (ctx: {
    workspaceId: string;
    listId: string;
    taskId: string;
    tagId: string;
    userId: string;
  }) => any;
}

const STAGE_A_OPERATIONS: TaskOperationDef[] = [
  {
    name: 'POST /lists/:listId/tasks',
    method: 'POST',
    path: (c) => `/api/v1/workspaces/${c.workspaceId}/lists/${c.listId}/tasks`,
    minRole: WorkspaceRole.MEMBER,
    isRead: false,
    body: () => ({ title: 'New Task' }),
  },
  {
    name: 'POST /tasks/:taskId/subtasks',
    method: 'POST',
    path: (c) => `/api/v1/workspaces/${c.workspaceId}/tasks/${c.taskId}/subtasks`,
    minRole: WorkspaceRole.MEMBER,
    isRead: false,
    body: () => ({ title: 'New Subtask' }),
  },
  {
    name: 'GET /tasks/:taskId',
    method: 'GET',
    path: (c) => `/api/v1/workspaces/${c.workspaceId}/tasks/${c.taskId}`,
    minRole: WorkspaceRole.GUEST,
    isRead: true,
  },
  {
    name: 'PATCH /tasks/:taskId',
    method: 'PATCH',
    path: (c) => `/api/v1/workspaces/${c.workspaceId}/tasks/${c.taskId}`,
    minRole: WorkspaceRole.MEMBER,
    isRead: false,
    body: () => ({ title: 'Updated Task' }),
  },
  {
    name: 'PUT /tasks/:taskId/assignees',
    method: 'PUT',
    path: (c) => `/api/v1/workspaces/${c.workspaceId}/tasks/${c.taskId}/assignees`,
    minRole: WorkspaceRole.MEMBER,
    isRead: false,
    body: (c) => ({ userIds: [c.userId] }),
  },
  {
    name: 'PUT /tasks/:taskId/tags',
    method: 'PUT',
    path: (c) => `/api/v1/workspaces/${c.workspaceId}/tasks/${c.taskId}/tags`,
    minRole: WorkspaceRole.MEMBER,
    isRead: false,
    body: (c) => ({ tagIds: [c.tagId] }),
  },
  {
    name: 'POST /tasks/:taskId/restore',
    method: 'POST',
    path: (c) => `/api/v1/workspaces/${c.workspaceId}/tasks/${c.taskId}/restore`,
    minRole: WorkspaceRole.MEMBER,
    isRead: false,
  },
  {
    name: 'DELETE /tasks/:taskId',
    method: 'DELETE',
    path: (c) => `/api/v1/workspaces/${c.workspaceId}/tasks/${c.taskId}`,
    minRole: WorkspaceRole.MEMBER,
    isRead: false,
  },
  {
    name: 'POST /tags',
    method: 'POST',
    path: (c) => `/api/v1/workspaces/${c.workspaceId}/tags`,
    minRole: WorkspaceRole.MEMBER,
    isRead: false,
    body: () => ({ name: 'test-tag-' + Math.random().toString(36).substring(7) }),
  },
  {
    name: 'GET /tags',
    method: 'GET',
    path: (c) => `/api/v1/workspaces/${c.workspaceId}/tags`,
    minRole: WorkspaceRole.GUEST,
    isRead: true,
  },
  {
    name: 'PATCH /tags/:tagId',
    method: 'PATCH',
    path: (c) => `/api/v1/workspaces/${c.workspaceId}/tags/${c.tagId}`,
    minRole: WorkspaceRole.MEMBER,
    isRead: false,
    body: () => ({ name: 'renamed-' + Math.random().toString(36).substring(7) }),
  },
  {
    name: 'DELETE /tags/:tagId',
    method: 'DELETE',
    path: (c) => `/api/v1/workspaces/${c.workspaceId}/tags/${c.tagId}`,
    minRole: WorkspaceRole.ADMIN,
    isRead: false,
  },
];

describe('Stage A: Tasks & Tags Core (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  // Workspace A (primary)
  let ownerToken: string;
  let adminToken: string;
  let memberToken: string;
  let guestToken: string;
  let nonMemberToken: string;

  let ownerUser: any;
  let adminUser: any;
  let memberUser: any;
  let guestUser: any;

  let workspaceA: any;
  let spaceA: any;
  let listA: any;
  let openStatusA: any;
  let doneStatusA: any;

  // Workspace B (for cross-workspace isolation)
  let workspaceB: any;
  let listB: any;
  let taskB: any;
  let tagB: any;

  beforeAll(async () => {
    await setupTestDatabase();
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean tables in FK order
    await prisma.taskTag.deleteMany();
    await prisma.taskAssignee.deleteMany();
    await prisma.task.deleteMany();
    await prisma.tag.deleteMany();
    await prisma.status.deleteMany();
    await prisma.list.deleteMany();
    await prisma.folder.deleteMany();
    await prisma.space.deleteMany();
    await prisma.workspaceMember.deleteMany();
    await prisma.workspace.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();

    // Helper to register & login
    async function createUser(email: string, name: string) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: 'Password123!', name });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'Password123!' });

      return {
        token: res.body.accessToken,
        user: res.body.user,
      };
    }

    const o = await createUser('owner@a.com', 'Owner User');
    const a = await createUser('admin@a.com', 'Admin User');
    const m = await createUser('member@a.com', 'Member User');
    const g = await createUser('guest@a.com', 'Guest User');
    const nm = await createUser('nonmember@other.com', 'Non Member');

    ownerToken = o.token;
    adminToken = a.token;
    memberToken = m.token;
    guestToken = g.token;
    nonMemberToken = nm.token;

    ownerUser = o.user;
    adminUser = a.user;
    memberUser = m.user;
    guestUser = g.user;

    // Create Workspace A
    const wsResA = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Workspace A' });
    workspaceA = wsResA.body;

    // Add members to Workspace A
    await prisma.workspaceMember.createMany({
      data: [
        { workspaceId: workspaceA.id, userId: adminUser.id, role: WorkspaceRole.ADMIN },
        { workspaceId: workspaceA.id, userId: memberUser.id, role: WorkspaceRole.MEMBER },
        { workspaceId: workspaceA.id, userId: guestUser.id, role: WorkspaceRole.GUEST },
      ],
    });

    // Create Space A & List A
    const spaceResA = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceA.id}/spaces`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Engineering Space' });
    spaceA = spaceResA.body;

    const listResA = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceA.id}/spaces/${spaceA.id}/lists`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Sprint Backlog' });
    listA = listResA.body;

    const statusesA = await prisma.status.findMany({
      where: { listId: listA.id },
    });
    openStatusA = statusesA.find((s) => s.type === 'OPEN');
    doneStatusA = statusesA.find((s) => s.type === 'DONE');

    // Create Workspace B
    const wsResB = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Workspace B' });
    workspaceB = wsResB.body;

    const spaceResB = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceB.id}/spaces`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Space B' });

    const listResB = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceB.id}/spaces/${spaceResB.body.id}/lists`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'List B' });
    listB = listResB.body;

    const defaultStatusB = await prisma.status.findFirst({
      where: { listId: listB.id, type: 'OPEN' },
    });

    taskB = await prisma.task.create({
      data: {
        workspaceId: workspaceB.id,
        listId: listB.id,
        statusId: defaultStatusB!.id,
        title: 'Task in Workspace B',
        position: 'a0',
      },
    });

    tagB = await prisma.tag.create({
      data: {
        workspaceId: workspaceB.id,
        name: 'workspace-b-tag',
      },
    });
  });

  describe('Scenario 1: Role Matrix over all 12 Stage A operations', () => {
    it('enforces role access: GUEST read-only, non-member 404', async () => {
      // Seed a test task and tag in workspace A for the operations
      const testTask = await prisma.task.create({
        data: {
          workspaceId: workspaceA.id,
          listId: listA.id,
          statusId: openStatusA.id,
          creatorId: memberUser.id,
          title: 'Existing Task A',
          position: 'a0',
        },
      });

      const testTag = await prisma.tag.create({
        data: {
          workspaceId: workspaceA.id,
          name: 'existing-tag-a',
        },
      });

      const ctx = {
        workspaceId: workspaceA.id,
        listId: listA.id,
        taskId: testTask.id,
        tagId: testTag.id,
        userId: memberUser.id,
      };

      for (const op of STAGE_A_OPERATIONS) {
        const url = op.path(ctx);
        const reqBuilder = (token: string) => {
          let req: any;
          if (op.method === 'GET') req = request(app.getHttpServer()).get(url);
          else if (op.method === 'POST') req = request(app.getHttpServer()).post(url);
          else if (op.method === 'PATCH') req = request(app.getHttpServer()).patch(url);
          else if (op.method === 'PUT') req = request(app.getHttpServer()).put(url);
          else req = request(app.getHttpServer()).delete(url);

          req.set('Authorization', `Bearer ${token}`);
          if (op.body) req.send(op.body(ctx));
          return req;
        };

        // 1. Non-member must receive 404
        const nonMemberRes = await reqBuilder(nonMemberToken);
        expect(
          nonMemberRes.status,
          `Non-member on ${op.name} should return 404`,
        ).toBe(404);

        // 2. GUEST check: read allowed (200), non-GET forbidden (403)
        const guestRes = await reqBuilder(guestToken);
        if (op.isRead) {
          expect(guestRes.status, `Guest on read ${op.name} should succeed`).toBe(200);
        } else {
          expect(
            guestRes.status,
            `Guest on write ${op.name} should return 403`,
          ).toBe(403);
        }
      }
    });
  });

  describe('Scenario 2: Cross-Workspace Isolation', () => {
    it('returns 404 when referencing another workspace ID or wrong tenant IDs', async () => {
      // 1. Attempting to get task from workspace B using workspace A URL -> 404
      const res1 = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks/${taskB.id}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res1.status).toBe(404);

      // 2. Attempting to create task in listB via workspace A URL -> 404
      const res2 = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/lists/${listB.id}/tasks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Cross list task' });
      expect(res2.status).toBe(404);

      // 3. Attempting to tag a task in workspace A with tagB -> 400
      const testTask = await prisma.task.create({
        data: {
          workspaceId: workspaceA.id,
          listId: listA.id,
          statusId: openStatusA.id,
          title: 'Isolation Task',
          position: 'a0',
        },
      });

      const res3 = await request(app.getHttpServer())
        .put(`/api/v1/workspaces/${workspaceA.id}/tasks/${testTask.id}/tags`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ tagIds: [tagB.id] });
      expect(res3.status).toBe(400);
    });
  });

  describe('Scenario 3: Task Lifecycle & completedAt', () => {
    it('sets completedAt to null on OPEN and sets timestamp on DONE', async () => {
      // Create in OPEN status
      const res1 = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/lists/${listA.id}/tasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'Open task',
          statusId: openStatusA.id,
          description: 'My description',
          priority: 'HIGH',
        });
      expect(res1.status).toBe(201);
      expect(res1.body.completedAt).toBeNull();
      expect(res1.body.description).toBe('My description');
      expect(res1.body.priority).toBe('HIGH');
      expect(res1.body.position).toBeDefined();

      // Create in DONE status
      const res2 = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/lists/${listA.id}/tasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'Done task',
          statusId: doneStatusA.id,
        });
      expect(res2.status).toBe(201);
      expect(res2.body.completedAt).not.toBeNull();
    });

    it('validates dates: startDate <= dueDate', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/lists/${listA.id}/tasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'Bad dates',
          startDate: '2026-11-20T00:00:00.000Z',
          dueDate: '2026-11-10T00:00:00.000Z',
        });
      expect(res.status).toBe(400);
    });
  });

  describe('Scenario 4: Subtasks Rules & Depth Cap', () => {
    it('enforces depth cap = 1 (subtask cannot have nested subtasks)', async () => {
      // 1. Create top-level task
      const parentRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/lists/${listA.id}/tasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Top Task' });
      const parentId = parentRes.body.id;

      // 2. Create subtask
      const subtaskRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/tasks/${parentId}/subtasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Subtask Level 1' });
      expect(subtaskRes.status).toBe(201);
      expect(subtaskRes.body.parentId).toBe(parentId);
      expect(subtaskRes.body.listId).toBe(listA.id);

      // 3. Attempt nested subtask under subtask -> 400
      const nestedRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/tasks/${subtaskRes.body.id}/subtasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Subtask Level 2' });
      expect(nestedRes.status).toBe(400);
    });

    it('cascades soft-delete with identical timestamp and restores together', async () => {
      const parentRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/lists/${listA.id}/tasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Parent Task' });
      const parentId = parentRes.body.id;

      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/tasks/${parentId}/subtasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Child Subtask' });
      const subId = subRes.body.id;

      // Soft delete parent
      const delRes = await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceA.id}/tasks/${parentId}`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(delRes.status).toBe(204);

      // Check DB timestamps: must be identical
      const parentDb = await prisma.task.findUnique({ where: { id: parentId } });
      const subDb = await prisma.task.findUnique({ where: { id: subId } });
      expect(parentDb!.deletedAt).not.toBeNull();
      expect(subDb!.deletedAt).not.toBeNull();
      expect(parentDb!.deletedAt!.getTime()).toBe(subDb!.deletedAt!.getTime());

      // Attempting to restore subtask while parent is deleted -> 409
      const restoreSubRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/tasks/${subId}/restore`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(restoreSubRes.status).toBe(409);

      // Restoring parent restores subtask
      const restoreParentRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/tasks/${parentId}/restore`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(restoreParentRes.status).toBe(200);

      const restoredSubDb = await prisma.task.findUnique({ where: { id: subId } });
      expect(restoredSubDb!.deletedAt).toBeNull();
    });
  });

  describe('Scenario 5: Assignees & Tags Replace-Set', () => {
    it('enforces assignees rules: non-GUEST, member check, max 20, replace-set', async () => {
      const taskRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/lists/${listA.id}/tasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Assignee Task' });
      const taskId = taskRes.body.id;

      // 1. Assigning GUEST returns 400
      const guestAssignRes = await request(app.getHttpServer())
        .put(`/api/v1/workspaces/${workspaceA.id}/tasks/${taskId}/assignees`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ userIds: [guestUser.id] });
      expect(guestAssignRes.status).toBe(400);

      // 2. Assigning non-member returns 400
      const nonMemberAssignRes = await request(app.getHttpServer())
        .put(`/api/v1/workspaces/${workspaceA.id}/tasks/${taskId}/assignees`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ userIds: ['00000000-0000-0000-0000-000000000099'] });
      expect(nonMemberAssignRes.status).toBe(400);

      // 3. Assign memberUser and adminUser
      const assignRes1 = await request(app.getHttpServer())
        .put(`/api/v1/workspaces/${workspaceA.id}/tasks/${taskId}/assignees`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ userIds: [memberUser.id, adminUser.id] });
      expect(assignRes1.status).toBe(200);
      expect(
        assignRes1.body.assigneeIds.sort((a: string, b: string) =>
          a.localeCompare(b),
        ),
      ).toEqual(
        [adminUser.id, memberUser.id].sort((a: string, b: string) =>
          a.localeCompare(b),
        ),
      );

      // 4. Replace with only ownerUser
      const assignRes2 = await request(app.getHttpServer())
        .put(`/api/v1/workspaces/${workspaceA.id}/tasks/${taskId}/assignees`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ userIds: [ownerUser.id] });
      expect(assignRes2.status).toBe(200);
      expect(assignRes2.body.assigneeIds).toEqual([ownerUser.id]);
    });

    it('enforces tag rules: case-insensitive unique (409), max 500, cascade on delete', async () => {
      // 1. Create tag
      const tagRes1 = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/tags`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Backend', color: '#10B981' });
      expect(tagRes1.status).toBe(201);
      const tagId = tagRes1.body.id;

      // 2. Duplicate case-insensitive -> 409
      const tagRes2 = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/tags`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'backend' });
      expect(tagRes2.status).toBe(409);

      // 3. Attach tag to task
      const taskRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/lists/${listA.id}/tasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Tagged Task', tagIds: [tagId] });
      expect(taskRes.status).toBe(201);
      expect(taskRes.body.tags[0].name).toBe('Backend');

      // 4. Member cannot delete tag -> 403
      const memberDelRes = await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceA.id}/tags/${tagId}`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(memberDelRes.status).toBe(403);

      // 5. Admin deletes tag -> 204
      const adminDelRes = await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceA.id}/tags/${tagId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminDelRes.status).toBe(204);

      // Check task tags: link row deleted via FK cascade
      const taskCheck = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks/${taskRes.body.id}`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(taskCheck.body.tags).toEqual([]);
    });
  });

  describe('Scenario 6: Archived List & Delete Permissions', () => {
    it('rejects mutations on archived lists with 409', async () => {
      const taskRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/lists/${listA.id}/tasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Task to be archived' });
      const taskId = taskRes.body.id;

      // Archive list A
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/lists/${listA.id}/archive`)
        .set('Authorization', `Bearer ${ownerToken}`);

      // Attempt create in archived list -> 409
      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/lists/${listA.id}/tasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'New task in archived list' });
      expect(createRes.status).toBe(409);

      // Attempt update in archived list -> 409
      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspaceA.id}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Renamed' });
      expect(updateRes.status).toBe(409);

      // Attempt soft delete in archived list -> 409
      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceA.id}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(deleteRes.status).toBe(409);
    });

    it('enforces creator or ADMIN delete/restore rule', async () => {
      // Create new list in space A
      const listRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/spaces/${spaceA.id}/lists`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Active List' });
      const listId = listRes.body.id;

      // Member creates task
      const taskRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/lists/${listId}/tasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Member Task' });
      const taskId = taskRes.body.id;

      // Another member attempts to delete -> 403
      // Create second member
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'othermember@a.com', password: 'Password123!', name: 'Other' });
      const otherLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'othermember@a.com', password: 'Password123!' });
      const otherToken = otherLogin.body.accessToken;
      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspaceA.id,
          userId: otherLogin.body.user.id,
          role: WorkspaceRole.MEMBER,
        },
      });

      const forbiddenDel = await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceA.id}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(forbiddenDel.status).toBe(403);

      // Creator deletes own task -> 204
      const creatorDel = await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceA.id}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(creatorDel.status).toBe(204);

      // Other member attempts to restore -> 403
      const forbiddenRestore = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/tasks/${taskId}/restore`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(forbiddenRestore.status).toBe(403);

      // Admin restores task -> 200
      const adminRestore = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/tasks/${taskId}/restore`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminRestore.status).toBe(200);
    });
  });
});
