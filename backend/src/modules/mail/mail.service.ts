import type { WorkspaceRole } from '@prisma/client';

export interface SendWorkspaceInviteParams {
  to: string;
  workspaceName: string;
  inviterName: string;
  role: WorkspaceRole;
  link: string;
}

export abstract class MailService {
  abstract sendPasswordResetEmail(email: string, token: string): Promise<void>;
  abstract sendVerificationEmail(email: string, token: string): Promise<void>;
  abstract sendWorkspaceInvite(params: SendWorkspaceInviteParams): Promise<void>;
}
