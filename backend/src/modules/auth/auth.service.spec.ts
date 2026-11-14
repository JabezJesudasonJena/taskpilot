import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service.js';
import type { AuthRepository } from './auth.repository.js';
import type { UsersService } from '../users/index.js';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { MailService } from './mail/mail.service.js';
import type { User, RefreshToken, PasswordResetToken, EmailVerificationToken } from '@prisma/client';

describe('AuthService (Unit)', () => {
  let authService: AuthService;
  let authRepository: Partial<Record<keyof AuthRepository, any>>;
  let usersService: Partial<Record<keyof UsersService, any>>;
  let jwtService: Partial<Record<keyof JwtService, any>>;
  let configService: Partial<Record<keyof ConfigService, any>>;
  let mailService: Partial<Record<keyof MailService, any>>;

  const mockUser: User = {
    id: 'user-uuid-1',
    email: 'test@example.com',
    passwordHash: 'hashed_password_123',
    name: 'Test User',
    avatarUrl: null,
    emailVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    // Generate valid argon2 hash for mockUser
    mockUser.passwordHash = await argon2.hash('correct_password');

    authRepository = {
      createRefreshToken: vi.fn().mockResolvedValue({ id: 'rt-1' } as RefreshToken),
      findRefreshTokenByHash: vi.fn(),
      rotateRefreshToken: vi.fn().mockResolvedValue({ id: 'rt-2' } as RefreshToken),
      revokeFamily: vi.fn().mockResolvedValue(undefined),
      revokeAllUserTokens: vi.fn().mockResolvedValue(undefined),
      createPasswordResetToken: vi.fn().mockResolvedValue({ id: 'prt-1' } as PasswordResetToken),
      findPasswordResetTokenByHash: vi.fn(),
      markPasswordResetTokenUsed: vi.fn().mockResolvedValue(undefined),
      invalidateUnusedPasswordResetTokens: vi.fn().mockResolvedValue(undefined),
      createEmailVerificationToken: vi.fn().mockResolvedValue({ id: 'evt-1' } as EmailVerificationToken),
      findEmailVerificationTokenByHash: vi.fn(),
      markEmailVerificationTokenUsed: vi.fn().mockResolvedValue(undefined),
      invalidateUnusedEmailVerificationTokens: vi.fn().mockResolvedValue(undefined),
    };

    usersService = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      create: vi.fn().mockResolvedValue(mockUser),
      updatePassword: vi.fn().mockResolvedValue(undefined),
      markEmailVerified: vi.fn().mockResolvedValue(undefined),
    };

    jwtService = {
      signAsync: vi.fn().mockResolvedValue('mocked_jwt_access_token'),
    };

    configService = {
      get: vi.fn((key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test_access_secret';
        if (key === 'JWT_ACCESS_TTL') return '15m';
        if (key === 'JWT_REFRESH_TTL') return '7d';
        return null;
      }),
    };

    mailService = {
      sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
      sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    };

    authService = new AuthService(
      authRepository as unknown as AuthRepository,
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
      mailService as unknown as MailService,
    );
  });

  describe('register', () => {
    it('successfully registers a user, creates tokens, and sends verification email', async () => {
      usersService.findByEmail?.mockResolvedValue(null);

      const result = await authService.register({
        email: '  New@Example.COM  ',
        password: 'password123',
        name: 'New User',
      });

      expect(usersService.findByEmail).toHaveBeenCalledWith('new@example.com');
      expect(usersService.create).toHaveBeenCalled();
      expect(authRepository.createRefreshToken).toHaveBeenCalled();
      expect(authRepository.createEmailVerificationToken).toHaveBeenCalled();
      expect(mailService.sendVerificationEmail).toHaveBeenCalled();
      expect(result.accessToken).toBe('mocked_jwt_access_token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe(mockUser.email);
    });

    it('throws ConflictException if email already exists', async () => {
      usersService.findByEmail?.mockResolvedValue(mockUser);

      await expect(
        authService.register({
          email: 'test@example.com',
          password: 'password123',
          name: 'Existing User',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('successfully logs in with valid credentials', async () => {
      usersService.findByEmail?.mockResolvedValue(mockUser);

      const result = await authService.login({
        email: 'Test@example.com',
        password: 'correct_password',
      });

      expect(result.accessToken).toBe('mocked_jwt_access_token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user.id).toBe(mockUser.id);
    });

    it('rejects unknown email with 401 (Invalid credentials)', async () => {
      usersService.findByEmail?.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'unknown@example.com',
          password: 'any_password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects wrong password with 401', async () => {
      usersService.findByEmail?.mockResolvedValue(mockUser);

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'wrong_password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh token rotation & reuse detection', () => {
    it('successfully rotates a valid refresh token', async () => {
      const validToken: RefreshToken = {
        id: 'rt-1',
        userId: mockUser.id,
        familyId: 'family-uuid-1',
        tokenHash: 'hash-1',
        expiresAt: new Date(Date.now() + 60000),
        revokedAt: null,
        replacedById: null,
        createdAt: new Date(),
      };

      authRepository.findRefreshTokenByHash?.mockResolvedValue(validToken);

      const result = await authService.refresh('raw_refresh_token_1');

      expect(authRepository.rotateRefreshToken).toHaveBeenCalled();
      expect(result.accessToken).toBe('mocked_jwt_access_token');
      expect(result.refreshToken).toBeDefined();
    });

    it('throws 401 if refresh token is expired', async () => {
      const expiredToken: RefreshToken = {
        id: 'rt-expired',
        userId: mockUser.id,
        familyId: 'family-uuid-1',
        tokenHash: 'hash-expired',
        expiresAt: new Date(Date.now() - 10000),
        revokedAt: null,
        replacedById: null,
        createdAt: new Date(),
      };

      authRepository.findRefreshTokenByHash?.mockResolvedValue(expiredToken);

      await expect(authService.refresh('raw_expired_token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('detects reuse on already revoked/replaced token and revokes entire family', async () => {
      const reusedToken: RefreshToken = {
        id: 'rt-reused',
        userId: mockUser.id,
        familyId: 'family-compromised',
        tokenHash: 'hash-reused',
        expiresAt: new Date(Date.now() + 60000),
        revokedAt: new Date(),
        replacedById: 'rt-next',
        createdAt: new Date(),
      };

      authRepository.findRefreshTokenByHash?.mockResolvedValue(reusedToken);

      await expect(authService.refresh('raw_reused_token')).rejects.toThrow(
        UnauthorizedException,
      );

      // Must revoke the whole family
      expect(authRepository.revokeFamily).toHaveBeenCalledWith(
        'family-compromised',
      );
    });
  });

  describe('logout', () => {
    it('revokes the whole token family upon logout', async () => {
      const token: RefreshToken = {
        id: 'rt-logout',
        userId: mockUser.id,
        familyId: 'family-logout',
        tokenHash: 'hash-logout',
        expiresAt: new Date(Date.now() + 60000),
        revokedAt: null,
        replacedById: null,
        createdAt: new Date(),
      };

      authRepository.findRefreshTokenByHash?.mockResolvedValue(token);

      await authService.logout('raw_logout_token');

      expect(authRepository.revokeFamily).toHaveBeenCalledWith('family-logout');
    });
  });

  describe('forgotPassword & resetPassword', () => {
    it('forgotPassword invalidates previous tokens and dispatches reset link', async () => {
      usersService.findByEmail?.mockResolvedValue(mockUser);

      await authService.forgotPassword('test@example.com');

      expect(
        authRepository.invalidateUnusedPasswordResetTokens,
      ).toHaveBeenCalledWith(mockUser.id);
      expect(authRepository.createPasswordResetToken).toHaveBeenCalled();
      expect(mailService.sendPasswordResetEmail).toHaveBeenCalled();
    });

    it('resetPassword updates password, marks token used, and revokes all user tokens', async () => {
      const resetToken: PasswordResetToken = {
        id: 'prt-valid',
        userId: mockUser.id,
        tokenHash: 'hash-prt',
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null,
        createdAt: new Date(),
      };

      authRepository.findPasswordResetTokenByHash?.mockResolvedValue(resetToken);

      await authService.resetPassword({
        token: 'raw_reset_token',
        newPassword: 'brandNewPassword123',
      });

      expect(authRepository.markPasswordResetTokenUsed).toHaveBeenCalledWith(
        'prt-valid',
      );
      expect(usersService.updatePassword).toHaveBeenCalled();
      expect(authRepository.revokeAllUserTokens).toHaveBeenCalledWith(
        mockUser.id,
      );
    });

    it('resetPassword throws 400 if token is already used', async () => {
      const usedToken: PasswordResetToken = {
        id: 'prt-used',
        userId: mockUser.id,
        tokenHash: 'hash-used',
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: new Date(),
        createdAt: new Date(),
      };

      authRepository.findPasswordResetTokenByHash?.mockResolvedValue(usedToken);

      await expect(
        authService.resetPassword({
          token: 'raw_used_token',
          newPassword: 'brandNewPassword123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('resetPassword throws 400 if token is expired', async () => {
      const expiredToken: PasswordResetToken = {
        id: 'prt-expired',
        userId: mockUser.id,
        tokenHash: 'hash-expired',
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
        createdAt: new Date(),
      };

      authRepository.findPasswordResetTokenByHash?.mockResolvedValue(
        expiredToken,
      );

      await expect(
        authService.resetPassword({
          token: 'raw_expired_token',
          newPassword: 'brandNewPassword123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyEmail', () => {
    it('marks token used and verifies user email', async () => {
      const verifyToken: EmailVerificationToken = {
        id: 'evt-valid',
        userId: mockUser.id,
        tokenHash: 'hash-evt',
        expiresAt: new Date(Date.now() + 86400000),
        usedAt: null,
        createdAt: new Date(),
      };

      authRepository.findEmailVerificationTokenByHash?.mockResolvedValue(
        verifyToken,
      );

      await authService.verifyEmail('raw_verify_token');

      expect(authRepository.markEmailVerificationTokenUsed).toHaveBeenCalledWith(
        'evt-valid',
      );
      expect(usersService.markEmailVerified).toHaveBeenCalledWith(mockUser.id);
    });

    it('throws 400 if verification token is invalid or already used', async () => {
      authRepository.findEmailVerificationTokenByHash?.mockResolvedValue(null);

      await expect(
        authService.verifyEmail('invalid_token'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
