import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { WorkspaceRole } from '@prisma/client';

export interface RequestWorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}

export const CurrentMember = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestWorkspaceMember => {
    const request = ctx.switchToHttp().getRequest();
    return request.workspaceMember;
  },
);
