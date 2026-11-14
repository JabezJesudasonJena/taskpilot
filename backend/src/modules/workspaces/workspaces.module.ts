import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { MailModule } from '../mail/index.js';
import { UsersModule } from '../users/index.js';
import { WorkspacesController } from './workspaces.controller.js';
import { InvitesController } from './invites.controller.js';
import { WorkspacesService } from './workspaces.service.js';
import { WorkspacesRepository } from './workspaces.repository.js';
import { WorkspaceAccessGuard } from './guards/workspace-access.guard.js';

@Module({
  imports: [PrismaModule, MailModule, UsersModule],
  controllers: [WorkspacesController, InvitesController],
  providers: [
    WorkspacesService,
    WorkspacesRepository,
    WorkspaceAccessGuard,
  ],
  exports: [WorkspacesService, WorkspacesRepository, WorkspaceAccessGuard],
})
export class WorkspacesModule {}
