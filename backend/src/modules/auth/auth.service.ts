import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import ms from 'ms';
import { AuthRepository } from './auth.repository.js';
import { UsersService } from '../users/index.js';
import { MailService } from '../mail/index.js';
import { UserResponseDto } from '../../common/index.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { RefreshResponseDto } from './dto/refresh-response.dto.js';
import type { User } from '@prisma/client';

const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$dummyhashdummyhashdummy$dummyhashdummyhashdummyhashdummyhashdummyhash';

@Injectable()
export class AuthService {
  private readonly jwtAccessSecret: string;
  private readonly jwtAccessTtl: string;
  private readonly jwtRefreshTtl: string;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {
    this.jwtAccessSecret = this.configService.get<string>('JWT_ACCESS_SECRET')!;
    this.jwtAccessTtl = this.configService.get<string>('JWT_ACCESS_TTL') || '15m';
    this.jwtRefreshTtl = this.configService.get<string>('JWT_REFRESH_TTL') || '7d';
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private generateRandomToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  private getRefreshTtlMs(): number {
    const parsed = ms(this.jwtRefreshTtl as any);
    return typeof parsed === 'number' ? parsed : 7 * 24 * 60 * 60 * 1000;
  }

  private async generateAccessToken(userId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId },
      {
        secret: this.jwtAccessSecret,
        expiresIn: this.jwtAccessTtl as any,
      },
    );
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.usersService.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.usersService.create({
      email: normalizedEmail,
      passwordHash,
      name: dto.name,
    });

    const accessToken = await this.generateAccessToken(user.id);
    const rawRefreshToken = this.generateRandomToken();
    const refreshExpiresAt = new Date(Date.now() + this.getRefreshTtlMs());
    const familyId = crypto.randomUUID();

    await this.authRepository.createRefreshToken({
      userId: user.id,
      familyId,
      tokenHash: this.hashToken(rawRefreshToken),
      expiresAt: refreshExpiresAt,
    });

    // Create verification token and dispatch email
    const rawVerifyToken = this.generateRandomToken();
    const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.authRepository.createEmailVerificationToken({
      userId: user.id,
      tokenHash: this.hashToken(rawVerifyToken),
      expiresAt: verifyExpiresAt,
    });
    await this.mailService.sendVerificationEmail(user.email, rawVerifyToken);

    return {
      user: UserResponseDto.fromEntity(user),
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(normalizedEmail);

    if (!user) {
      // Dummy verify to prevent timing enumeration
      await argon2.verify(DUMMY_ARGON2_HASH, dto.password).catch(() => false);
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Unverified users can log in
    const accessToken = await this.generateAccessToken(user.id);
    const rawRefreshToken = this.generateRandomToken();
    const refreshExpiresAt = new Date(Date.now() + this.getRefreshTtlMs());
    const familyId = crypto.randomUUID();

    await this.authRepository.createRefreshToken({
      userId: user.id,
      familyId,
      tokenHash: this.hashToken(rawRefreshToken),
      expiresAt: refreshExpiresAt,
    });

    return {
      user: UserResponseDto.fromEntity(user),
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  async refresh(refreshToken: string): Promise<RefreshResponseDto> {
    const tokenHash = this.hashToken(refreshToken);
    const token = await this.authRepository.findRefreshTokenByHash(tokenHash);

    if (!token || token.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (token.revokedAt !== null || token.replacedById !== null) {
      // Reuse detected! Revoke every token in the family
      await this.authRepository.revokeFamily(token.familyId);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const rawNewRefreshToken = this.generateRandomToken();
    const newRefreshTokenHash = this.hashToken(rawNewRefreshToken);
    const refreshExpiresAt = new Date(Date.now() + this.getRefreshTtlMs());

    await this.authRepository.rotateRefreshToken({
      oldTokenId: token.id,
      newTokenData: {
        userId: token.userId,
        familyId: token.familyId,
        tokenHash: newRefreshTokenHash,
        expiresAt: refreshExpiresAt,
      },
    });

    const accessToken = await this.generateAccessToken(token.userId);

    return {
      accessToken,
      refreshToken: rawNewRefreshToken,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    const token = await this.authRepository.findRefreshTokenByHash(tokenHash);
    if (token) {
      await this.authRepository.revokeFamily(token.familyId);
    }
  }

  async forgotPassword(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(normalizedEmail);

    if (user) {
      await this.authRepository.invalidateUnusedPasswordResetTokens(user.id);

      const rawToken = this.generateRandomToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await this.authRepository.createPasswordResetToken({
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt,
      });

      await this.mailService.sendPasswordResetEmail(user.email, rawToken);
    }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = this.hashToken(dto.token);
    const resetToken =
      await this.authRepository.findPasswordResetTokenByHash(tokenHash);

    if (
      !resetToken ||
      resetToken.usedAt !== null ||
      resetToken.expiresAt < new Date()
    ) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const newPasswordHash = await argon2.hash(dto.newPassword);

    await this.authRepository.markPasswordResetTokenUsed(resetToken.id);
    await this.usersService.updatePassword(resetToken.userId, newPasswordHash);
    await this.authRepository.revokeAllUserTokens(resetToken.userId);
  }

  async verifyEmail(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const verificationToken =
      await this.authRepository.findEmailVerificationTokenByHash(tokenHash);

    if (
      !verificationToken ||
      verificationToken.usedAt !== null ||
      verificationToken.expiresAt < new Date()
    ) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.authRepository.markEmailVerificationTokenUsed(
      verificationToken.id,
    );
    await this.usersService.markEmailVerified(verificationToken.userId);
  }

  async resendVerification(user: User): Promise<void> {
    if (user.emailVerifiedAt) {
      return;
    }

    await this.authRepository.invalidateUnusedEmailVerificationTokens(user.id);

    const rawToken = this.generateRandomToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.authRepository.createEmailVerificationToken({
      userId: user.id,
      tokenHash: this.hashToken(rawToken),
      expiresAt,
    });

    await this.mailService.sendVerificationEmail(user.email, rawToken);
  }

  @OnEvent('auth.revoke-all-user-tokens')
  async handleRevokeAllUserTokens(payload: { userId: string }): Promise<void> {
    await this.authRepository.revokeAllUserTokens(payload.userId);
  }
}
