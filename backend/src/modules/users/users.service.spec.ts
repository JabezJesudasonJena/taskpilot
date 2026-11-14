import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UsersService } from './users.service.js';
import type { UsersRepository } from './users.repository.js';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { User } from '@prisma/client';

describe('UsersService (Unit)', () => {
  let usersService: UsersService;
  let usersRepository: Partial<Record<keyof UsersRepository, any>>;
  let eventEmitter: Partial<Record<keyof EventEmitter2, any>>;

  const mockUser: User = {
    id: '01a1d4fb-6318-7c53-b5b0-ebb3449ba892',
    email: 'user@example.com',
    passwordHash: '',
    name: 'Existing Name',
    avatarUrl: null,
    emailVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockUser.passwordHash = await argon2.hash('currentPassword123');

    usersRepository = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
    };

    usersService = new UsersService(
      usersRepository as unknown as UsersRepository,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  describe('updateMe', () => {
    it('successfully updates user profile name and avatarUrl', async () => {
      usersRepository.update?.mockResolvedValue({
        ...mockUser,
        name: 'Updated Name',
        avatarUrl: 'https://example.com/avatar.png',
      });

      const result = await usersService.updateMe(mockUser.id, {
        name: '  Updated Name  ',
        avatarUrl: '  https://example.com/avatar.png  ',
      });

      expect(usersRepository.update).toHaveBeenCalledWith(mockUser.id, {
        name: 'Updated Name',
        avatarUrl: 'https://example.com/avatar.png',
      });
      expect(result.name).toBe('Updated Name');
      expect(result.avatarUrl).toBe('https://example.com/avatar.png');
    });
  });

  describe('changePassword', () => {
    it('successfully changes password and emits token revocation event', async () => {
      usersRepository.findById?.mockResolvedValue(mockUser);
      usersRepository.update?.mockResolvedValue(mockUser);

      await usersService.changePassword(mockUser.id, {
        currentPassword: 'currentPassword123',
        newPassword: 'newValidPassword123',
      });

      expect(usersRepository.update).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'auth.revoke-all-user-tokens',
        { userId: mockUser.id },
      );
    });

    it('throws BadRequestException when current password is wrong', async () => {
      usersRepository.findById?.mockResolvedValue(mockUser);

      await expect(
        usersService.changePassword(mockUser.id, {
          currentPassword: 'wrongPassword123',
          newPassword: 'newValidPassword123',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(usersRepository.update).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when user is not found', async () => {
      usersRepository.findById?.mockResolvedValue(null);

      await expect(
        usersService.changePassword('non-existent-id', {
          currentPassword: 'currentPassword123',
          newPassword: 'newValidPassword123',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
