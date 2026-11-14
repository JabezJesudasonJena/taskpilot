import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { HierarchyModule } from '../hierarchy/index.js';
import { WorkspacesModule } from '../workspaces/index.js';
import { TasksRepository } from './repositories/tasks.repository.js';
import { TagsRepository } from './repositories/tags.repository.js';
import { TasksService } from './services/tasks.service.js';
import { TagsService } from './services/tags.service.js';
import { TasksController } from './controllers/tasks.controller.js';
import { TagsController } from './controllers/tags.controller.js';

@Module({
  imports: [PrismaModule, HierarchyModule, WorkspacesModule],
  controllers: [TasksController, TagsController],
  providers: [TasksRepository, TagsRepository, TasksService, TagsService],
  exports: [TasksService, TagsService],
})
export class TasksModule {}
