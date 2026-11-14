import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, WorkspaceRole, StatusType } from '@prisma/client';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupTestDatabase } from '../scripts/setup-test-db.js';

describe('Hierarchy Module (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const testDbUrl =
    'postgresql://postgres:postgres@localhost:5432/proj_manager_test?schema=public';

  beforeAll(async () => {
    process.env.DATABASE_URL = testDbUrl;
    await setupTestDatabase();

    prisma = new PrismaClient({
      datasources: { db: { url: testDbUrl } },
    });
    await prisma.$connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE users, refresh_tokens, password_reset_tokens, email_verification_tokens, workspaces, workspace_members, workspace_invites, spaces, folders, lists, statuses, tasks CASCADE;',
    );
  });

  async function createUser(email: string, name: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123', name })
      .expect(201);

    await prisma.user.update({
      where: { id: res.body.user.id },
      data: { emailVerifiedAt: new Date() },
    });

    return { user: res.body.user, accessToken: res.body.accessToken };
  }

  async function createWorkspaceWithMembers() {
    const owner = await createUser('owner@example.com', 'Owner');
    const admin = await createUser('admin@example.com', 'Admin');
    const member = await createUser('member@example.com', 'Member');
    const guest = await createUser('guest@example.com', 'Guest');
    const nonMember = await createUser('other@example.com', 'Other');

    const wsRes = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Acme Workspace' })
      .expect(201);
    const workspaceId = wsRes.body.id;

    // Add members directly to workspace_members
    await prisma.workspaceMember.createMany({
      data: [
        { workspaceId, userId: admin.user.id, role: WorkspaceRole.ADMIN },
        { workspaceId, userId: member.user.id, role: WorkspaceRole.MEMBER },
        { workspaceId, userId: guest.user.id, role: WorkspaceRole.GUEST },
      ],
    });

    return {
      workspaceId,
      owner,
      admin,
      member,
      guest,
      nonMember,
    };
  }

  describe('Scenario 1: Role matrix', () => {
    it('enforces GUEST read-only, MEMBER write to folders/lists, ADMIN full control, and non-member 404', async () => {
      const { workspaceId, owner, admin, member, guest, nonMember } =
        await createWorkspaceWithMembers();

      // Owner creates space, folder, list
      const spaceRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name: 'Engineering' })
        .expect(201);
      const spaceId = spaceRes.body.id;

      const folderRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces/${spaceId}/folders`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name: 'Backend' })
        .expect(201);
      const folderId = folderRes.body.id;

      const listRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces/${spaceId}/lists`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name: 'Sprint 1', folderId })
        .expect(201);
      const listId = listRes.body.id;

      const statusesRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/lists/${listId}/statuses`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      const statusId = statusesRes.body[0].id;

      // 1. GUEST can read
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/spaces`)
        .set('Authorization', `Bearer ${guest.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/spaces/${spaceId}/folders`)
        .set('Authorization', `Bearer ${guest.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/spaces/${spaceId}/lists`)
        .set('Authorization', `Bearer ${guest.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/lists/${listId}/statuses`)
        .set('Authorization', `Bearer ${guest.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/hierarchy`)
        .set('Authorization', `Bearer ${guest.accessToken}`)
        .expect(200);

      // GUEST write returns 403
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces`)
        .set('Authorization', `Bearer ${guest.accessToken}`)
        .send({ name: 'Guest Space' })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces/${spaceId}/folders`)
        .set('Authorization', `Bearer ${guest.accessToken}`)
        .send({ name: 'Guest Folder' })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces/${spaceId}/lists`)
        .set('Authorization', `Bearer ${guest.accessToken}`)
        .send({ name: 'Guest List' })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/lists/${listId}/statuses`)
        .set('Authorization', `Bearer ${guest.accessToken}`)
        .send({ name: 'Guest Status', color: '#10B981', type: StatusType.ACTIVE })
        .expect(403);

      // 2. MEMBER can create/update folders and lists
      const memberFolderRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces/${spaceId}/folders`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ name: 'Member Folder' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspaceId}/folders/${memberFolderRes.body.id}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ name: 'Updated Member Folder' })
        .expect(200);

      const memberListRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces/${spaceId}/lists`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ name: 'Member List', folderId: memberFolderRes.body.id })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspaceId}/lists/${memberListRes.body.id}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ name: 'Updated Member List' })
        .expect(200);

      // MEMBER 403 on spaces
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ name: 'Member Space Attempt' })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspaceId}/spaces/${spaceId}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ name: 'Member Space Rename' })
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceId}/spaces/${spaceId}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .expect(403);

      // MEMBER 403 on statuses
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/lists/${listId}/statuses`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ name: 'Member Status', color: '#10B981', type: StatusType.ACTIVE })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspaceId}/lists/${listId}/statuses/${statusId}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ name: 'Renamed Status' })
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceId}/lists/${listId}/statuses/${statusId}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .expect(403);

      // 3. ADMIN can do everything
      await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspaceId}/spaces/${spaceId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Admin Renamed Space' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/lists/${listId}/statuses`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Admin Status', color: '#3B82F6', type: StatusType.ACTIVE })
        .expect(201);

      // 4. Non-member gets identical 404
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/spaces`)
        .set('Authorization', `Bearer ${nonMember.accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces`)
        .set('Authorization', `Bearer ${nonMember.accessToken}`)
        .send({ name: 'Non Member Space' })
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/lists/${listId}`)
        .set('Authorization', `Bearer ${nonMember.accessToken}`)
        .expect(404);
    });
  });

  describe('Scenario 2: Cross-workspace & parent mismatch isolation', () => {
    it('returns 404 when accessing entities from another workspace or wrong parent', async () => {
      const ws1Setup = await createWorkspaceWithMembers();
      const ws2Owner = await createUser('ws2owner@example.com', 'WS2 Owner');
      const ws2Res = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${ws2Owner.accessToken}`)
        .send({ name: 'WS 2' })
        .expect(201);
      const ws2Id = ws2Res.body.id;

      // Add user to both workspaces so token is valid in both
      await prisma.workspaceMember.create({
        data: {
          workspaceId: ws2Id,
          userId: ws1Setup.admin.user.id,
          role: WorkspaceRole.ADMIN,
        },
      });

      // In WS1, create space A, folder A, list A
      const space1Res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${ws1Setup.workspaceId}/spaces`)
        .set('Authorization', `Bearer ${ws1Setup.admin.accessToken}`)
        .send({ name: 'Space 1' })
        .expect(201);
      const space1Id = space1Res.body.id;

      const folder1Res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${ws1Setup.workspaceId}/spaces/${space1Id}/folders`)
        .set('Authorization', `Bearer ${ws1Setup.admin.accessToken}`)
        .send({ name: 'Folder 1' })
        .expect(201);
      const folder1Id = folder1Res.body.id;

      const list1Res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${ws1Setup.workspaceId}/spaces/${space1Id}/lists`)
        .set('Authorization', `Bearer ${ws1Setup.admin.accessToken}`)
        .send({ name: 'List 1', folderId: folder1Id })
        .expect(201);
      const list1Id = list1Res.body.id;

      const statuses1 = await prisma.status.findMany({ where: { listId: list1Id } });
      const status1Id = statuses1[0].id;

      // In WS2, create space 2, folder 2, list 2
      const space2Res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${ws2Id}/spaces`)
        .set('Authorization', `Bearer ${ws1Setup.admin.accessToken}`)
        .send({ name: 'Space 2' })
        .expect(201);
      const space2Id = space2Res.body.id;

      const list2Res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${ws2Id}/spaces/${space2Id}/lists`)
        .set('Authorization', `Bearer ${ws1Setup.admin.accessToken}`)
        .send({ name: 'List 2' })
        .expect(201);
      const list2Id = list2Res.body.id;

      // Cross-workspace attempts return 404
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${ws2Id}/spaces/${space1Id}`)
        .set('Authorization', `Bearer ${ws1Setup.admin.accessToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${ws2Id}/folders/${folder1Id}`)
        .set('Authorization', `Bearer ${ws1Setup.admin.accessToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${ws2Id}/lists/${list1Id}`)
        .set('Authorization', `Bearer ${ws1Setup.admin.accessToken}`)
        .expect(404);

      // Status of list 1 accessed under list 2 returns 404
      await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${ws1Setup.workspaceId}/lists/${list2Id}/statuses/${status1Id}`)
        .set('Authorization', `Bearer ${ws1Setup.admin.accessToken}`)
        .send({ name: 'Hacked' })
        .expect(404);

      // Folder of Space 1 accessed via Space 2 lists returns 404
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${ws1Setup.workspaceId}/spaces/${space2Id}/folders`)
        .set('Authorization', `Bearer ${ws1Setup.admin.accessToken}`)
        .expect(404);
    });
  });

  describe('Scenario 3: Creating a list seeds default statuses', () => {
    it('seeds To Do (OPEN), In Progress (ACTIVE), and Done (DONE) with correct flags and positions', async () => {
      const { workspaceId, admin } = await createWorkspaceWithMembers();

      const spaceRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Core' })
        .expect(201);

      const listRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces/${spaceRes.body.id}/lists`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Tasks List' })
        .expect(201);

      const statusesRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/lists/${listRes.body.id}/statuses`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      const statuses = statusesRes.body;
      expect(statuses).toHaveLength(3);

      expect(statuses[0]).toMatchObject({
        name: 'To Do',
        type: StatusType.OPEN,
        position: 0,
      });

      expect(statuses[1]).toMatchObject({
        name: 'In Progress',
        type: StatusType.ACTIVE,
        position: 1,
      });

      expect(statuses[2]).toMatchObject({
        name: 'Done',
        type: StatusType.DONE,
        position: 2,
      });
    });
  });

  describe('Scenario 4: Status rules', () => {
    it('enforces open/done invariants, case-insensitive uniqueness, 20 status limit, reordering and task foreign key conflict', async () => {
      const { workspaceId, admin } = await createWorkspaceWithMembers();

      const spaceRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Space S4' })
        .expect(201);

      const listRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces/${spaceRes.body.id}/lists`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'List S4' })
        .expect(201);
      const listId = listRes.body.id;

      const statuses = (
        await request(app.getHttpServer())
          .get(`/api/v1/workspaces/${workspaceId}/lists/${listId}/statuses`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(200)
      ).body;

      const openStatus = statuses.find((s: any) => s.type === StatusType.OPEN);
      const doneStatus = statuses.find((s: any) => s.type === StatusType.DONE);

      // 1. Attempt to delete the only OPEN status -> 409
      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceId}/lists/${listId}/statuses/${openStatus.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(409);

      // 2. Attempt to change category of the only DONE status to ACTIVE -> 409
      await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspaceId}/lists/${listId}/statuses/${doneStatus.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ type: StatusType.ACTIVE })
        .expect(409);

      // 3. Attempt case-insensitive duplicate name -> 409
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/lists/${listId}/statuses`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'to do', color: '#10B981', type: StatusType.ACTIVE })
        .expect(409);

      // 4. Maximum 20 statuses: currently 3 exist, add 17 more (total 20), 21st fails with 409
      for (let i = 4; i <= 20; i++) {
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/lists/${listId}/statuses`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: `Status ${i}`, color: '#6366F1', type: StatusType.ACTIVE })
          .expect(201);
      }

      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/lists/${listId}/statuses`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Status 21', color: '#6366F1', type: StatusType.ACTIVE })
        .expect(409);

      // 5. Reorder status via PATCH /statuses/:statusId/reorder with { toIndex: 0 }
      const reorderRes = await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspaceId}/lists/${listId}/statuses/${doneStatus.id}/reorder`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ toIndex: 0 })
        .expect(200);

      expect(reorderRes.body.find((s: any) => s.id === doneStatus.id).position).toBe(0);

      // 6. Attempt to delete status in use by a task -> 409 Conflict
      await prisma.task.create({
        data: {
          workspaceId,
          listId,
          statusId: openStatus.id,
          title: 'Blocking Task',
          position: 'a0',
          creatorId: admin.user.id,
        },
      });

      // Add a second OPEN status so that "last OPEN" rule doesn't mask FK check
      const secondOpen = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/lists/${listId}/statuses`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Ready', color: '#10B981', type: StatusType.OPEN });

      // If we reached 20 earlier, secondOpen might fail due to cap unless we delete one active first
      if (secondOpen.status === 409) {
        const allStatuses = (
          await request(app.getHttpServer())
            .get(`/api/v1/workspaces/${workspaceId}/lists/${listId}/statuses`)
            .set('Authorization', `Bearer ${admin.accessToken}`)
        ).body;
        const toRemove = allStatuses.find((s: any) => s.name === 'Status 4');
        await request(app.getHttpServer())
          .delete(`/api/v1/workspaces/${workspaceId}/lists/${listId}/statuses/${toRemove.id}`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(204);

        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/lists/${listId}/statuses`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Ready', color: '#10B981', type: StatusType.OPEN })
          .expect(201);
      }

      // Deleting openStatus which has a task must return 409 Conflict
      const taskFkRes = await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceId}/lists/${listId}/statuses/${openStatus.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`);
      expect(taskFkRes.status).toBe(409);
    });
  });

  describe('Scenario 5: Nesting and moves', () => {
    it('rejects cross-space folder nesting and moves list cleanly across folders and spaces', async () => {
      const { workspaceId, admin } = await createWorkspaceWithMembers();

      const spaceA = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Space A' })
          .expect(201)
      ).body;

      const spaceB = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Space B' })
          .expect(201)
      ).body;

      const folderA = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces/${spaceA.id}/folders`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Folder A' })
          .expect(201)
      ).body;

      const folderB = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces/${spaceB.id}/folders`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Folder B' })
          .expect(201)
      ).body;

      // 1. Attempt to create list in folder of another space -> 400
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces/${spaceA.id}/lists`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Illegal List', folderId: folderB.id })
        .expect(400);

      // Create valid list in folder A
      const list = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces/${spaceA.id}/lists`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Mobile App', folderId: folderA.id })
          .expect(201)
      ).body;

      // 2. Move list from folder A to folder B (across spaces)
      const movedToB = (
        await request(app.getHttpServer())
          .patch(`/api/v1/workspaces/${workspaceId}/lists/${list.id}`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ spaceId: spaceB.id, folderId: folderB.id })
          .expect(200)
      ).body;
      expect(movedToB.spaceId).toBe(spaceB.id);
      expect(movedToB.folderId).toBe(folderB.id);

      // 3. Move list to root of Space B (folderId: null)
      const movedToRoot = (
        await request(app.getHttpServer())
          .patch(`/api/v1/workspaces/${workspaceId}/lists/${list.id}`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ folderId: null })
          .expect(200)
      ).body;
      expect(movedToRoot.folderId).toBeNull();
      expect(movedToRoot.spaceId).toBe(spaceB.id);

      // 4. Statuses follow the list
      const statuses = (
        await request(app.getHttpServer())
          .get(`/api/v1/workspaces/${workspaceId}/lists/${list.id}/statuses`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(200)
      ).body;
      expect(statuses).toHaveLength(3);
    });
  });

  describe('Scenario 6: Archive cascade', () => {
    it('cascades archive timestamp, handles selective unarchive, blocks parent conflicts and mutations', async () => {
      const { workspaceId, admin } = await createWorkspaceWithMembers();

      const space = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Product Space' })
          .expect(201)
      ).body;

      const folder = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces/${space.id}/folders`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Web' })
          .expect(201)
      ).body;

      const list1 = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces/${space.id}/lists`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Frontend', folderId: folder.id })
          .expect(201)
      ).body;

      const list2 = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces/${space.id}/lists`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Backend', folderId: folder.id })
          .expect(201)
      ).body;

      // 1. Archive list 1 earlier
      const archivedList1 = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/lists/${list1.id}/archive`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(200)
      ).body;
      expect(archivedList1.archivedAt).not.toBeNull();

      // Wait 20ms to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 30));

      // 2. Archive folder -> cascades to list 2 with SAME timestamp as folder
      const archivedFolder = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/folders/${folder.id}/archive`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(200)
      ).body;

      const dbList2 = await prisma.list.findUnique({ where: { id: list2.id } });
      expect(dbList2?.archivedAt?.toISOString()).toBe(archivedFolder.archivedAt);

      // List 1 archivedAt remains earlier
      const dbList1 = await prisma.list.findUnique({ where: { id: list1.id } });
      expect(new Date(dbList1!.archivedAt!).getTime()).toBeLessThan(
        new Date(archivedFolder.archivedAt).getTime(),
      );

      // 3. Unarchive folder -> list 2 unarchived, but list 1 was archived EARLIER so stays archived
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/folders/${folder.id}/unarchive`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      const dbList2After = await prisma.list.findUnique({ where: { id: list2.id } });
      expect(dbList2After?.archivedAt).toBeNull();

      const dbList1After = await prisma.list.findUnique({ where: { id: list1.id } });
      expect(dbList1After?.archivedAt).not.toBeNull();

      // 4. Archive space -> cascades to space, folder, list 2 with SAME timestamp
      const archivedSpace = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces/${space.id}/archive`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(200)
      ).body;

      const dbFolderInArchivedSpace = await prisma.folder.findUnique({
        where: { id: folder.id },
      });
      expect(dbFolderInArchivedSpace?.archivedAt?.toISOString()).toBe(
        archivedSpace.archivedAt,
      );

      // 5. Attempt to unarchive folder while space is archived -> 409
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/folders/${folder.id}/unarchive`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(409);

      // 6. Attempt mutation on archived entity -> 409
      await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspaceId}/spaces/${space.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Rename Archived' })
        .expect(409);

      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces/${space.id}/folders`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Child under archived' })
        .expect(409);

      // 7. GET ?includeArchived=false omits archived
      const spacesActive = (
        await request(app.getHttpServer())
          .get(`/api/v1/workspaces/${workspaceId}/spaces?includeArchived=false`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(200)
      ).body;
      expect(spacesActive).toHaveLength(0);

      const spacesAll = (
        await request(app.getHttpServer())
          .get(`/api/v1/workspaces/${workspaceId}/spaces?includeArchived=true`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(200)
      ).body;
      expect(spacesAll).toHaveLength(1);
    });
  });

  describe('Scenario 7: Permanent delete', () => {
    it('rejects unarchived deletion, enforces admin role, and cascades deletion', async () => {
      const { workspaceId, admin, member } = await createWorkspaceWithMembers();

      const space = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Temp Space' })
          .expect(201)
      ).body;

      const folder = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces/${space.id}/folders`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Temp Folder' })
          .expect(201)
      ).body;

      const list = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces/${space.id}/lists`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Temp List', folderId: folder.id })
          .expect(201)
      ).body;

      // 1. Attempt delete unarchived -> 409
      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceId}/spaces/${space.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(409);

      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceId}/folders/${folder.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(409);

      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceId}/lists/${list.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(409);

      // Archive space
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces/${space.id}/archive`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      // 2. MEMBER attempting delete -> 403
      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceId}/spaces/${space.id}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .expect(403);

      // 3. ADMIN permanently deletes space -> cascades
      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceId}/spaces/${space.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(204);

      expect(await prisma.space.findUnique({ where: { id: space.id } })).toBeNull();
      expect(await prisma.folder.findUnique({ where: { id: folder.id } })).toBeNull();
      expect(await prisma.list.findUnique({ where: { id: list.id } })).toBeNull();
      expect(await prisma.status.findMany({ where: { listId: list.id } })).toHaveLength(0);
    });
  });

  describe('Scenario 8: Reorder sequences', () => {
    it('reorders nodes monotonically and rejects non-adjacent bounds or invalid ids', async () => {
      const { workspaceId, admin } = await createWorkspaceWithMembers();

      const s1 = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Space 1' })
          .expect(201)
      ).body;

      const s2 = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Space 2' })
          .expect(201)
      ).body;

      const s3 = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Space 3' })
          .expect(201)
      ).body;

      const s4 = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Space 4' })
          .expect(201)
      ).body;

      // Reorder s4 between s1 and s2
      const reorderRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces/${s4.id}/reorder`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ prevId: s1.id, nextId: s2.id })
        .expect(200);

      expect(reorderRes.body.position > s1.position).toBe(true);
      expect(reorderRes.body.position < s2.position).toBe(true);

      // Verify all 4 are strictly monotonic in DB
      const allSpaces = await prisma.space.findMany({
        where: { workspaceId },
        orderBy: { position: 'asc' },
      });
      const order = allSpaces.map((s) => s.id);
      expect(order).toEqual([s1.id, s4.id, s2.id, s3.id]);

      // Reorder with non-adjacent bounds: s1 and s3 (s4 and s2 are between them) -> 400
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces/${s2.id}/reorder`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ prevId: s1.id, nextId: s3.id })
        .expect(400);

      // Reorder with unknown id -> 404
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/spaces/${s2.id}/reorder`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ prevId: '00000000-0000-0000-0000-000000000000' })
        .expect(404);
    });
  });

  describe('Scenario 9: Tree endpoint', () => {
    it('returns nested tree sorted by position ASC and executes at most 3 queries', async () => {
      const { workspaceId, admin } = await createWorkspaceWithMembers();

      const space1 = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Dev Space' })
          .expect(201)
      ).body;

      const folder1 = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces/${space1.id}/folders`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Sprint Folder' })
          .expect(201)
      ).body;

      const listInFolder = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces/${space1.id}/lists`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'Sprint Backlog', folderId: folder1.id })
          .expect(201)
      ).body;

      const listRoot = (
        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/spaces/${space1.id}/lists`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: 'General Board' })
          .expect(201)
      ).body;

      // Spies on prisma space, folder, list findMany
      const prismaService = app.get(PrismaService);
      const spaceFindSpy = vi.spyOn(prismaService.space, 'findMany');
      const folderFindSpy = vi.spyOn(prismaService.folder, 'findMany');
      const listFindSpy = vi.spyOn(prismaService.list, 'findMany');

      const treeRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/hierarchy?includeArchived=false`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      // Verify at most 3 queries were executed
      expect(spaceFindSpy).toHaveBeenCalledTimes(1);
      expect(folderFindSpy).toHaveBeenCalledTimes(1);
      expect(listFindSpy).toHaveBeenCalledTimes(1);

      // Clean up spies
      spaceFindSpy.mockRestore();
      folderFindSpy.mockRestore();
      listFindSpy.mockRestore();

      // Verify tree JSON structure
      const tree = treeRes.body;
      expect(Array.isArray(tree.spaces)).toBe(true);
      expect(tree.spaces).toHaveLength(1);

      const treeSpace = tree.spaces[0];
      expect(treeSpace.id).toBe(space1.id);
      expect(treeSpace.folders).toHaveLength(1);
      expect(treeSpace.folders[0].id).toBe(folder1.id);
      expect(treeSpace.folders[0].lists).toHaveLength(1);
      expect(treeSpace.folders[0].lists[0].id).toBe(listInFolder.id);

      expect(treeSpace.lists).toHaveLength(1);
      expect(treeSpace.lists[0].id).toBe(listRoot.id);
    });
  });
});
