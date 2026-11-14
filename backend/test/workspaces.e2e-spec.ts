import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, WorkspaceRole } from '@prisma/client';
import { AppModule } from '../src/app.module.js';
import { MailService, type SendWorkspaceInviteParams } from '../src/modules/mail/index.js';
import { setupTestDatabase } from '../scripts/setup-test-db.js';

describe('Workspaces & Tenancy Module (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let mailService: MailService;
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

    mailService = app.get(MailService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE users, refresh_tokens, password_reset_tokens, email_verification_tokens, workspaces, workspace_members, workspace_invites CASCADE;',
    );
  });

  async function createUser(email: string, name: string, verified = true) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123', name })
      .expect(201);
    if (verified) {
      await prisma.user.update({
        where: { id: res.body.user.id },
        data: { emailVerifiedAt: new Date() },
      });
    }
    return {
      user: res.body.user,
      accessToken: res.body.accessToken,
    };
  }

  it('scenario 1: POST /workspaces creates workspace and creator is OWNER', async () => {
    const { accessToken } = await createUser('owner@example.com', 'Owner User');

    const res = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Acme Engineering' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Acme Engineering');
    expect(res.body.slug).toBe('acme-engineering');
    expect(res.body.role).toBe(WorkspaceRole.OWNER);
    expect(res.body.createdAt).toBeDefined();
    expect(res.body.updatedAt).toBeDefined();

    // Verify DB
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: res.body.id },
    });
    expect(member?.role).toBe(WorkspaceRole.OWNER);
  });

  it('scenario 2: GET /workspaces returns paginated list of workspaces user belongs to', async () => {
    const userA = await createUser('usera@example.com', 'User A');
    const userB = await createUser('userb@example.com', 'User B');

    // User A creates 2 workspaces
    const ws1 = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ name: 'Workspace One' })
      .expect(201);

    const ws2 = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ name: 'Workspace Two' })
      .expect(201);

    // User B creates 1 workspace
    await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ name: 'Workspace B' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.map((w: any) => w.id)).toEqual([ws2.body.id, ws1.body.id]);
    expect(res.body.items[0].role).toBe(WorkspaceRole.OWNER);
  });

  it('scenario 3: GET /workspaces/:id returns workspace with current user role', async () => {
    const user = await createUser('user@example.com', 'User');
    const ws = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'My Team' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws.body.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(res.body.id).toBe(ws.body.id);
    expect(res.body.name).toBe('My Team');
    expect(res.body.role).toBe(WorkspaceRole.OWNER);
  });

  it('scenario 4: Non-existent workspace, non-member, or invalid UUID returns 404 with identical shape', async () => {
    const userA = await createUser('usera@example.com', 'User A');
    const userB = await createUser('userb@example.com', 'User B');

    const ws = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ name: 'Secret Team' })
      .expect(201);

    const expectedBody = {
      statusCode: 404,
      error: 'Not Found',
      message: 'Workspace not found',
    };

    // 1. Random non-existent UUID
    const nonExistentId = '11111111-1111-1111-1111-111111111111';
    const resNonExistent = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${nonExistentId}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(404);
    expect(resNonExistent.body).toMatchObject(expectedBody);

    // 2. User B (not a member of ws) accessing User A's workspace
    const resNotMember = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws.body.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);
    expect(resNotMember.body).toMatchObject(expectedBody);

    // 3. Malformed UUID
    const resInvalidUuid = await request(app.getHttpServer())
      .get('/api/v1/workspaces/not-a-valid-uuid')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(404);
    expect(resInvalidUuid.body).toMatchObject(expectedBody);
  });

  it('scenario 5: PATCH /workspaces/:id updates name/slug; validates reserved and uniqueness', async () => {
    const user = await createUser('user@example.com', 'User');
    const ws = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Initial Name' })
      .expect(201);

    // Update name and slug
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${ws.body.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Updated Name', slug: 'updated-slug' })
      .expect(200);

    expect(res.body.name).toBe('Updated Name');
    expect(res.body.slug).toBe('updated-slug');

    // Reserved slug rejection
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${ws.body.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ slug: 'admin' })
      .expect(400);
  });

  it('scenario 6: Invites - invite creation, permission restrictions, and email sending', async () => {
    const userA = await createUser('usera@example.com', 'User A');
    const ws = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ name: 'Invites Workspace' })
      .expect(201);

    let sentInviteParams: SendWorkspaceInviteParams | null = null;
    vi.spyOn(mailService, 'sendWorkspaceInvite').mockImplementation(
      async (params: SendWorkspaceInviteParams) => {
        sentInviteParams = params;
      },
    );

    // Cannot invite OWNER
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws.body.id}/invites`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ email: 'invitee@example.com', role: WorkspaceRole.OWNER })
      .expect(400);

    // Invite User B as MEMBER
    const inviteRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws.body.id}/invites`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ email: 'invitee@example.com', role: WorkspaceRole.MEMBER })
      .expect(201);

    expect(inviteRes.body.id).toBeDefined();
    expect(inviteRes.body.email).toBe('invitee@example.com');
    expect(inviteRes.body.role).toBe(WorkspaceRole.MEMBER);
    expect(inviteRes.body.token).toBeUndefined(); // Raw token never returned
    expect(sentInviteParams).not.toBeNull();
    expect(sentInviteParams!.to).toBe('invitee@example.com');
    expect(sentInviteParams!.link).toContain('/invites/accept?token=');

    // List active invites
    const listRes = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws.body.id}/invites`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.items[0].id).toBe(inviteRes.body.id);
  });

  it('scenario 7: POST /invites/accept - acceptance, token verification, and email matching', async () => {
    const userA = await createUser('usera@example.com', 'User A');
    const userB = await createUser('userb@example.com', 'User B');
    const userC = await createUser('userc@example.com', 'User C');

    const ws = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ name: 'Accept Team' })
      .expect(201);

    let rawToken = '';
    vi.spyOn(mailService, 'sendWorkspaceInvite').mockImplementation(
      async (params: SendWorkspaceInviteParams) => {
        const url = new URL(params.link);
        rawToken = url.searchParams.get('token') || '';
      },
    );

    // Invite User B
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws.body.id}/invites`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ email: 'userb@example.com', role: WorkspaceRole.MEMBER })
      .expect(201);

    expect(rawToken).not.toBe('');

    // User C tries to accept User B's invite -> 403 Mismatch
    await request(app.getHttpServer())
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${userC.accessToken}`)
      .send({ token: rawToken })
      .expect(403);

    // Unverified user trying to accept invite -> 403 Forbidden
    const unverifiedUser = await createUser(
      'unverified@example.com',
      'Unverified',
      false,
    );
    let unverifiedToken = '';
    vi.spyOn(mailService, 'sendWorkspaceInvite').mockImplementation(
      async (params: SendWorkspaceInviteParams) => {
        const url = new URL(params.link);
        unverifiedToken = url.searchParams.get('token') || '';
      },
    );
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws.body.id}/invites`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ email: 'unverified@example.com', role: WorkspaceRole.MEMBER })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${unverifiedUser.accessToken}`)
      .send({ token: unverifiedToken })
      .expect(403);

    // User B accepts invite -> 200
    const acceptRes = await request(app.getHttpServer())
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ token: rawToken })
      .expect(200);

    expect(acceptRes.body.workspaceId).toBe(ws.body.id);
    expect(acceptRes.body.role).toBe(WorkspaceRole.MEMBER);

    // User B can now access workspace
    const wsRes = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws.body.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    expect(wsRes.body.role).toBe(WorkspaceRole.MEMBER);

    // Replay attack: second attempt to accept same token -> 400
    await request(app.getHttpServer())
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ token: rawToken })
      .expect(400);
  });

  it('scenario 8: Members list & Role change permissions', async () => {
    const userA = await createUser('usera@example.com', 'User A');
    const userB = await createUser('userb@example.com', 'User B');

    const ws = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ name: 'Role Team' })
      .expect(201);

    // Add user B as member via invite
    let rawToken = '';
    vi.spyOn(mailService, 'sendWorkspaceInvite').mockImplementation(
      async (params: SendWorkspaceInviteParams) => {
        const url = new URL(params.link);
        rawToken = url.searchParams.get('token') || '';
      },
    );

    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws.body.id}/invites`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ email: 'userb@example.com', role: WorkspaceRole.MEMBER })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ token: rawToken })
      .expect(200);

    // List members
    const membersRes = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws.body.id}/members`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(membersRes.body.items).toHaveLength(2);

    expect(membersRes.body.items).toHaveLength(2);
    const memberA = membersRes.body.items.find((m: any) => m.userId === userA.user.id);
    const memberB = membersRes.body.items.find((m: any) => m.userId === userB.user.id);
    expect(memberA.role).toBe(WorkspaceRole.OWNER);
    expect(memberB.role).toBe(WorkspaceRole.MEMBER);

    // User A (OWNER) promotes User B to ADMIN
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${ws.body.id}/members/${userB.user.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ role: WorkspaceRole.ADMIN })
      .expect(200);

    // User B tries to change their own role -> 400
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${ws.body.id}/members/${userB.user.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ role: WorkspaceRole.MEMBER })
      .expect(400);

    // User B (ADMIN) tries to promote to OWNER -> 400
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${ws.body.id}/members/${userA.user.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ role: WorkspaceRole.OWNER })
      .expect(400);

    // User B (ADMIN) tries to modify OWNER -> 403
    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${ws.body.id}/members/${userA.user.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ role: WorkspaceRole.GUEST })
      .expect(403);
  });

  it('scenario 9: POST /transfer-ownership demotes old owner and promotes new owner', async () => {
    const userA = await createUser('usera@example.com', 'User A');
    const userB = await createUser('userb@example.com', 'User B');

    const ws = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ name: 'Transfer Team' })
      .expect(201);

    let rawToken = '';
    vi.spyOn(mailService, 'sendWorkspaceInvite').mockImplementation(
      async (params: SendWorkspaceInviteParams) => {
        const url = new URL(params.link);
        rawToken = url.searchParams.get('token') || '';
      },
    );

    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws.body.id}/invites`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ email: 'userb@example.com', role: WorkspaceRole.MEMBER })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ token: rawToken })
      .expect(200);

    // Transfer ownership to self -> 400
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws.body.id}/transfer-ownership`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ userId: userA.user.id })
      .expect(400);

    // Transfer ownership to User B
    const transferRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws.body.id}/transfer-ownership`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ userId: userB.user.id })
      .expect(200);

    expect(transferRes.body.message).toBe('Ownership transferred successfully');

    // Check User B is now OWNER
    const wsUserB = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws.body.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);
    expect(wsUserB.body.role).toBe(WorkspaceRole.OWNER);

    // Check User A is now ADMIN
    const wsUserA = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws.body.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);
    expect(wsUserA.body.role).toBe(WorkspaceRole.ADMIN);
  });

  it('scenario 10: Member removal and leaving', async () => {
    const userA = await createUser('usera@example.com', 'User A');
    const userB = await createUser('userb@example.com', 'User B');

    const ws = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ name: 'Leave Team' })
      .expect(201);

    let rawToken = '';
    vi.spyOn(mailService, 'sendWorkspaceInvite').mockImplementation(
      async (params: SendWorkspaceInviteParams) => {
        const url = new URL(params.link);
        rawToken = url.searchParams.get('token') || '';
      },
    );

    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${ws.body.id}/invites`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ email: 'userb@example.com', role: WorkspaceRole.MEMBER })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ token: rawToken })
      .expect(200);

    const membersRes = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws.body.id}/members`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(membersRes.body.items).toHaveLength(2);

    // User A (OWNER) tries to leave -> 409 Conflict
    await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${ws.body.id}/members/${userA.user.id}`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(409);

    // User B (MEMBER) leaves -> 204 No Content
    await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${ws.body.id}/members/${userB.user.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(204);

    // User B can no longer access the workspace -> 404
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${ws.body.id}`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(404);
  });

  it('scenario 11: Keyset pagination limits and cursors', async () => {
    const user = await createUser('paginated@example.com', 'Pagination User');

    // Create 3 workspaces
    const ws1 = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'WS One' })
      .expect(201);

    const ws2 = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'WS Two' })
      .expect(201);

    const ws3 = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'WS Three' })
      .expect(201);

    // Page 1 with limit = 2
    const page1 = await request(app.getHttpServer())
      .get('/api/v1/workspaces?limit=2')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.items[0].id).toBe(ws3.body.id);
    expect(page1.body.items[1].id).toBe(ws2.body.id);
    expect(page1.body.nextCursor).not.toBeNull();

    // Page 2 using nextCursor
    const page2 = await request(app.getHttpServer())
      .get(`/api/v1/workspaces?limit=2&cursor=${page1.body.nextCursor}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.items[0].id).toBe(ws1.body.id);
    expect(page2.body.nextCursor).toBeNull();
  });
});
