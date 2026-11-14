import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module.js';
import { setupTestDatabase } from '../scripts/setup-test-db.js';

describe('Step 3: Delete With Tasks Check (e2e)', () => {
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
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE users, refresh_tokens, password_reset_tokens, email_verification_tokens, workspaces, workspace_members, workspace_invites, spaces, folders, lists, statuses, tasks CASCADE;',
    );
  });

  async function createAdminUser() {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'admin@example.com', password: 'password123', name: 'Admin User' })
      .expect(201);

    await prisma.user.update({
      where: { id: res.body.user.id },
      data: { emailVerifiedAt: new Date() },
    });

    return { user: res.body.user, accessToken: res.body.accessToken };
  }

  it('checks list deletion when list contains a task', async () => {
    const { user, accessToken } = await createAdminUser();

    // 1. Create workspace
    const wsRes = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Task WS' })
      .expect(201);
    const workspaceId = wsRes.body.id;

    // 2. Create space
    const spaceRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/spaces`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Space 1' })
      .expect(201);
    const spaceId = spaceRes.body.id;

    // 3. Create folder
    const folderRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/spaces/${spaceId}/folders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Folder 1' })
      .expect(201);
    const folderId = folderRes.body.id;

    // 4. Create list in folder
    const listRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/spaces/${spaceId}/lists`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'List 1', folderId })
      .expect(201);
    const listId = listRes.body.id;

    // 5. Get default OPEN status
    const statuses = await prisma.status.findMany({
      where: { listId },
    });
    expect(statuses.length).toBeGreaterThan(0);
    const statusId = statuses[0].id;

    // 6. Insert task directly via Prisma
    const task = await prisma.task.create({
      data: {
        workspaceId,
        listId,
        statusId,
        title: 'Directly Inserted Task',
        position: 'a0',
        creatorId: user.id,
      },
    });
    expect(task.id).toBeDefined();

    // 7. Archive the list
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/lists/${listId}/archive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // 8. Permanently delete the list
    const delRes = await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${workspaceId}/lists/${listId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(delRes.status).toBe(204);

    // Verify task is deleted by list cascade
    const remainingTask = await prisma.task.findUnique({ where: { id: task.id } });
    expect(remainingTask).toBeNull();
  });

  it('checks folder deletion when folder contains a list with a task', async () => {
    const { user, accessToken } = await createAdminUser();

    const wsRes = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Folder Task WS' })
      .expect(201);
    const workspaceId = wsRes.body.id;

    const spaceRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/spaces`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Space 1' })
      .expect(201);
    const spaceId = spaceRes.body.id;

    const folderRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/spaces/${spaceId}/folders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Folder 1' })
      .expect(201);
    const folderId = folderRes.body.id;

    const listRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/spaces/${spaceId}/lists`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'List 1', folderId })
      .expect(201);
    const listId = listRes.body.id;

    const statuses = await prisma.status.findMany({ where: { listId } });
    const task = await prisma.task.create({
      data: {
        workspaceId,
        listId,
        statusId: statuses[0].id,
        title: 'Task in Folder List',
        position: 'a0',
        creatorId: user.id,
      },
    });

    // Archive folder
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/folders/${folderId}/archive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Delete folder
    const delRes = await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${workspaceId}/folders/${folderId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(delRes.status).toBe(204);

    const remainingTask = await prisma.task.findUnique({ where: { id: task.id } });
    expect(remainingTask).toBeNull();
  });

  it('checks space deletion when space contains a list with a task', async () => {
    const { user, accessToken } = await createAdminUser();

    const wsRes = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Space Task WS' })
      .expect(201);
    const workspaceId = wsRes.body.id;

    const spaceRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/spaces`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Space 1' })
      .expect(201);
    const spaceId = spaceRes.body.id;

    const listRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/spaces/${spaceId}/lists`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Root List' })
      .expect(201);
    const listId = listRes.body.id;

    const statuses = await prisma.status.findMany({ where: { listId } });
    const task = await prisma.task.create({
      data: {
        workspaceId,
        listId,
        statusId: statuses[0].id,
        title: 'Task in Space Root List',
        position: 'a0',
        creatorId: user.id,
      },
    });

    // Archive space
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/spaces/${spaceId}/archive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Delete space
    const delRes = await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${workspaceId}/spaces/${spaceId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(delRes.status).toBe(204);

    const remainingTask = await prisma.task.findUnique({ where: { id: task.id } });
    expect(remainingTask).toBeNull();
  });
});
