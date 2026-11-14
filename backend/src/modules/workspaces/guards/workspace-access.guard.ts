import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WorkspaceRole } from '@prisma/client';
import { WorkspacesRepository } from '../workspaces.repository.js';
import { WORKSPACE_ROLES_KEY } from '../decorators/workspace-roles.decorator.js';
import { hasAtLeast } from '../../../common/index.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class WorkspaceAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const workspaceId = request.params?.workspaceId;

    // If route has no :workspaceId parameter, guard does not apply
    if (!workspaceId) {
      return true;
    }

    // Secure by default: invalid UUID returns 404 to avoid leaking existence
    if (!UUID_REGEX.test(workspaceId)) {
      throw new NotFoundException('Workspace not found');
    }

    const user = request.user;
    if (!user || !user.id) {
      throw new NotFoundException('Workspace not found');
    }

    // Verify membership
    const member = await this.workspacesRepository.findMembership(
      workspaceId,
      user.id,
    );

    if (!member) {
      throw new NotFoundException('Workspace not found');
    }

    // Attach membership context
    request.workspaceMember = {
      workspaceId: member.workspaceId,
      userId: member.userId,
      role: member.role,
    };

    // Determine required role: default is GUEST if not specified (any member)
    const minRole =
      this.reflector.getAllAndOverride<WorkspaceRole>(WORKSPACE_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? WorkspaceRole.GUEST;

    if (!hasAtLeast(member.role, minRole)) {
      throw new ForbiddenException('Insufficient workspace permissions');
    }

    return true;
  }
}
