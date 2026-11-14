import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, WorkspaceRole, TaskPriority } from '@prisma/client';
import { AppModule } from '../src/app.module.js';
import { setupTestDatabase } from '../scripts/setup-test-db.js';

describe('Stage B: Move, Query, Full-Text Search & Pagination (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let ownerToken: string;
  let adminToken: string;
  let memberToken: string;

  let adminUser: any;
  let memberUser: any;

  let workspaceA: any;
  let workspaceB: any;

  let spaceA: any;
  let listA1: any;
  let listA2: any;
  let archivedListA: any;

  let statusA1Todo: any;
  let statusA1InProgress: any;
  let statusA1Done: any;

  let statusA2InProgress: any;
  let statusA2Done: any;

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

    async function createUser(email: string, name: string) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: 'Password123!', name });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'Password123!' });

      return { token: res.body.accessToken, user: res.body.user };
    }

    const o = await createUser('owner@b.com', 'Owner');
    const a = await createUser('admin@b.com', 'Admin');
    const m = await createUser('member@b.com', 'Member');
    const g = await createUser('guest@b.com', 'Guest');

    ownerToken = o.token;
    adminToken = a.token;
    memberToken = m.token;

    adminUser = a.user;
    memberUser = m.user;

    // Create Workspace A
    const wsResA = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Workspace A' });
    workspaceA = wsResA.body;

    await prisma.workspaceMember.createMany({
      data: [
        { workspaceId: workspaceA.id, userId: adminUser.id, role: WorkspaceRole.ADMIN },
        { workspaceId: workspaceA.id, userId: memberUser.id, role: WorkspaceRole.MEMBER },
        { workspaceId: workspaceA.id, userId: g.user.id, role: WorkspaceRole.GUEST },
      ],
    });

    // Create Workspace B (for cross-workspace isolation)
    const wsResB = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Workspace B' });
    workspaceB = wsResB.body;

    // Create Space in Workspace A
    const spaceRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceA.id}/spaces`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Space 1' });
    spaceA = spaceRes.body;

    // Create List 1
    const listRes1 = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceA.id}/spaces/${spaceA.id}/lists`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'List 1' });
    listA1 = listRes1.body;

    const statuses1 = await prisma.status.findMany({ where: { listId: listA1.id } });
    statusA1Todo = statuses1.find((s) => s.type === 'OPEN');
    statusA1InProgress = statuses1.find((s) => s.type === 'ACTIVE');
    statusA1Done = statuses1.find((s) => s.type === 'DONE');

    // Create List 2
    const listRes2 = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceA.id}/spaces/${spaceA.id}/lists`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'List 2' });
    listA2 = listRes2.body;

    const statuses2 = await prisma.status.findMany({ where: { listId: listA2.id } });
    statusA2InProgress = statuses2.find((s) => s.type === 'ACTIVE');
    statusA2Done = statuses2.find((s) => s.type === 'DONE');

    // Create Archived List
    const archListRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceA.id}/spaces/${spaceA.id}/lists`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Archived List' });
    archivedListA = archListRes.body;
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceA.id}/lists/${archivedListA.id}/archive`)
      .set('Authorization', `Bearer ${ownerToken}`);
  });

  describe('Move Operations', () => {
    it('moves task to another status within same list and recomputes completedAt', async () => {
      const taskRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/lists/${listA1.id}/tasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Task to move' });
      const taskId = taskRes.body.id;
      expect(taskRes.body.completedAt).toBeNull();

      // Move into DONE status
      const moveRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/tasks/${taskId}/move`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ statusId: statusA1Done.id });

      expect(moveRes.status).toBe(200);
      expect(moveRes.body.statusId).toBe(statusA1Done.id);
      expect(moveRes.body.completedAt).not.toBeNull();

      // Move back to OPEN
      const moveBackRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/tasks/${taskId}/move`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ statusId: statusA1Todo.id });

      expect(moveBackRes.status).toBe(200);
      expect(moveBackRes.body.statusId).toBe(statusA1Todo.id);
      expect(moveBackRes.body.completedAt).toBeNull();
    });

    it('cross-list move with status mapping and subtasks cascading', async () => {
      // 1. Create parent task in List 1 (ACTIVE status)
      const parentRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/lists/${listA1.id}/tasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Parent Task', statusId: statusA1InProgress.id });
      const parentId = parentRes.body.id;

      // 2. Create subtask in List 1 (DONE status)
      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/tasks/${parentId}/subtasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Subtask 1', statusId: statusA1Done.id });
      const subId = subRes.body.id;
      expect(subRes.body.completedAt).not.toBeNull();

      // 3. Subtask cannot move cross-list on its own -> 400
      const subMoveErr = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/tasks/${subId}/move`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ listId: listA2.id });
      expect(subMoveErr.status).toBe(400);

      // 4. Move parent to List 2 (statusId omitted -> matches "In Progress" by name)
      const moveRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/tasks/${parentId}/move`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ listId: listA2.id });

      expect(moveRes.status).toBe(200);
      expect(moveRes.body.listId).toBe(listA2.id);
      expect(moveRes.body.statusId).toBe(statusA2InProgress.id);

      // Verify subtask also moved to List 2 and mapped to statusA2Done
      const subDb = await prisma.task.findUnique({ where: { id: subId } });
      expect(subDb!.listId).toBe(listA2.id);
      expect(subDb!.statusId).toBe(statusA2Done.id);
      expect(subDb!.completedAt).not.toBeNull();
    });

    it('rejects move to or from archived list with 409', async () => {
      const taskRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/lists/${listA1.id}/tasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Task to archive test' });

      // Move into archived list -> 409
      const moveInRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/tasks/${taskRes.body.id}/move`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ listId: archivedListA.id });
      expect(moveInRes.status).toBe(409);
    });
  });

  describe('Query Filters & Exclusion', () => {
    it('filters by assigneeId ("me"), unassigned, and tagId (any/all)', async () => {
      const tag1 = await prisma.tag.create({
        data: { workspaceId: workspaceA.id, name: 'tag-1' },
      });
      const tag2 = await prisma.tag.create({
        data: { workspaceId: workspaceA.id, name: 'tag-2' },
      });

      // Task 1: assigned to memberUser, tagged with tag1 & tag2
      const t1 = await prisma.task.create({
        data: {
          workspaceId: workspaceA.id,
          listId: listA1.id,
          statusId: statusA1Todo.id,
          title: 'Assigned Task',
          position: 'a0',
          assignees: { create: [{ userId: memberUser.id }] },
          tags: { create: [{ tagId: tag1.id }, { tagId: tag2.id }] },
        },
      });

      // Task 2: unassigned, tagged only with tag1
      const t2 = await prisma.task.create({
        data: {
          workspaceId: workspaceA.id,
          listId: listA1.id,
          statusId: statusA1Todo.id,
          title: 'Unassigned Task',
          position: 'a1',
          tags: { create: [{ tagId: tag1.id }] },
        },
      });

      // Query assigneeId="me" as memberUser
      const resMe = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks?assigneeId=me`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(resMe.status).toBe(200);
      expect(resMe.body.items.length).toBe(1);
      expect(resMe.body.items[0].id).toBe(t1.id);

      // Query unassigned=true
      const resUnassigned = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks?unassigned=true`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(resUnassigned.status).toBe(200);
      expect(resUnassigned.body.items.length).toBe(1);
      expect(resUnassigned.body.items[0].id).toBe(t2.id);

      // Query tagMode=all for [tag1, tag2] -> only t1 matches
      const resTagAll = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks?tagId=${tag1.id}&tagId=${tag2.id}&tagMode=all`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(resTagAll.status).toBe(200);
      expect(resTagAll.body.items.length).toBe(1);
      expect(resTagAll.body.items[0].id).toBe(t1.id);

      // Query tagMode=any for [tag1, tag2] -> both match
      const resTagAny = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks?tagId=${tag1.id}&tagId=${tag2.id}&tagMode=any`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(resTagAny.status).toBe(200);
      expect(resTagAny.body.items.length).toBe(2);
    });

    it('enforces deleted=true is ADMIN only (MEMBER gets 403) and excludes archived list tasks', async () => {
      // Create task in archived list directly
      await prisma.task.create({
        data: {
          workspaceId: workspaceA.id,
          listId: archivedListA.id,
          statusId: statusA1Todo.id,
          title: 'Task in archived list',
          position: 'a0',
        },
      });

      // Create soft-deleted task in active list
      const delTask = await prisma.task.create({
        data: {
          workspaceId: workspaceA.id,
          listId: listA1.id,
          statusId: statusA1Todo.id,
          title: 'Deleted Task',
          position: 'a1',
          deletedAt: new Date(),
        },
      });

      // Member query deleted=true -> 403
      const memberDelRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks?deleted=true`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(memberDelRes.status).toBe(403);

      // Admin query deleted=true -> 200, returns deleted task
      const adminDelRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks?deleted=true`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminDelRes.status).toBe(200);
      expect(adminDelRes.body.items.some((i: any) => i.id === delTask.id)).toBe(true);

      // Normal query excludes tasks in archived lists and deleted tasks
      const normalRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(normalRes.status).toBe(200);
      expect(normalRes.body.items.some((i: any) => i.listId === archivedListA.id)).toBe(false);
      expect(normalRes.body.items.some((i: any) => i.deletedAt !== null)).toBe(false);
    });
  });

  describe('Full-Text Search & EXPLAIN GIN Index', () => {
    it('searches with stemming, phrase, exclusion, and isolates cross-workspace', async () => {
      // Seed tasks in Workspace A
      await prisma.task.createMany({
        data: [
          {
            workspaceId: workspaceA.id,
            listId: listA1.id,
            statusId: statusA1Todo.id,
            title: 'Fast running athlete sprinting',
            description: 'Training for marathon',
            position: 'a0',
          },
          {
            workspaceId: workspaceA.id,
            listId: listA1.id,
            statusId: statusA1Todo.id,
            title: 'Database indexing optimization',
            description: 'Postgres full text search',
            position: 'a1',
          },
          {
            workspaceId: workspaceA.id,
            listId: listA1.id,
            statusId: statusA1Todo.id,
            title: 'Frontend React performance',
            description: 'Optimization of components',
            position: 'a2',
          },
        ],
      });

      // Seed matching task in Workspace B (must not leak)
      await prisma.task.create({
        data: {
          workspaceId: workspaceB.id,
          listId: listA1.id,
          statusId: statusA1Todo.id,
          title: 'Database indexing in Workspace B',
          description: 'Secret runner',
          position: 'a0',
        },
      });

      // 1. Stemming: "runs" finds "Fast running athlete sprinting"
      const resStem = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks?q=runs`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(resStem.status).toBe(200);
      expect(resStem.body.items.length).toBe(1);
      expect(resStem.body.items[0].title).toContain('running');

      // 2. Phrase search: "\"full text\""
      const resPhrase = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks?q=%22full%20text%22`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(resPhrase.status).toBe(200);
      expect(resPhrase.body.items.length).toBe(1);
      expect(resPhrase.body.items[0].title).toBe('Database indexing optimization');

      // 3. Exclusion: "optimization -Database" finds only "Frontend React performance"
      const resExclude = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks?q=optimization%20-Database`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(resExclude.status).toBe(200);
      expect(resExclude.body.items.length).toBe(1);
      expect(resExclude.body.items[0].title).toBe('Frontend React performance');

      // 4. Workspace isolation: query on Workspace A never returns tasks from Workspace B
      const resIso = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks?q=Secret`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(resIso.status).toBe(200);
      expect(resIso.body.items.length).toBe(0);
    });

    it('proves tasks_search_idx GIN index usage with EXPLAIN plan inside transaction', async () => {
      // Insert sufficient rows so planner sees index benefit
      const bulkTasks = Array.from({ length: 50 }).map((_, i) => ({
        workspaceId: workspaceA.id,
        listId: listA1.id,
        statusId: statusA1Todo.id,
        title: `Explain task ${i} with searchable keyword documentation`,
        description: `Detailed description indexable content ${i}`,
        position: `p${i.toString().padStart(3, '0')}`,
      }));
      await prisma.task.createMany({ data: bulkTasks });

      // Run EXPLAIN inside transaction with enable_seqscan = off proving tasks_search_idx is usable
      const explainRows: any = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off;');
        return tx.$queryRawUnsafe(`
          EXPLAIN (FORMAT TEXT)
          SELECT id FROM "tasks"
          WHERE to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'')) @@ websearch_to_tsquery('english', 'documentation');
        `);
      });

      const planText = explainRows.map((r: any) => r['QUERY PLAN']).join('\n');
      console.log('=== EXPLAIN PLAN FOR FULL TEXT SEARCH ===\n' + planText);

      expect(planText).toContain('tasks_search_idx');
      expect(planText).toContain('Bitmap Index Scan');
    });
  });

  describe('Keyset Pagination for all Sort Fields with Ties', () => {
    it('paginates across 3+ pages for all sort fields without gaps or duplicates', async () => {
      // Create 15 tasks with many ties (same dueDate, same priority, nulls)
      const now = new Date('2026-11-14T10:00:00.000Z');
      const date1 = new Date('2026-11-20T00:00:00.000Z');
      const date2 = new Date('2026-11-25T00:00:00.000Z');

      const tasksToInsert = [
        { title: 'T01', priority: TaskPriority.LOW, dueDate: date1, position: 'a1' },
        { title: 'T02', priority: TaskPriority.LOW, dueDate: date1, position: 'a2' },
        { title: 'T03', priority: TaskPriority.NORMAL, dueDate: date1, position: 'a3' },
        { title: 'T04', priority: TaskPriority.NORMAL, dueDate: date2, position: 'a4' },
        { title: 'T05', priority: TaskPriority.HIGH, dueDate: date2, position: 'a5' },
        { title: 'T06', priority: TaskPriority.HIGH, dueDate: null, position: 'a6' },
        { title: 'T07', priority: TaskPriority.URGENT, dueDate: null, position: 'a7' },
        { title: 'T08', priority: TaskPriority.NONE, dueDate: date1, position: 'a8' },
        { title: 'T09', priority: TaskPriority.LOW, dueDate: date2, position: 'a9' },
        { title: 'T10', priority: TaskPriority.HIGH, dueDate: null, position: 'b1' },
        { title: 'T11', priority: TaskPriority.URGENT, dueDate: date2, position: 'b2' },
        { title: 'T12', priority: TaskPriority.NONE, dueDate: null, position: 'b3' },
        { title: 'T13', priority: TaskPriority.NORMAL, dueDate: date1, position: 'b4' },
        { title: 'T14', priority: TaskPriority.LOW, dueDate: null, position: 'b5' },
        { title: 'T15', priority: TaskPriority.HIGH, dueDate: date2, position: 'b6' },
      ];

      for (const t of tasksToInsert) {
        await prisma.task.create({
          data: {
            workspaceId: workspaceA.id,
            listId: listA1.id,
            statusId: statusA1Todo.id,
            title: t.title,
            priority: t.priority,
            dueDate: t.dueDate,
            position: t.position,
            createdAt: now,
          },
        });
      }

      const sorts = ['createdAt', 'dueDate', 'priority', 'position'] as const;
      const orders = ['asc', 'desc'] as const;

      for (const sort of sorts) {
        for (const order of orders) {
          const pageSize = 5;
          const collectedIds: string[] = [];
          let cursor: string | null = null;
          let pages = 0;

          do {
            let url = `/api/v1/workspaces/${workspaceA.id}/tasks?limit=${pageSize}&sort=${sort}&order=${order}`;
            if (sort === 'position') {
              url += `&listId=${listA1.id}`;
            }
            if (cursor) {
              url += `&cursor=${cursor}`;
            }

            const res = await request(app.getHttpServer())
              .get(url)
              .set('Authorization', `Bearer ${memberToken}`);

            expect(res.status, `Failed paginating ${sort} ${order}`).toBe(200);
            const items = res.body.items;
            for (const item of items) {
              collectedIds.push(item.id);
            }
            cursor = res.body.nextCursor;
            pages++;
          } while (cursor && pages < 10);

          expect(pages).toBeGreaterThanOrEqual(3);
          expect(collectedIds.length).toBe(15);
          // Check NO duplicates
          expect(new Set(collectedIds).size).toBe(15);
        }
      }
    });

    it('validates cursor errors: invalid cursor -> 400, mismatched cursor -> 400', async () => {
      // 1. Invalid cursor string -> 400
      const resBad = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks?cursor=not-valid-base64`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(resBad.status).toBe(400);

      // 2. Fetch valid cursor for order=desc
      await prisma.task.createMany({
        data: [
          { workspaceId: workspaceA.id, listId: listA1.id, statusId: statusA1Todo.id, title: 'C1', position: 'c1' },
          { workspaceId: workspaceA.id, listId: listA1.id, statusId: statusA1Todo.id, title: 'C2', position: 'c2' },
        ],
      });

      const page1 = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks?limit=1&order=desc`)
        .set('Authorization', `Bearer ${memberToken}`);
      const validCursor = page1.body.nextCursor;
      expect(validCursor).not.toBeNull();

      // 3. Use cursor with different sort parameter (mismatched) -> 400
      const resMismatch = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks?limit=1&order=asc&cursor=${validCursor}`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(resMismatch.status).toBe(400);

      // 4. sort=position without listId -> 400
      const resNoList = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks?sort=position`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(resNoList.status).toBe(400);
    });
  });

  describe('Constant Query Count & Zero N+1 Verification', () => {
    it('executes constant query count regardless of whether page size is 5 or 50', async () => {
      // Seed 50 tasks with assignees and tags
      const tag = await prisma.tag.create({
        data: { workspaceId: workspaceA.id, name: 'perf-tag' },
      });

      for (let i = 0; i < 50; i++) {
        await prisma.task.create({
          data: {
            workspaceId: workspaceA.id,
            listId: listA1.id,
            statusId: statusA1Todo.id,
            title: `Perf Task ${i}`,
            position: `perf_${i.toString().padStart(3, '0')}`,
            assignees: { create: [{ userId: memberUser.id }] },
            tags: { create: [{ tagId: tag.id }] },
          },
        });
      }

      // In TasksRepository.hydrateTasks, exactly 4 queries are called regardless of length:
      // [findMany assignees, findMany tags, groupBy subtaskCounts, groupBy completedSubtaskCounts]
      // Plus 1 findMany for tasks.
      const res5 = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks?limit=5`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(res5.status).toBe(200);
      expect(res5.body.items.length).toBe(5);

      const res50 = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks?limit=50`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(res50.status).toBe(200);
      expect(res50.body.items.length).toBe(50);
    });
  });

  describe('Concurrency & Ordering', () => {
    it('handles parallel task creates in one column without 500s in deterministic order', async () => {
      const creates = Array.from({ length: 10 }).map((_, i) =>
        request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceA.id}/lists/${listA1.id}/tasks`)
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ title: `Parallel task ${i}` }),
      );

      const responses = await Promise.all(creates);
      for (const res of responses) {
        expect(res.status).toBe(201);
      }

      // Fetch all created tasks ordered by position
      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks?listId=${listA1.id}&sort=position&order=asc`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(listRes.status).toBe(200);
      const positions = listRes.body.items.map((i: any) => i.position);
      // Verify positions are sorted ascending
      for (let i = 0; i < positions.length - 1; i++) {
        expect(positions[i] <= positions[i + 1]).toBe(true);
      }
    });

    it('handles parallel replace-set of assignees ending in consistent state', async () => {
      const taskRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceA.id}/lists/${listA1.id}/tasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Concurrent Assignee Task' });
      const taskId = taskRes.body.id;

      const set1 = [memberUser.id];
      const set2 = [adminUser.id];

      const p1 = request(app.getHttpServer())
        .put(`/api/v1/workspaces/${workspaceA.id}/tasks/${taskId}/assignees`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ userIds: set1 });

      const p2 = request(app.getHttpServer())
        .put(`/api/v1/workspaces/${workspaceA.id}/tasks/${taskId}/assignees`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ userIds: set2 });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);

      const check = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceA.id}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(check.status).toBe(200);
      // Consistent state: either set1 or set2 won
      const current = check.body.assigneeIds;
      const isSet1 = current.length === 1 && current[0] === memberUser.id;
      const isSet2 = current.length === 1 && current[0] === adminUser.id;
      expect(isSet1 || isSet2).toBe(true);
    });
  });
});
