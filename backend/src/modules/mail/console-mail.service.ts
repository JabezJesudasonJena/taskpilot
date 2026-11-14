import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService, type SendWorkspaceInviteParams } from './mail.service.js';

@Injectable()
export class ConsoleMailService extends MailService {
  private readonly logger = new Logger(ConsoleMailService.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    if (nodeEnv !== 'production') {
      const appUrl =
        this.configService.get<string>('APP_URL') || 'http://localhost:3001';
      const resetLink = `${appUrl}/reset-password?token=${token}`;
      this.logger.log(
        `[DEV/TEST EMAIL] Password Reset for ${email}: ${resetLink}`,
      );
    }
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    if (nodeEnv !== 'production') {
      const appUrl =
        this.configService.get<string>('APP_URL') || 'http://localhost:3001';
      const verifyLink = `${appUrl}/verify-email?token=${token}`;
      this.logger.log(
        `[DEV/TEST EMAIL] Email Verification for ${email}: ${verifyLink}`,
      );
    }
  }

  async sendWorkspaceInvite(params: SendWorkspaceInviteParams): Promise<void> {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    if (nodeEnv !== 'production') {
      this.logger.log(
        `[DEV/TEST EMAIL] Workspace Invite to ${params.to} for workspace "${params.workspaceName}" as ${params.role} by ${params.inviterName}: ${params.link}`,
      );
    }
  }
}
