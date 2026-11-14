import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module.js';
import { MailService } from '../src/modules/mail/index.js';
import { setupTestDatabase } from '../scripts/setup-test-db.js';

describe('Auth & Users Module (e2e)', () => {
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
    // Truncate tables between tests
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE users, refresh_tokens, password_reset_tokens, email_verification_tokens CASCADE;',
    );
  });

  it('scenario 1: register -> login -> GET /users/me', async () => {
    const registerPayload = {
      email: 'user1@example.com',
      password: 'password123',
      name: 'User One',
    };

    // 1. Register
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registerPayload)
      .expect(201);

    expect(regRes.body.user).toBeDefined();
    expect(regRes.body.user.email).toBe('user1@example.com');
    expect(regRes.body.user.name).toBe('User One');
    expect(regRes.body.user.passwordHash).toBeUndefined();
    expect(regRes.body.accessToken).toBeDefined();
    expect(regRes.body.refreshToken).toBeDefined();

    // 2. Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'user1@example.com',
        password: 'password123',
      })
      .expect(200);

    expect(loginRes.body.accessToken).toBeDefined();
    const accessToken = loginRes.body.accessToken;

    // 3. GET /users/me
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(meRes.body.email).toBe('user1@example.com');
    expect(meRes.body.name).toBe('User One');
    expect(meRes.body.passwordHash).toBeUndefined();
  });

  it('scenario 2: duplicate email returns 409', async () => {
    const payload = {
      email: 'duplicate@example.com',
      password: 'password123',
      name: 'Original',
    };

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(payload)
      .expect(201);

    const dupRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(payload)
      .expect(409);

    expect(dupRes.body.statusCode).toBe(409);
    expect(dupRes.body.error).toBe('Conflict');
  });

  it('scenario 3: wrong password and unknown email both return 401 with the same body structure', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'known@example.com',
        password: 'correctPassword123',
        name: 'Known User',
      })
      .expect(201);

    const unknownRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'unknown@example.com',
        password: 'anyPassword123',
      })
      .expect(401);

    const wrongPassRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'known@example.com',
        password: 'wrongPassword123',
      })
      .expect(401);

    expect(unknownRes.body.statusCode).toBe(401);
    expect(unknownRes.body.error).toBe('Unauthorized');
    expect(unknownRes.body.message).toBe('Invalid credentials');

    expect(wrongPassRes.body.statusCode).toBe(401);
    expect(wrongPassRes.body.error).toBe('Unauthorized');
    expect(wrongPassRes.body.message).toBe('Invalid credentials');
  });

  it('scenario 4: refresh works and the old token then fails', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'refresh@example.com',
        password: 'password123',
        name: 'Refresher',
      })
      .expect(201);

    const oldRefreshToken = regRes.body.refreshToken;

    // 1. Refresh succeeds
    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(200);

    expect(refreshRes.body.accessToken).toBeDefined();
    expect(refreshRes.body.refreshToken).toBeDefined();
    expect(refreshRes.body.refreshToken).not.toBe(oldRefreshToken);

    // 2. Old token now fails
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(401);
  });

  it('scenario 5: reusing an already-rotated token returns 401 AND the newly issued token stops working', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'reuse@example.com',
        password: 'password123',
        name: 'Reuser',
      })
      .expect(201);

    const token1 = regRes.body.refreshToken;

    // Rotate token1 -> token2
    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: token1 })
      .expect(200);

    const token2 = refreshRes.body.refreshToken;

    // Replay attack: try using token1 again -> 401 and family is revoked
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: token1 })
      .expect(401);

    // Now token2 should also be dead because the family was compromised
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: token2 })
      .expect(401);
  });

  it('scenario 6: logout revokes token family', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'logout@example.com',
        password: 'password123',
        name: 'Logouter',
      })
      .expect(201);

    const refreshToken = regRes.body.refreshToken;

    // Logout
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken })
      .expect(204);

    // Refresh after logout fails
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('scenario 7: forgot -> reset -> login with the new password, and old refresh tokens are dead', async () => {
    let capturedResetToken = '';
    vi.spyOn(mailService, 'sendPasswordResetEmail').mockImplementation(
      async (_email: string, token: string) => {
        capturedResetToken = token;
      },
    );

    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'resetme@example.com',
        password: 'oldPassword123',
        name: 'Resetter',
      })
      .expect(201);

    const oldRefreshToken = regRes.body.refreshToken;

    // Forgot password
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'resetme@example.com' })
      .expect(202);

    expect(capturedResetToken).toBeTruthy();

    // Reset password
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({
        token: capturedResetToken,
        newPassword: 'newPassword123',
      })
      .expect(204);

    // Old password fails
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'resetme@example.com',
        password: 'oldPassword123',
      })
      .expect(401);

    // New password succeeds
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'resetme@example.com',
        password: 'newPassword123',
      })
      .expect(200);

    // Old refresh tokens are dead
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(401);
  });

  it('scenario 8: change-password', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'changepass@example.com',
        password: 'initialPassword123',
        name: 'Password Changer',
      })
      .expect(201);

    const accessToken = regRes.body.accessToken;
    const oldRefreshToken = regRes.body.refreshToken;

    // Login a second time to create a second session/family
    const login2Res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'changepass@example.com',
        password: 'initialPassword123',
      })
      .expect(200);
    const session2RefreshToken = login2Res.body.refreshToken;

    // Change password
    await request(app.getHttpServer())
      .post('/api/v1/users/me/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: 'initialPassword123',
        newPassword: 'updatedPassword123',
      })
      .expect(204);

    // Old password fails
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'changepass@example.com',
        password: 'initialPassword123',
      })
      .expect(401);

    // New password succeeds
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'changepass@example.com',
        password: 'updatedPassword123',
      })
      .expect(200);

    // ALL of that user's refresh tokens across families are dead
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session2RefreshToken })
      .expect(401);
  });

  it('scenario 9: PATCH /users/me', async () => {
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'patch@example.com',
        password: 'password123',
        name: 'Initial Name',
      })
      .expect(201);

    const accessToken = regRes.body.accessToken;

    const patchRes = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Updated Jane',
        avatarUrl: 'https://example.com/avatar.jpg',
      })
      .expect(200);

    expect(patchRes.body.name).toBe('Updated Jane');
    expect(patchRes.body.avatarUrl).toBe('https://example.com/avatar.jpg');

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(meRes.body.name).toBe('Updated Jane');
    expect(meRes.body.avatarUrl).toBe('https://example.com/avatar.jpg');
  });

  it('scenario 10: missing or invalid JWT returns 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer invalid.bogus.jwt')
      .expect(401);
  });

  it('scenario 11: validation errors return 400 in the standard format', async () => {
    const invalidRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'not-an-email',
        password: 'short',
      })
      .expect(400);

    expect(invalidRes.body.statusCode).toBe(400);
    expect(invalidRes.body.error).toBe('Bad Request');
    expect(invalidRes.body.message).toBe('Validation failed');
    expect(invalidRes.body.details).toBeDefined();
    expect(Array.isArray(invalidRes.body.details)).toBe(true);
    expect(invalidRes.body.path).toBe('/api/v1/auth/register');
    expect(invalidRes.body.timestamp).toBeDefined();
  });

  it('scenario 12: verify-email and resend-verification', async () => {
    let capturedVerifyToken = '';
    vi.spyOn(mailService, 'sendVerificationEmail').mockImplementation(
      async (_email: string, token: string) => {
        capturedVerifyToken = token;
      },
    );

    // Register user
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'verifytest@example.com',
        password: 'password123',
        name: 'Verify Test User',
      })
      .expect(201);

    expect(capturedVerifyToken).toBeTruthy();
    const tokenToVerify = capturedVerifyToken;
    const accessToken = regRes.body.accessToken;

    // Check before verification: emailVerifiedAt is null
    const meBefore = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(meBefore.body.emailVerifiedAt).toBeNull();

    // Verify email with invalid token -> 400
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: 'invalid_dummy_token' })
      .expect(400);

    // Verify email with valid token -> 204
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: tokenToVerify })
      .expect(204);

    // Verify email a second time -> 400 (single-use)
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: tokenToVerify })
      .expect(400);

    // Check after verification: emailVerifiedAt is set
    const meAfter = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(meAfter.body.emailVerifiedAt).toBeTruthy();

    // Resend verification when already verified -> 202
    await request(app.getHttpServer())
      .post('/api/v1/auth/resend-verification')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(202);

    // Unverified user resend verification test
    const unverifiedReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'resendtest@example.com',
        password: 'password123',
        name: 'Resend Test User',
      })
      .expect(201);

    capturedVerifyToken = '';
    await request(app.getHttpServer())
      .post('/api/v1/auth/resend-verification')
      .set('Authorization', `Bearer ${unverifiedReg.body.accessToken}`)
      .expect(202);

    expect(capturedVerifyToken).toBeTruthy();
  });

  it('scenario 13: GET /api/v1/health is reachable without token, other routes protected', async () => {
    // Health is public
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    // Protected route without token returns 401
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .expect(401);
  });
});
