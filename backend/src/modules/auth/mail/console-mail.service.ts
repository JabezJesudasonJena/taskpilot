import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service.js';

@Injectable()
export class ConsoleMailService extends MailService {
  private readonly logger = new Logger(ConsoleMailService.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    if (nodeEnv !== 'production') {
      const resetLink = `http://localhost:3000/api/v1/auth/reset-password?token=${token}`;
      this.logger.log(`[DEV/TEST EMAIL] Password Reset for ${email}: ${resetLink}`);
    }
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    if (nodeEnv !== 'production') {
      const verifyLink = `http://localhost:3000/api/v1/auth/verify-email?token=${token}`;
      this.logger.log(`[DEV/TEST EMAIL] Email Verification for ${email}: ${verifyLink}`);
    }
  }
}
